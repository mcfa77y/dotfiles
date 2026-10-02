#!/usr/bin/env bun
/**
 * validate_yaml.ts
 *
 * Validates GitHub Actions workflow YAML files for syntax and schema structure.
 */

import { Command } from 'commander';
import yaml from 'js-yaml';

export interface ValidationReport {
  file: string;
  valid: boolean;
  jobCount?: number;
  error?: string;
}

export async function validateWorkflowYaml(filePath: string): Promise<ValidationReport> {
  try {
    const content = await Bun.file(filePath).text();
    const data = yaml.load(content);

    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      return { file: filePath, valid: false, error: 'Root must be a mapping/dictionary' };
    }

    const dict = data as Record<string, any>;
    const hasOn =
      'on' in dict || 'true' in dict || (dict as Record<string, unknown>)['on'] !== undefined;
    if (!hasOn) {
      return { file: filePath, valid: false, error: "Missing required 'on' trigger specification" };
    }

    if (!dict.jobs || typeof dict.jobs !== 'object' || Array.isArray(dict.jobs)) {
      return { file: filePath, valid: false, error: "Missing required 'jobs' mapping" };
    }

    const jobCount = Object.keys(dict.jobs).length;
    return { file: filePath, valid: true, jobCount };
  } catch (err: unknown) {
    return {
      file: filePath,
      valid: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function runCli(): Promise<void> {
  const program = new Command()
    .name('validate_yaml')
    .description('Validate GitHub Actions workflow YAML files for syntax and schema correctness.')
    .argument('[paths...]', 'Paths to YAML files or directories (defaults to .github/workflows)')
    .addHelpText(
      'after',
      `
Examples:
  $ bun run validate_yaml.ts .github/workflows/
  $ bun run validate_yaml.ts .github/workflows/ci.yml .github/workflows/deploy.yml
`,
    );

  program.parse();

  const paths = program.args.length > 0 ? program.args : ['.github/workflows'];
  const targetFiles: string[] = [];

  for (const p of paths) {
    const file = Bun.file(p);
    if (await file.exists()) {
      targetFiles.push(p);
    } else {
      // Check directory via glob
      const globPattern = p.endsWith('/') ? `${p}*.{yml,yaml}` : `${p}/**/*.{yml,yaml}`;
      const glob = new Bun.Glob(globPattern);
      for await (const matched of glob.scan('.')) {
        targetFiles.push(matched);
      }
    }
  }

  if (targetFiles.length === 0) {
    console.error('Error: No YAML workflow files found in specified paths.');
    process.exit(1);
  }

  console.log(`Validating ${targetFiles.length} workflow file(s)...\n`);
  let failureCount = 0;

  for (const file of targetFiles) {
    const res = await validateWorkflowYaml(file);
    if (res.valid) {
      console.log(`✓ ${file} is valid (${res.jobCount} jobs defined)`);
    } else {
      console.error(`✗ ${file} validation error:\n    ${res.error}`);
      failureCount++;
    }
  }

  console.log();
  if (failureCount > 0) {
    console.error(`${failureCount} workflow file(s) failed validation.`);
    process.exit(1);
  }

  console.log(`✓ All ${targetFiles.length} workflow files passed validation.`);
}

if (import.meta.main) {
  runCli().catch((err: unknown) => {
    console.error('Fatal error:', err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
}

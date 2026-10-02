#!/usr/bin/env bun
/**
 * parse_vitest_results.ts
 *
 * Decompresses and parses Vitest HTML report metadata (html.meta.json.gz).
 * Extracts failing test files, suite titles, test names, and error traces.
 */

import { gunzipSync } from 'node:zlib';
import { Command } from 'commander';

export interface VitestError {
  name?: string;
  message?: string;
  stack?: string;
}

export interface VitestTask {
  name: string;
  type: string;
  result?: {
    state?: string;
    errors?: VitestError[];
    duration?: number;
  };
  tasks?: VitestTask[];
}

export interface VitestFileResult {
  filepath: string;
  failedCount: number;
  passedCount: number;
  failures: Array<{
    ancestors: string[];
    name: string;
    message: string;
    stack?: string;
  }>;
}

export async function findMetaFile(targetPath?: string): Promise<string | null> {
  if (targetPath) {
    const file = Bun.file(targetPath);
    if (await file.exists()) return targetPath;
  }

  const searchCandidates = [
    'workspaces/frontend-app/.tests-results/html/html.meta.json.gz',
    'workspaces/backend-api/.tests-results/html/html.meta.json.gz',
    '.tests-results/html/html.meta.json.gz',
  ];

  for (const candidate of searchCandidates) {
    if (await Bun.file(candidate).exists()) {
      return candidate;
    }
  }

  return null;
}

export function extractFailuresFromTasks(
  tasks: VitestTask[],
  ancestors: string[] = [],
): Array<{ ancestors: string[]; name: string; message: string; stack?: string }> {
  const failures: Array<{ ancestors: string[]; name: string; message: string; stack?: string }> =
    [];

  for (const task of tasks) {
    const currentAncestors = task.name ? [...ancestors, task.name] : ancestors;

    if (task.result?.state === 'fail') {
      const error = task.result.errors?.[0];
      failures.push({
        ancestors,
        name: task.name,
        message: error?.message || 'Unknown failure',
        stack: error?.stack,
      });
    }

    if (task.tasks && task.tasks.length > 0) {
      failures.push(...extractFailuresFromTasks(task.tasks, currentAncestors));
    }
  }

  return failures;
}

export async function parseVitestReport(filePath: string): Promise<VitestFileResult[]> {
  const buffer = await Bun.file(filePath).arrayBuffer();
  const decompressed = gunzipSync(Buffer.from(buffer)).toString('utf8');
  const data = JSON.parse(decompressed);

  const results: VitestFileResult[] = [];
  const files: any[] = data.files || [];

  for (const file of files) {
    const failures = extractFailuresFromTasks(file.tasks || []);
    results.push({
      filepath: file.filepath || file.name,
      failedCount: failures.length,
      passedCount: (file.tasks || []).length - failures.length,
      failures,
    });
  }

  return results;
}

export async function runCli(): Promise<void> {
  const program = new Command()
    .name('parse_vitest_results')
    .description('Decompress and parse Vitest HTML report metadata (html.meta.json.gz).')
    .argument('[path]', 'Path to html.meta.json.gz report file (auto-discovered if omitted)')
    .option('-j, --json', 'Output results formatted as JSON')
    .addHelpText(
      'after',
      `
Auto-discovery search paths:
  - workspaces/frontend-app/.tests-results/html/html.meta.json.gz
  - workspaces/backend-api/.tests-results/html/html.meta.json.gz
  - .tests-results/html/html.meta.json.gz

Examples:
  $ bun run parse_vitest_results.ts
  $ bun run parse_vitest_results.ts path/to/html.meta.json.gz
  $ bun run parse_vitest_results.ts --json
`,
    );

  program.parse();

  const [pathArg] = program.args;
  const opts = program.opts<{ json?: boolean }>();

  const targetFile = await findMetaFile(pathArg);
  if (!targetFile) {
    console.error('Error: Could not locate html.meta.json.gz file.');
    process.exit(1);
  }

  try {
    const results = await parseVitestReport(targetFile);

    if (opts.json) {
      console.log(JSON.stringify(results, null, 2));
      return;
    }

    const failedFiles = results.filter((r) => r.failedCount > 0);
    console.log(`\n=== Vitest Report: ${targetFile} ===`);
    console.log(`Total test files: ${results.length} | Failing files: ${failedFiles.length}\n`);

    if (failedFiles.length === 0) {
      console.log('✓ All Vitest test suites passed.');
      return;
    }

    for (const file of failedFiles) {
      console.log(`✗ ${file.filepath} (${file.failedCount} failures):`);
      for (const fail of file.failures) {
        const suite = fail.ancestors.length > 0 ? `${fail.ancestors.join(' > ')} > ` : '';
        console.log(`    • ${suite}${fail.name}`);
        console.log(`      Error: ${fail.message}`);
      }
      console.log();
    }
  } catch (err: unknown) {
    console.error(
      'Failed to parse Vitest report:',
      err instanceof Error ? err.message : String(err),
    );
    process.exit(1);
  }
}

if (import.meta.main) {
  runCli().catch((err: unknown) => {
    console.error('Fatal error:', err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
}

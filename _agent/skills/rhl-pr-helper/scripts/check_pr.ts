#!/usr/bin/env bun
/**
 * check_pr.ts
 *
 * Fetches a GitHub PR by number or URL and validates its title and description
 * against Empo Health PR formatting rules (simulating the exact GitHub Actions CI pipeline).
 */

import { Command } from 'commander';
import { validateCommitMessage } from './lint_pr.ts';
import { fetchRemotePr, parsePrTarget, printLintErrors } from './utils.ts';

export async function checkPullRequest(prTarget: string | number): Promise<{ valid: boolean; errors: string[] }> {
  const parsed = parsePrTarget(prTarget);
  const targetLabel = parsed.repo ? `${parsed.repo}#${parsed.prNumber}` : `#${parsed.prNumber}`;

  console.log(`🔍 Fetching PR ${targetLabel} from GitHub...`);
  const prData = await fetchRemotePr(prTarget, ['number', 'title', 'body', 'url']);

  console.log(`PR Title (${prData.title.length}/72 chars): ${prData.title}`);
  console.log('Validating PR PR #%d format (simulating GitHub Actions CI pipeline)...', prData.number);

  const fullMessage = `${prData.title}\n\n${prData.body || ''}`;
  const validation = validateCommitMessage(fullMessage);

  if (!validation.valid) {
    printLintErrors(validation.errors);
    return { valid: false, errors: validation.errors };
  }

  console.log('✓ All checks passed! PR meets all Empo Health title and body formatting standards.');
  return { valid: true, errors: [] };
}

export async function runCli(): Promise<void> {
  const program = new Command()
    .name('check_pr')
    .description('Fetch and validate a GitHub PR against Empo Health CI formatting standards.')
    .argument('<pr_target>', 'PR number (e.g. 2864), repo#number (EmpoHealth/core#2864), or full GitHub PR URL')
    .addHelpText(
      'after',
      `
Examples:
  $ bun run check_pr.ts 2864
  $ bun run check_pr.ts EmpoHealth/core#2864
  $ bun run check_pr.ts https://github.com/EmpoHealth/core/pull/2864
`,
    );

  program.parse();

  const [prTarget] = program.args;
  if (!prTarget) {
    program.help();
  }

  try {
    const result = await checkPullRequest(prTarget!);
    process.exit(result.valid ? 0 : 1);
  } catch (err: unknown) {
    console.error('Execution error:', err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

if (import.meta.main) {
  runCli().catch((err: unknown) => {
    console.error('Fatal error:', err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
}

#!/usr/bin/env bun
/**
 * reopen_pr.ts
 *
 * Closes and immediately reopens a GitHub PR using the `gh` CLI via Bun.$.
 * Forces GitHub Actions to re-evaluate and trigger workflows without empty commits.
 */

import { $ } from 'bun';
import { Command } from 'commander';
import { fetchRemotePr, parsePrTarget } from './utils.ts';

export async function bouncePullRequest(prTarget: string | number): Promise<void> {
  const parsed = parsePrTarget(prTarget);
  const targetArg = parsed.repo ? `${parsed.repo}#${parsed.prNumber}` : String(parsed.prNumber);

  console.log(`🔍 Fetching PR #${parsed.prNumber} status...`);
  const prData = await fetchRemotePr(prTarget, ['number', 'title', 'state', 'url']);

  console.log(`Target: ${prData.title} (${prData.url})`);
  console.log(`Current state: ${prData.state}`);

  if (prData.state === 'MERGED') {
    throw new Error(`Cannot bounce PR #${parsed.prNumber}: PR is already MERGED.`);
  }

  if (prData.state === 'OPEN') {
    console.log(`Closing PR #${parsed.prNumber}...`);
    await $`gh pr close ${targetArg}`;
  }

  console.log(`Reopening PR #${parsed.prNumber}...`);
  await $`gh pr reopen ${targetArg}`;

  console.log(`✓ Successfully bounced PR #${parsed.prNumber}. CI workflows triggered.`);
}

export async function runCli(): Promise<void> {
  const program = new Command()
    .name('reopen_pr')
    .description(
      'Close and immediately reopen a GitHub PR to trigger CI workflow runs without empty commits.',
    )
    .argument('<pr_target>', 'PR number (e.g. 2864), repo#number, or full PR URL')
    .addHelpText(
      'after',
      `
Examples:
  $ bun run reopen_pr.ts 2864
  $ bun run reopen_pr.ts EmpoHealth/core#2864
  $ bun run reopen_pr.ts https://github.com/EmpoHealth/core/pull/2864
`,
    );

  program.parse();

  const [prTarget] = program.args;
  if (!prTarget) {
    program.help();
  }

  try {
    await bouncePullRequest(prTarget!);
    process.exit(0);
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

#!/usr/bin/env bun
/**
 * update_pr.ts
 *
 * Validates a formatted PR message file or text, cleans any trailing whitespace,
 * updates the PR on GitHub via `gh pr edit`, and re-verifies the live PR remotely.
 */

import { Command } from 'commander';
import { validateCommitMessage } from './lint_pr.ts';
import { applyRemotePr, fetchRemotePr, parsePrTarget, printLintErrors } from './utils.ts';

export async function updatePullRequest(
  prTarget: string | number,
  content: string,
): Promise<{ success: boolean; errors: string[] }> {
  const parsed = parsePrTarget(prTarget);
  const targetLabel = parsed.repo ? `${parsed.repo}#${parsed.prNumber}` : `#${parsed.prNumber}`;

  // Clean trailing carriage returns / spaces while preserving structural newlines
  const cleanedContent = content
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .join('\n');

  console.log(`Validating message for PR ${targetLabel}...`);
  const validation = validateCommitMessage(cleanedContent);

  if (!validation.valid) {
    console.error('Validation failed! Cannot update PR with invalid format.');
    printLintErrors(validation.errors);
    return { success: false, errors: validation.errors };
  }

  const lines = cleanedContent.split(/\r?\n/);
  const title = lines[0] || '';
  const body = lines.slice(1).join('\n').replace(/^\n+/, '').trimEnd();

  console.log(`Updating PR ${targetLabel} on GitHub...`);
  await applyRemotePr(prTarget, { title, body });

  console.log(`Verifying PR ${targetLabel} after update...`);
  const remote = await fetchRemotePr(prTarget, ['number', 'title', 'body']);
  // Emulate exact CI pipeline: printf '%s\n\n%s\n' "${PR_TITLE}" "${PR_BODY}"
  const remoteFullMessage = `${remote.title}\n\n${remote.body || ''}\n`;
  const remoteValidation = validateCommitMessage(remoteFullMessage);

  if (!remoteValidation.valid) {
    console.error('Remote verification failed after update:');
    printLintErrors(remoteValidation.errors);
    return { success: false, errors: remoteValidation.errors };
  }

  console.log(`✓ PR ${targetLabel} successfully updated and verified! All checks passed.`);
  return { success: true, errors: [] };
}

export async function runCli(): Promise<void> {
  const program = new Command()
    .name('update_pr')
    .description('Validate a message file and update a GitHub PR remotely via gh CLI.')
    .argument('<pr_target>', 'PR number (e.g. 2864), repo#number, or full PR URL')
    .argument(
      '[message_file]',
      'Path to file containing full formatted commit/PR message (reads stdin if omitted)',
    )
    .option('-s, --string <text>', 'Pass full message string directly via CLI')
    .addHelpText(
      'after',
      `
Examples:
  $ bun run update_pr.ts 2864 message.txt
  $ bun run update_pr.ts EmpoHealth/core#2864 /tmp/pr_body.md
  $ cat message.txt | bun run update_pr.ts 2864
`,
    );

  program.parse();

  const [prTarget, fileArg] = program.args;
  const opts = program.opts<{ string?: string }>();

  if (!prTarget) {
    program.help();
  }

  let content = '';
  if (opts.string) {
    content = opts.string;
  } else if (fileArg) {
    try {
      content = await Bun.file(fileArg).text();
    } catch (err: unknown) {
      console.error(
        `Error reading file '${fileArg}': ${err instanceof Error ? err.message : String(err)}`,
      );
      process.exit(1);
    }
  } else if (!process.stdin.isTTY) {
    content = await Bun.stdin.text();
  } else {
    console.error('Error: Please provide a message file, --string, or pipe via stdin.');
    program.help();
  }

  try {
    const result = await updatePullRequest(prTarget!, content);
    process.exit(result.success ? 0 : 1);
  } catch (err: unknown) {
    console.error('Execution error:', err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

if (import.meta.main) {
  try {
    await runCli();
  } catch (err: unknown) {
    console.error('Fatal error:', err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

#!/usr/bin/env node
/**
 * update_pr.js
 *
 * Validates a formatted PR message file against Empo Health PR format rules,
 * cleans any trailing whitespace from the body, updates the PR on GitHub via `gh pr edit`,
 * and re-verifies the live PR remotely.
 *
 * Usage:
 *   node update_pr.js <pr_number> <path_to_message.txt>
 */

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { validateCommitMessage } from './lint_pr.js';

/**
 * Pretty-prints an array of lint error messages to stderr.
 *
 * @param {string[]} errors - List of error messages to log
 */
function printErrors(errors) {
  console.error();
  for (const error of errors) {
    const lines = error.split('\n');
    console.error(`✗ ${lines[0]}`);
    for (const line of lines.slice(1)) {
      console.error(`    ${line}`);
    }
    console.error();
  }
  console.error(`Found ${errors.length} errors`);
}

function main() {
  const prTarget = process.argv[2];
  const messagePath = process.argv[3];

  if (!prTarget || !messagePath || prTarget === '-h' || prTarget === '--help') {
    console.error('Usage: node update_pr.js <pr_number> <message_file>');
    process.exit(1);
  }

  let rawMessage;
  try {
    rawMessage = readFileSync(messagePath, 'utf8');
  } catch (err) {
    console.error(`Error: Cannot read message file '${messagePath}': ${err.message}`);
    process.exit(1);
  }

  console.log(`Validating message file '${messagePath}' before updating PR #${prTarget}...`);
  const localResult = validateCommitMessage(rawMessage);
  if (!localResult.valid) {
    printErrors(localResult.errors);
    process.exit(1);
  }

  const lines = rawMessage.split(/\r?\n/);
  const title = lines[0] || '';
  // Body begins after the title and blank line, trimmed of trailing whitespace/newlines
  const body = lines.slice(2).join('\n').trimEnd();

  console.log(`Updating PR #${prTarget} with title and body via gh...`);
  try {
    execFileSync('gh', ['pr', 'edit', String(prTarget), '--title', title, '--body', body], {
      stdio: 'inherit',
    });
  } catch (err) {
    console.error(`Failed to update PR #${prTarget}: ${err.message}`);
    process.exit(1);
  }

  console.log(`\nVerifying PR #${prTarget} after update...`);
  const rawPR = execFileSync(
    'gh',
    ['pr', 'view', String(prTarget), '--json', 'number,title,body'],
    { encoding: 'utf8' },
  );
  const remotePR = JSON.parse(rawPR);

  const ghaCommitMessage = `${remotePR.title}\n\n${remotePR.body}\n`;
  const remoteResult = validateCommitMessage(ghaCommitMessage);

  if (!remoteResult.valid) {
    console.error('\nRemote verification failed after update:');
    printErrors(remoteResult.errors);
    process.exit(1);
  }

  console.log('\n✓ PR successfully updated and verified! All checks passed.');
}

main();

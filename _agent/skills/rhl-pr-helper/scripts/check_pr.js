#!/usr/bin/env node
/**
 * check_pr.js
 *
 * Fetches a GitHub Pull Request by number/URL and validates its title and description
 * against Empo Health PR formatting rules (simulating the exact GitHub Actions CI pipeline).
 *
 * Usage:
 *   node check_pr.js <pr_number>
 *   node check_pr.js https://github.com/<owner>/<repo>/pull/<number>
 */

import { execFileSync } from 'node:child_process';
import { validateCommitMessage } from './lint_pr.js';

/**
 * @typedef {Object} PullRequestData
 * @property {number} number - The pull request number
 * @property {string} title - The pull request title
 * @property {string} body - The pull request markdown body
 * @property {string} url - The GitHub web URL
 * @property {string} baseRefName - Base branch name
 * @property {string} headRefName - Head branch name
 */

/**
 * Fetches pull request information using the GitHub CLI (`gh`).
 *
 * @param {string | number} prTarget - PR number or GitHub PR URL
 * @returns {PullRequestData} Parsed PR metadata
 */
function getPRData(prTarget) {
  const ghArgs = ['pr', 'view', String(prTarget), '--json', 'number,title,body,url,baseRefName,headRefName'];
  try {
    const raw = execFileSync('gh', ghArgs, { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
    return JSON.parse(raw);
  } catch (err) {
    throw new Error(`Failed to fetch PR #${prTarget}: ${err.stderr || err.message}`);
  }
}

function main() {
  const target = process.argv[2];
  if (!target || target === '-h' || target === '--help') {
    console.error('Usage: node check_pr.js <pr_number | pr_url>');
    process.exit(1);
  }

  console.log(`Fetching PR #${target} details...`);
  const pr = getPRData(target);

  const title = pr.title || '';
  const body = pr.body || '';

  console.log(`PR Title (${title.length}/72 chars): ${title}`);
  if (title.length > 72) {
    console.warn(`⚠️  Warning: Title exceeds 72 character limit (${title.length} > 72)`);
  }

  // Check for trailing characters or lines under 'Reviews and Merging'
  if (body.includes('Reviews and Merging')) {
    const tail = body.split('Reviews and Merging')[1] || '';
    const cleanTail = tail.replace(/^[\s\-]+/, '');
    if (cleanTail.length > 0) {
      console.warn(`⚠️  Warning: Non-empty trailing content detected under 'Reviews and Merging':\n    ${JSON.stringify(cleanTail)}`);
    }
  }

  console.log(`Validating PR #${pr.number} format (simulating GitHub Actions CI pipeline)...`);
  // GitHub Actions passes: printf '%s\n\n%s\n' "${PR_TITLE}" "${PR_BODY}"
  const ghaCommitMessage = `${title}\n\n${body}\n`;
  const result = validateCommitMessage(ghaCommitMessage);

  if (!result.valid) {
    console.error();
    for (const error of result.errors) {
      const lines = error.split('\n');
      console.error(`✗ ${lines[0]}`);
      for (const line of lines.slice(1)) {
        console.error(`    ${line}`);
      }
      console.error();
    }
    console.error(`Found ${result.errors.length} errors`);
    process.exit(1);
  }

  console.log('\nAll checks passed');
}

main();

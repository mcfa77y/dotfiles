#!/usr/bin/env node
/**
 * format_pr.js
 *
 * Formats, scaffolds, or repairs PR titles and description bodies to strictly adhere
 * to Empo Health's GitHub Actions CI linting rules and Mergify squash-merge standards.
 *
 * Capabilities:
 * - Scaffolds compliant PR messages from scratch, a file, or piped stdin.
 * - Extracts and normalizes Linear ticket references (e.g. "RHL-XXXX", "FP-YYYY").
 * - Converts ATX top-level headers into level-3 subsections under "Detailed Description".
 * - Produces exact-length Setext header underlines:
 *     Detailed Description (20 dashes)
 *     Relevant Linear Tickets (23 dashes)
 *     Reviews and Merging (19 dashes, completely empty)
 * - Directly inspects, repairs, and updates a remote PR using `gh` via `--pr <id> [--apply]`.
 * - Validates output via `lint_pr.js` before returning or writing.
 *
 * Usage:
 *   node format_pr.js <path_to_message.md>
 *   node format_pr.js --pr 2418
 *   node format_pr.js --pr 2418 --apply
 *   node format_pr.js --title "feat: my change (RHL-1234)" --body "### Problem\n..."
 *   cat raw.md | node format_pr.js
 */

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { text } from 'node:stream/consumers';
import { fileURLToPath } from 'node:url';
import { validateCommitMessage } from './lint_pr.js';

/**
 * @typedef {Object} FormatOptions
 * @property {string} [title] - PR title
 * @property {string} [body] - Raw PR description body
 * @property {string[]} [tickets] - Explicit ticket IDs
 * @property {string} [fallbackTicket] - Default ticket if none detected (e.g. "RHL-XXXX")
 */

/**
 * @typedef {Object} FormatResult
 * @property {string} formatted - Formatted PR message (title + blank line + body)
 * @property {string} title - Formatted title
 * @property {string} body - Formatted body
 * @property {string[]} tickets - Detected or provided ticket IDs
 * @property {boolean} valid - Whether formatted message passes lint_pr checks
 * @property {string[]} errors - Validation errors if any
 */

const HEADER_DETAILED_DESCRIPTION = 'Detailed Description';
const HEADER_DETAILED_UNDERLINE = '--------------------'; // exactly 20 chars

const HEADER_RELEVANT_TICKETS = 'Relevant Linear Tickets';
const HEADER_TICKETS_UNDERLINE = '-----------------------'; // exactly 23 chars

const HEADER_REVIEWS_MERGING = 'Reviews and Merging';
const HEADER_REVIEWS_UNDERLINE = '-------------------'; // exactly 19 chars

/**
 * Extracts unique Linear/Jira ticket identifiers from text.
 *
 * @param {string} input - Text to scan
 * @returns {string[]} Array of unique ticket IDs in order of appearance
 */
export function extractTicketIds(input) {
  if (!input) return [];
  const pattern = /\b([A-Z]{2,10}-\d+)\b/g;
  const matches = input.match(pattern) || [];
  return [...new Set(matches)];
}

/**
 * Cleans and transforms raw markdown body into compliant Detailed Description content.
 * Converts level 1 and 2 headings into level 3 headings, and strips pre-existing
 * canonical headers to avoid duplicate sections.
 *
 * @param {string} rawBody - Raw body markdown
 * @returns {string} Sanitized content for Detailed Description
 */
export function sanitizeDetailedDescription(rawBody) {
  if (!rawBody || !rawBody.trim()) {
    return [
      '### Problem',
      '[Description of the problem]',
      '',
      '### Solution',
      '[Description of changes made]',
      '',
      '### Verification',
      '[Testing performed, automated test passes]',
    ].join('\n');
  }

  // Remove existing "Relevant Linear Tickets" and "Reviews and Merging" sections
  let cleaned = rawBody
    // Setext style removal
    .replace(/(?:^|\n)Relevant Linear Tickets\n[=-]+[\s\S]*?(?=\n(?:Detailed Description|Reviews and Merging|$))/gi, '')
    .replace(/(?:^|\n)Reviews and Merging\n[=-]+[\s\S]*/gi, '')
    .replace(/(?:^|\n)Detailed Description\n[=-]+\n*/gi, '')
    // ATX style removal
    .replace(/(?:^|\n)#{1,6}\s+Relevant Linear Tickets[\s\S]*?(?=\n#{1,6}\s+|$)/gi, '')
    .replace(/(?:^|\n)#{1,6}\s+Reviews and Merging[\s\S]*/gi, '')
    .replace(/(?:^|\n)#{1,6}\s+Detailed Description\n*/gi, '');

  // Convert any remaining Setext headings (e.g. "Section\n---") to level 3 ATX ("### Section")
  cleaned = cleaned.replace(/(?:^|\n)([^\n#]+)\n([=-]{3,})\n/g, (match, headingText, underline) => {
    return `\n### ${headingText.trim()}\n`;
  });

  // Convert level 1 or 2 ATX headings ("# Section" or "## Section") to level 3 ("### Section")
  cleaned = cleaned.replace(/(^|\n)#{1,2}\s+([^\n]+)/g, '$1### $2');

  // Trim leading/trailing blank lines
  return cleaned.trim();
}

/**
 * Formats a PR title, body, and tickets into strict Empo Health format.
 *
 * @param {FormatOptions} options - Formatting inputs
 * @returns {FormatResult} Formatted message and validation result
 */
export function formatPullRequest(options) {
  let title = (options.title || '').trim();

  // Strip trailing period from title
  title = title.replace(/\.+$/, '');

  // Discover ticket IDs from explicit options, title, and body
  const detectedTickets = [
    ...(options.tickets || []),
    ...extractTicketIds(title),
    ...extractTicketIds(options.body || ''),
  ];
  const uniqueTickets = [...new Set(detectedTickets)];

  if (uniqueTickets.length === 0 && options.fallbackTicket) {
    uniqueTickets.push(options.fallbackTicket);
  }

  // If title has no ticket reference but tickets were found, append if length permits
  if (uniqueTickets.length > 0 && !/\b[A-Z]{2,10}-\d+\b/.test(title) && title.length > 0) {
    const ticketTag = ` (${uniqueTickets[0]})`;
    if (title.length + ticketTag.length <= 72) {
      title += ticketTag;
    }
  }

  const detailedDescriptionContent = sanitizeDetailedDescription(options.body || '');

  const ticketSectionContent =
    uniqueTickets.length > 0
      ? `This change contributes to ${uniqueTickets.join(', ')}.`
      : 'This change contributes to RHL-XXXX.';

  const formattedBody = [
    HEADER_DETAILED_DESCRIPTION,
    HEADER_DETAILED_UNDERLINE,
    '',
    detailedDescriptionContent,
    '',
    HEADER_RELEVANT_TICKETS,
    HEADER_TICKETS_UNDERLINE,
    '',
    ticketSectionContent,
    '',
    HEADER_REVIEWS_MERGING,
    HEADER_REVIEWS_UNDERLINE,
  ].join('\n');

  const fullMessage = title ? `${title}\n\n${formattedBody}\n` : `${formattedBody}\n`;

  const validation = validateCommitMessage(fullMessage);

  return {
    formatted: fullMessage,
    title,
    body: formattedBody,
    tickets: uniqueTickets,
    valid: validation.valid,
    errors: validation.errors,
  };
}

/**
 * Fetches PR details from GitHub using gh CLI.
 *
 * @param {string|number} prId - PR number
 * @returns {{ title: string, body: string }}
 */
function fetchRemotePr(prId) {
  try {
    const output = execFileSync('gh', ['pr', 'view', String(prId), '--json', 'title,body'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'inherit'],
    });
    return JSON.parse(output);
  } catch (err) {
    throw new Error(`Failed to fetch PR #${prId} via gh: ${err.message}`);
  }
}

/**
 * Applies formatted title and body to a PR via gh CLI.
 *
 * @param {string|number} prId - PR number
 * @param {string} title - Formatted title
 * @param {string} body - Formatted body
 */
function applyRemotePr(prId, title, body) {
  try {
    execFileSync('gh', ['pr', 'edit', String(prId), '--title', title, '--body', body], {
      stdio: 'inherit',
    });
  } catch (err) {
    throw new Error(`Failed to update PR #${prId} via gh: ${err.message}`);
  }
}

/**
 * CLI Entrypoint.
 */
async function main() {
  const args = process.argv.slice(2);

  if (args.includes('-h') || args.includes('--help')) {
    console.log(`Usage:
  node format_pr.js <file_path>                     # Format local markdown file
  node format_pr.js --pr <PR_NUMBER>                # Fetch remote PR, format, and display
  node format_pr.js --pr <PR_NUMBER> --apply        # Fetch remote PR, format, and apply via gh
  node format_pr.js --title "..." --body "..."      # Format explicit title and body
  cat raw.md | node format_pr.js                    # Format from stdin

Options:
  --pr <number>          Fetch PR title and body from GitHub
  --apply                Apply formatted message to GitHub PR (requires --pr)
  --title <string>       Set PR title
  --body <string>        Set PR body
  --ticket <string>      Specify Linear ticket ID (e.g. RHL-1234)
  --output <file_path>   Write formatted message to file instead of stdout
  -h, --help             Show this help message
`);
    process.exit(0);
  }

  let title = '';
  let body = '';
  let prNumber = null;
  let apply = false;
  let outputFile = null;
  const tickets = [];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--pr' && args[i + 1]) {
      prNumber = args[++i];
    } else if (arg === '--apply') {
      apply = true;
    } else if (arg === '--title' && args[i + 1]) {
      title = args[++i];
    } else if (arg === '--body' && args[i + 1]) {
      body = args[++i];
    } else if (arg === '--ticket' && args[i + 1]) {
      tickets.push(args[++i]);
    } else if (arg === '--output' && args[i + 1]) {
      outputFile = args[++i];
    } else if (!arg.startsWith('-') && !prNumber && !body) {
      // Treat as input file path
      const filePath = arg;
      const content = readFileSync(filePath, 'utf8');
      const lines = content.split(/\r?\n/);
      title = lines[0] || '';
      body = lines.slice(1).join('\n');
    }
  }

  if (prNumber) {
    const remote = fetchRemotePr(prNumber);
    title = title || remote.title;
    body = body || remote.body;
  } else if (!title && !body && !process.stdin.isTTY) {
    const stdinContent = await text(process.stdin);
    const lines = stdinContent.split(/\r?\n/);
    title = lines[0] || '';
    body = lines.slice(1).join('\n');
  }

  if (!title && !body) {
    console.error('Error: No input provided. Provide a file path, --pr <id>, --title/--body, or pipe via stdin.');
    process.exit(1);
  }

  const result = formatPullRequest({
    title,
    body,
    tickets,
  });

  if (!result.valid) {
    console.error('Warning: Formatted message produced validation warnings:');
    for (const err of result.errors) {
      console.error(`  - ${err}`);
    }
  }

  if (prNumber && apply) {
    if (!result.valid) {
      console.error('Cannot apply formatted message to PR due to validation errors.');
      process.exit(1);
    }
    console.log(`Applying formatted title and body to PR #${prNumber}...`);
    applyRemotePr(prNumber, result.title, result.body);
    console.log(`✓ PR #${prNumber} updated successfully.`);
  } else if (outputFile) {
    writeFileSync(outputFile, result.formatted, 'utf8');
    console.log(`✓ Formatted message written to ${outputFile}`);
  } else {
    process.stdout.write(result.formatted);
  }

  process.exit(result.valid ? 0 : 1);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((err) => {
    console.error(`Fatal: ${err.message}`);
    process.exit(1);
  });
}

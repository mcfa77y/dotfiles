#!/usr/bin/env bun
/**
 * format_pr.ts
 *
 * Formats, scaffolds, and standardizes PR descriptions and titles to ensure strict
 * compliance with Empo Health CI linting rules and Mergify squash-merge standards.
 *
 * Can format local files, stdin streams, or fetch remote GitHub PRs, format them,
 * and optionally apply the changes directly back to GitHub.
 */

import { Command } from 'commander';
import { validateCommitMessage } from './lint_pr.ts';
import { applyRemotePr, fetchRemotePr, parsePrTarget } from './utils.ts';

export interface FormatOptions {
  title?: string;
  body?: string;
  tickets?: string[];
  fallbackTicket?: string;
}

export interface FormatResult {
  formatted: string;
  title: string;
  body: string;
  tickets: string[];
  valid: boolean;
  errors: string[];
}

const HEADER_DETAILED_DESCRIPTION = 'Detailed Description';
const HEADER_DETAILED_UNDERLINE = '--------------------'; // exactly 20 chars

const HEADER_RELEVANT_TICKETS = 'Relevant Linear Tickets';
const HEADER_TICKETS_UNDERLINE = '-----------------------'; // exactly 23 chars

const HEADER_REVIEWS_MERGING = 'Reviews and Merging';
const HEADER_REVIEWS_UNDERLINE = '-------------------'; // exactly 19 chars

/**
 * Extracts unique Linear/Jira ticket identifiers from text.
 */
export function extractTicketIds(input: string): string[] {
  if (!input) return [];
  const pattern = /\b([A-Z]{2,10}-\d+)\b/g;
  const matches = input.match(pattern) || [];
  return [...new Set(matches)];
}

/**
 * Cleans and transforms raw markdown body into compliant Detailed Description content.
 * Converts level 1 and 2 headings into level 3 headings, and strips pre-existing
 * canonical headers to avoid duplicate sections.
 */
export function sanitizeDetailedDescription(rawBody: string): string {
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
  cleaned = cleaned.replace(/(?:^|\n)([^\n#]+)\n([=-]{3,})\n/g, (_match, headingText) => {
    return `\n### ${headingText.trim()}\n`;
  });

  // Convert level 1 or 2 ATX headings ("# Section" or "## Section") to level 3 ("### Section")
  cleaned = cleaned.replace(/(^|\n)#{1,2}\s+([^\n]+)/g, '$1### $2');

  return cleaned.trim();
}

/**
 * Formats a PR title, body, and tickets into strict Empo Health format.
 */
export function formatPullRequest(options: FormatOptions): FormatResult {
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

export async function runCli(): Promise<void> {
  const program = new Command()
    .name('format_pr')
    .description('Format, scaffold, or update PR markdown to meet Empo Health CI standards.')
    .argument('[file]', 'Path to local markdown / commit file to format')
    .option('-p, --pr <target>', 'Fetch PR title and body from GitHub by number or URL')
    .option('-a, --apply', 'Apply formatted title and body directly to GitHub PR (requires --pr or PR target)')
    .option('-t, --title <title>', 'Explicit PR title')
    .option('-b, --body <body>', 'Explicit PR body')
    .option('-k, --ticket <tickets...>', 'Explicit Linear ticket ID(s) (e.g. RHL-4460)')
    .option('-o, --output <file>', 'Write formatted message to file instead of stdout')
    .option('-d, --dry-run', 'Preview changes without applying remotely')
    .addHelpText(
      'after',
      `
Examples:
  # Format a local markdown file and print to stdout
  $ bun run format_pr.ts description.md

  # Fetch remote PR #2864, format, and display
  $ bun run format_pr.ts --pr 2864

  # Fetch remote PR, format, and update GitHub directly
  $ bun run format_pr.ts --pr 2864 --apply

  # Format raw string inputs
  $ bun run format_pr.ts --title "feat: add user auth" --body "Added auth module." --ticket RHL-1234

  # Pipe through stdin
  $ cat raw_body.md | bun run format_pr.ts --title "fix: prevent memory leak"
`,
    );

  program.parse();

  const [fileArg] = program.args;
  const opts = program.opts<{
    pr?: string;
    apply?: boolean;
    title?: string;
    body?: string;
    ticket?: string[];
    output?: string;
    dryRun?: boolean;
  }>();

  let title = opts.title || '';
  let body = opts.body || '';
  let prTarget = opts.pr || null;
  const tickets: string[] = opts.ticket || [];

  if (fileArg && !title && !body && !prTarget) {
    // Check if positional argument is a PR number/URL
    try {
      const parsed = parsePrTarget(fileArg);
      prTarget = fileArg;
    } catch {
      // It's a file
      try {
        const fileContent = await Bun.file(fileArg).text();
        const lines = fileContent.split(/\r?\n/);
        title = lines[0] || '';
        body = lines.slice(1).join('\n');
      } catch (err: unknown) {
        console.error(`Error: Cannot read file '${fileArg}': ${err instanceof Error ? err.message : String(err)}`);
        process.exit(1);
      }
    }
  }

  if (prTarget) {
    console.error(`Fetching PR #${prTarget} from GitHub...`);
    const remote = await fetchRemotePr(prTarget, ['title', 'body']);
    title = title || remote.title;
    body = body || remote.body;
  } else if (!title && !body && !process.stdin.isTTY) {
    const stdinContent = await Bun.stdin.text();
    const lines = stdinContent.split(/\r?\n/);
    title = lines[0] || '';
    body = lines.slice(1).join('\n');
  }

  if (!title && !body) {
    console.error('Error: No input provided. Supply a file, --pr <id>, --title/--body, or pipe via stdin.');
    process.exit(1);
  }

  const result = formatPullRequest({
    title,
    body,
    tickets,
  });

  if (!result.valid) {
    console.error('⚠️  Warning: Formatted message produced validation warnings:');
    for (const err of result.errors) {
      console.error(`  ✗ ${err}`);
    }
    console.error();
  }

  if (prTarget && opts.apply && !opts.dryRun) {
    if (!result.valid) {
      console.error('Cannot apply formatted message to PR due to validation errors.');
      process.exit(1);
    }
    console.error(`Applying formatted title and body to PR #${prTarget}...`);
    await applyRemotePr(prTarget, { title: result.title, body: result.body });
    console.error(`✓ PR #${prTarget} updated successfully.`);
  } else if (opts.output) {
    await Bun.write(opts.output, result.formatted);
    console.error(`✓ Formatted message written to ${opts.output}`);
  } else {
    process.stdout.write(result.formatted);
  }

  process.exit(result.valid ? 0 : 1);
}

if (import.meta.main) {
  runCli().catch((err: unknown) => {
    console.error('Fatal error:', err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
}

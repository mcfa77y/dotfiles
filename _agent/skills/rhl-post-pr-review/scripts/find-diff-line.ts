#!/usr/bin/env bun
/**
 * find-diff-line.ts
 *
 * Locates exact line numbers within GitHub PR diff hunks for target files and patterns.
 * Ensures lines can be safely commented on without triggering GitHub API 422 errors.
 *
 * Uses built-in node:util parseArgs for zero external dependencies.
 */

import { parseArgs } from 'node:util';

export interface DiffHunkLine {
  rightLine: number | null;
  leftLine: number | null;
  type: 'added' | 'deleted' | 'context';
  content: string;
}

export interface DiffMatch {
  file: string;
  line: number;
  side: 'RIGHT' | 'LEFT';
  type: 'added' | 'deleted' | 'context';
  text: string;
}

/**
 * Parses unified diff patch text into line-by-line hunk mappings.
 */
export function parsePatch(patch: string): DiffHunkLine[] {
  const lines: DiffHunkLine[] = [];
  const hunkHeaderRegex = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/;

  let currentLeft = 0;
  let currentRight = 0;

  for (const rawLine of patch.split('\n')) {
    const match = rawLine.match(hunkHeaderRegex);
    if (match) {
      currentLeft = parseInt(match[1], 10);
      currentRight = parseInt(match[3], 10);
      continue;
    }

    if (rawLine.startsWith('+')) {
      lines.push({
        rightLine: currentRight,
        leftLine: null,
        type: 'added',
        content: rawLine.slice(1),
      });
      currentRight++;
    } else if (rawLine.startsWith('-')) {
      lines.push({
        rightLine: null,
        leftLine: currentLeft,
        type: 'deleted',
        content: rawLine.slice(1),
      });
      currentLeft++;
    } else if (rawLine.startsWith(' ')) {
      lines.push({
        rightLine: currentRight,
        leftLine: currentLeft,
        type: 'context',
        content: rawLine.slice(1),
      });
      currentRight++;
      currentLeft++;
    }
  }

  return lines;
}

/**
 * Searches parsed diff lines for a given substring or regex pattern.
 */
export function searchHunkLines(
  file: string,
  hunkLines: DiffHunkLine[],
  pattern?: string | RegExp,
  targetSide: 'RIGHT' | 'LEFT' = 'RIGHT',
): DiffMatch[] {
  const matches: DiffMatch[] = [];
  const regex = typeof pattern === 'string' ? new RegExp(pattern) : pattern;

  for (const line of hunkLines) {
    const lineNum = targetSide === 'RIGHT' ? line.rightLine : line.leftLine;
    if (lineNum === null) {
      continue;
    }

    if (regex && !regex.test(line.content)) {
      continue;
    }

    matches.push({
      file,
      line: lineNum,
      side: targetSide,
      type: line.type,
      text: line.content,
    });
  }

  return matches;
}

/**
 * Extracts PR number and optional repository from a PR number or full URL.
 */
export function parsePrTarget(target: string): { repo: string | null; prNumber: number } {
  const cleaned = target.trim();
  const urlMatch = cleaned.match(/github\.com\/([^/]+\/[^/]+)\/pull\/(\d+)/);
  if (urlMatch) {
    return { repo: urlMatch[1], prNumber: parseInt(urlMatch[2], 10) };
  }

  if (/^\d+$/.test(cleaned)) {
    return { repo: null, prNumber: parseInt(cleaned, 10) };
  }

  if (cleaned.includes('#')) {
    const [repoPart, numPart] = cleaned.split('#', 2);
    if (/^\d+$/.test(numPart.trim())) {
      return { repo: repoPart.trim() || null, prNumber: parseInt(numPart.trim(), 10) };
    }
  }

  throw new Error(
    `Invalid PR target: "${target}". Expected a PR number, URL, or owner/repo#number.`,
  );
}

async function detectDefaultRepo(): Promise<string> {
  const proc = Bun.spawn(
    ['gh', 'repo', 'view', '--json', 'nameWithOwner', '-q', '.nameWithOwner'],
    {
      stdout: 'pipe',
      stderr: 'pipe',
    },
  );
  const stdout = await new Response(proc.stdout).text();
  const exitCode = await proc.exited;
  if (exitCode !== 0 || !stdout.trim()) {
    throw new Error('Could not detect repository. Please supply --repo <owner/repo> explicitly.');
  }
  return stdout.trim();
}

async function fetchPrFiles(
  repo: string,
  prNumber: number,
): Promise<Array<{ filename: string; patch?: string }>> {
  const proc = Bun.spawn(['gh', 'api', `/repos/${repo}/pulls/${prNumber}/files`, '--paginate'], {
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const stdout = await new Response(proc.stdout).text();
  const exitCode = await proc.exited;
  if (exitCode !== 0) {
    const stderr = await new Response(proc.stderr).text();
    throw new Error(`Failed to fetch PR files from GitHub API: ${stderr.trim()}`);
  }
  return JSON.parse(stdout);
}

export function printHelp(): void {
  console.log(`
Usage: find-diff-line [options] <pr>

Find exact line numbers within PR diff hunks for inline review comments.

Arguments:
  <pr>                   PR number, GitHub PR URL, or owner/repo#number

Options:
  -f, --file <name>      Filter by file name or substring match
  -p, --pattern <regex>  Search text or regex pattern within changed lines
  -s, --side <side>      Target diff side: RIGHT (default, new lines) or LEFT (old lines)
  -r, --repo <repo>      GitHub repository in owner/repo format
      --json             Output results in JSON format
  -h, --help             Show this help message
`);
}

export async function runCli(args: string[] = process.argv.slice(2)): Promise<void> {
  const { values, positionals } = parseArgs({
    args,
    options: {
      file: { type: 'string', short: 'f' },
      pattern: { type: 'string', short: 'p' },
      side: { type: 'string', short: 's', default: 'RIGHT' },
      repo: { type: 'string', short: 'r' },
      json: { type: 'boolean', default: false },
      help: { type: 'boolean', short: 'h', default: false },
    },
    allowPositionals: true,
  });

  if (values.help || positionals.length === 0) {
    printHelp();
    return;
  }

  const prTarget = positionals[0];
  const { repo: parsedRepo, prNumber } = parsePrTarget(prTarget);
  const repo = values.repo || parsedRepo || (await detectDefaultRepo());
  const targetSide = values.side?.toUpperCase() === 'LEFT' ? 'LEFT' : 'RIGHT';

  const files = await fetchPrFiles(repo, prNumber);
  const filteredFiles = values.file
    ? files.filter((f) => f.filename.toLowerCase().includes(values.file!.toLowerCase()))
    : files;

  const allMatches: DiffMatch[] = [];

  for (const f of filteredFiles) {
    if (!f.patch) continue;
    const hunkLines = parsePatch(f.patch);
    const matches = searchHunkLines(f.filename, hunkLines, values.pattern, targetSide);
    allMatches.push(...matches);
  }

  if (values.json) {
    console.log(JSON.stringify(allMatches, null, 2));
    return;
  }

  if (allMatches.length === 0) {
    console.log(`No matching diff hunk lines found for PR #${prNumber} in ${repo}.`);
    return;
  }

  console.log(`Found ${allMatches.length} matching line(s) in PR #${prNumber} (${repo}):\n`);
  for (const m of allMatches) {
    const prefix = m.type === 'added' ? '+' : m.type === 'deleted' ? '-' : ' ';
    console.log(`${m.file}:${m.line} [${m.side}] ${prefix} ${m.text.trim()}`);
  }
}

if (import.meta.main) {
  runCli().catch((err) => {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  });
}

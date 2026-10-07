#!/usr/bin/env bun
/**
 * create_pr.ts
 *
 * Creates a GitHub Pull Request from a local message file, stdin, or inline arguments.
 * Ensures the title and body strictly pass Empo Health PR lint checks before submission,
 * sets draft status, assigns default or custom reviewers, and outputs the resulting PR URL.
 */

import { $ } from 'bun';
import { Command } from 'commander';
import { validateCommitMessage } from './lint_pr.ts';
import { printLintErrors } from './utils.ts';

export const DEFAULT_REVIEWERS = ['pm-pp', 'simon57b', 'singhmadhurima123', 'jofay-empo'];

export const INFRA_REVIEWER = 'edahlseng';

export interface CreatePrOptions {
  messageFile?: string;
  title?: string;
  body?: string;
  draft?: boolean;
  base?: string;
  reviewers?: string[];
  addInfraReviewer?: boolean;
}

export interface CreatePrResult {
  success: boolean;
  prUrl?: string;
  prNumber?: number;
  errors: string[];
}

/**
 * Checks whether any modified files match infrastructure or CI patterns.
 */
export async function hasInfraChanges(base = 'origin/main'): Promise<boolean> {
  try {
    const output = await $`git diff --name-only ${base}...HEAD`.quiet().text();
    const files = output
      .split('\n')
      .map((f) => f.trim())
      .filter(Boolean);
    return files.some((f) => /\.(tf|ya?ml)$/i.test(f));
  } catch {
    return false;
  }
}

/**
 * Validates PR content and runs `gh pr create`.
 */
export async function createPullRequest(
  content: string,
  options: {
    draft?: boolean;
    base?: string;
    reviewers?: string[];
  } = {},
): Promise<CreatePrResult> {
  // Clean trailing carriage returns / spaces while preserving structural newlines
  const cleanedContent = content
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .join('\n');

  console.log('Validating PR title and body formatting...');
  const validation = validateCommitMessage(cleanedContent);

  if (!validation.valid) {
    console.error('Validation failed! Cannot create PR with invalid formatting.');
    printLintErrors(validation.errors);
    return { success: false, errors: validation.errors };
  }

  const lines = cleanedContent.split(/\r?\n/);
  const title = lines[0] || '';
  const body = lines.slice(1).join('\n').replace(/^\n+/, '');

  const baseBranch = options.base || 'main';
  const reviewers =
    options.reviewers && options.reviewers.length > 0 ? options.reviewers : DEFAULT_REVIEWERS;

  console.log(`Creating ${options.draft ? 'draft ' : ''}PR against '${baseBranch}'...`);
  console.log(`Title: ${title}`);
  console.log(`Reviewers: ${reviewers.join(', ')}`);

  try {
    const cmdArgs = [
      'gh',
      'pr',
      'create',
      '--base',
      baseBranch,
      '--title',
      title,
      '--body',
      body,
      '--reviewer',
      reviewers.join(','),
    ];

    if (options.draft) {
      cmdArgs.push('--draft');
    }

    const prUrl = (await $`${cmdArgs}`.text()).trim();
    const match = prUrl.match(/\/pull\/(\d+)$/);
    const prNumber = match ? parseInt(match[1], 10) : undefined;

    console.log(`✓ Pull request created successfully: ${prUrl}`);
    return {
      success: true,
      prUrl,
      prNumber,
      errors: [],
    };
  } catch (err: unknown) {
    let msg = 'Failed to create PR via gh CLI';
    if (err && typeof err === 'object' && 'stderr' in err && err.stderr != null) {
      msg = String(err.stderr).trim();
    } else if (err instanceof Error) {
      msg = err.message;
    }
    console.error(`✗ ${msg}`);
    return {
      success: false,
      errors: [msg],
    };
  }
}

export async function runCli(): Promise<void> {
  const program = new Command()
    .name('create_pr')
    .description('Validate PR format and create a Pull Request on GitHub via gh CLI.')
    .argument(
      '[file]',
      'Path to PR message file containing title on line 1, blank line 2, and Setext body',
    )
    .option('-d, --draft', 'Create as draft pull request (default: true)', true)
    .option('--no-draft', 'Create as ready for review (non-draft)')
    .option('-b, --base <branch>', 'Base branch (default: main)', 'main')
    .option('-r, --reviewers <reviewers>', 'Comma-separated reviewer GitHub usernames')
    .option(
      '--auto-infra',
      'Automatically add infra reviewer (edahlseng) if .tf/.yml files changed',
      true,
    )
    .option('--title <title>', 'Explicit PR title')
    .option('--body <body>', 'Explicit PR body')
    .addHelpText(
      'after',
      `
Examples:
  # Create a draft PR using a prepared message file:
  bun run create_pr.ts /path/to/pr_message.txt

  # Create a ready-for-review PR:
  bun run create_pr.ts --no-draft /path/to/pr_message.txt

  # Pipe message via stdin:
  cat /path/to/pr_message.txt | bun run create_pr.ts

  # Specify custom reviewers:
  bun run create_pr.ts -r "pm-pp,simon57b" /path/to/pr_message.txt
      `,
    );

  program.parse();

  const [filePath] = program.args;
  const opts = program.opts();

  let content = '';

  if (opts.title && opts.body) {
    content = `${opts.title}\n\n${opts.body}`;
  } else if (filePath) {
    const file = Bun.file(filePath);
    if (!(await file.exists())) {
      console.error(`Error: File not found: ${filePath}`);
      process.exit(1);
    }
    content = await file.text();
  } else if (!process.stdin.isTTY) {
    content = await Bun.stdin.text();
  } else {
    console.error(
      'Error: Please provide a PR message file, pass --title and --body, or pipe content via stdin.',
    );
    program.help();
  }

  let reviewers: string[] = [];
  if (opts.reviewers) {
    reviewers = opts.reviewers
      .split(',')
      .map((r: string) => r.trim())
      .filter(Boolean);
  } else {
    reviewers = [...DEFAULT_REVIEWERS];
    if (opts.autoInfra && (await hasInfraChanges(opts.base))) {
      console.log(
        `Detected infrastructure files changed (*.tf, *.yml). Adding '${INFRA_REVIEWER}' to reviewers.`,
      );
      if (!reviewers.includes(INFRA_REVIEWER)) {
        reviewers.push(INFRA_REVIEWER);
      }
    }
  }

  const result = await createPullRequest(content, {
    draft: opts.draft,
    base: opts.base,
    reviewers,
  });

  if (!result.success) {
    process.exit(1);
  }
}

if (import.meta.main) {
  await runCli();
}

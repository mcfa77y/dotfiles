#!/usr/bin/env bun
/**
 * cleanup-review-worktrees.ts
 *
 * Discovers and cleans up temporary review worktrees and artifacts (e.g. .git/dev-fast/reviews/...)
 * created during PR code reviews.
 */

import { existsSync, readdirSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { $ } from 'bun';
import { Command } from 'commander';

export interface WorktreeEntry {
  path: string;
  head?: string;
  branch?: string;
  bare?: boolean;
  detached?: boolean;
}

export interface ReviewCleanupItem {
  type: 'worktree' | 'artifact-directory';
  path: string;
  commit?: string;
}

export interface CleanupResult {
  cleanedWorktrees: string[];
  cleanedDirectories: string[];
  pruned: boolean;
  dryRun: boolean;
}

export interface CleanupOptions {
  cwd?: string;
  dryRun?: boolean;
  force?: boolean;
  json?: boolean;
}

/**
 * Parses output from `git worktree list --porcelain`.
 */
export function parseWorktrees(porcelainOutput: string): WorktreeEntry[] {
  const entries: WorktreeEntry[] = [];
  const blocks = porcelainOutput.trim().split(/\n\s*\n/);

  for (const block of blocks) {
    if (!block.trim()) continue;
    const entry: WorktreeEntry = { path: '' };

    for (const line of block.split('\n')) {
      const trimmed = line.trim();
      if (trimmed.startsWith('worktree ')) {
        entry.path = trimmed.slice('worktree '.length).trim();
      } else if (trimmed.startsWith('HEAD ')) {
        entry.head = trimmed.slice('HEAD '.length).trim();
      } else if (trimmed.startsWith('branch ')) {
        entry.branch = trimmed.slice('branch '.length).trim();
      } else if (trimmed === 'bare') {
        entry.bare = true;
      } else if (trimmed === 'detached') {
        entry.detached = true;
      }
    }

    if (entry.path) {
      entries.push(entry);
    }
  }

  return entries;
}

/**
 * Determines whether a worktree path is a temporary review worktree.
 */
export function isReviewWorktree(entry: WorktreeEntry): boolean {
  const normalizedPath = entry.path.replace(/\\/g, '/');

  // Guard against primary/root worktrees
  if (entry.bare) return false;

  return (
    normalizedPath.includes('/.git/dev-fast/reviews/') ||
    normalizedPath.includes('/reviews/') ||
    normalizedPath.includes('.git/dev-fast/reviews')
  );
}

/**
 * Identifies orphaned/leftover review directories in .git/dev-fast/reviews
 */
export function findReviewArtifactDirs(
  gitDirPath: string,
  activeWorktreePaths: string[],
): string[] {
  const reviewsDir = join(gitDirPath, 'dev-fast', 'reviews');
  if (!existsSync(reviewsDir)) {
    return [];
  }

  const normalizedActive = new Set(activeWorktreePaths.map((p) => resolve(p).replace(/\\/g, '/')));

  const entries = readdirSync(reviewsDir, { withFileTypes: true });
  const results: string[] = [];

  for (const item of entries) {
    if (!item.isDirectory()) continue;
    const fullPath = join(reviewsDir, item.name);
    const normalized = resolve(fullPath).replace(/\\/g, '/');

    // If this directory is not directly an active worktree root
    const isMounted = Array.from(normalizedActive).some(
      (active) => active === normalized || active.startsWith(`${normalized}/`),
    );

    if (!isMounted) {
      results.push(fullPath);
    }
  }

  return results;
}

/**
 * Performs discovery and cleanup of review worktrees and directories.
 */
export async function runReviewCleanup(options: CleanupOptions = {}): Promise<CleanupResult> {
  const targetDir = resolve(options.cwd || process.cwd());
  const dryRun = Boolean(options.dryRun);
  const force = options.force !== false;

  // Resolve common git dir
  let gitDir = '';
  try {
    const rawGitDir = await $`git -C ${targetDir} rev-parse --git-common-dir`.text();
    gitDir = resolve(targetDir, rawGitDir.trim());
  } catch {
    const rawGitDir = await $`git -C ${targetDir} rev-parse --git-dir`.text();
    gitDir = resolve(targetDir, rawGitDir.trim());
  }

  // Fetch worktrees
  const rawWorktrees = await $`git -C ${targetDir} worktree list --porcelain`.text();
  const parsed = parseWorktrees(rawWorktrees);

  const reviewWorktrees = parsed.filter(isReviewWorktree);
  const activePaths = parsed.map((w) => w.path);
  const artifactDirs = findReviewArtifactDirs(gitDir, activePaths);

  const result: CleanupResult = {
    cleanedWorktrees: reviewWorktrees.map((w) => w.path),
    cleanedDirectories: artifactDirs,
    pruned: false,
    dryRun,
  };

  if (!dryRun) {
    for (const wt of reviewWorktrees) {
      const removeArgs = ['worktree', 'remove'];
      if (force) removeArgs.push('--force');
      removeArgs.push(wt.path);

      try {
        await $`git -C ${targetDir} ${removeArgs}`.quiet();
      } catch (err) {
        console.error(`Failed to remove worktree ${wt.path}:`, err);
      }
    }

    try {
      await $`git -C ${targetDir} worktree prune`.quiet();
      result.pruned = true;
    } catch (err) {
      console.error('Failed to prune worktrees:', err);
    }

    for (const dir of artifactDirs) {
      try {
        rmSync(dir, { recursive: true, force: true });
      } catch (err) {
        console.error(`Failed to delete directory ${dir}:`, err);
      }
    }
  }

  return result;
}

export function buildCli(): Command {
  const program = new Command('cleanup-review-worktrees');

  program
    .description('Discovers and cleans up temporary review worktrees and dev-fast artifacts.')
    .option('-d, --dry-run', 'List candidate review worktrees and directories without deleting')
    .option(
      '-f, --force',
      'Force removal of review worktrees even if uncommitted changes exist',
      true,
    )
    .option('-c, --cwd <path>', 'Target repository root directory (default: current directory)')
    .option('-j, --json', 'Output results in JSON format')
    .action(async (opts) => {
      const result = await runReviewCleanup({
        dryRun: opts.dryRun,
        force: opts.force,
        cwd: opts.cwd,
        json: opts.json,
      });

      if (opts.json) {
        console.log(JSON.stringify(result, null, 2));
        return;
      }

      if (result.dryRun) {
        console.log('[Dry Run] Review cleanup candidates:');
      } else {
        console.log('Cleanup completed:');
      }

      if (result.cleanedWorktrees.length === 0 && result.cleanedDirectories.length === 0) {
        console.log('  No temporary review worktrees or review artifacts detected.');
        return;
      }

      if (result.cleanedWorktrees.length > 0) {
        console.log(`  Worktrees (${result.cleanedWorktrees.length}):`);
        for (const wt of result.cleanedWorktrees) {
          console.log(`    - ${wt}`);
        }
      }

      if (result.cleanedDirectories.length > 0) {
        console.log(`  Artifact directories (${result.cleanedDirectories.length}):`);
        for (const dir of result.cleanedDirectories) {
          console.log(`    - ${dir}`);
        }
      }

      if (!result.dryRun && result.pruned) {
        console.log('  Successfully pruned worktree references.');
      }
    });

  return program;
}

if (import.meta.main) {
  const program = buildCli();
  await program.parseAsync(process.argv);
}

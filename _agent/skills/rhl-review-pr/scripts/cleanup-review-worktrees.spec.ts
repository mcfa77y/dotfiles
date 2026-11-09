import { describe, expect, it } from 'bun:test';
import {
  findReviewArtifactDirs,
  isReviewWorktree,
  parseWorktrees,
  type WorktreeEntry,
} from './cleanup-review-worktrees';

describe('parseWorktrees', () => {
  it('parses git worktree list porcelain output into entries', () => {
    const samplePorcelain = `
worktree /Users/joe/Projects/repo
HEAD 4281680361234567890123456789012345678901
branch refs/heads/main

worktree /Users/joe/Projects/repo/.git/dev-fast/reviews/a827f4e1/head/000986f66
HEAD 000986f660f3316f4da69d1b87ec0aa909430a4e
detached

worktree /Users/joe/Projects/repo-bare
bare
`;

    const entries = parseWorktrees(samplePorcelain);
    expect(entries).toHaveLength(3);

    expect(entries[0]).toEqual({
      path: '/Users/joe/Projects/repo',
      head: '4281680361234567890123456789012345678901',
      branch: 'refs/heads/main',
    });

    expect(entries[1]).toEqual({
      path: '/Users/joe/Projects/repo/.git/dev-fast/reviews/a827f4e1/head/000986f66',
      head: '000986f660f3316f4da69d1b87ec0aa909430a4e',
      detached: true,
    });

    expect(entries[2]).toEqual({
      path: '/Users/joe/Projects/repo-bare',
      bare: true,
    });
  });

  it('returns empty array for empty input', () => {
    expect(parseWorktrees('')).toEqual([]);
    expect(parseWorktrees('   \n\n  ')).toEqual([]);
  });
});

describe('isReviewWorktree', () => {
  it('identifies dev-fast review worktrees', () => {
    const entry: WorktreeEntry = {
      path: '/Users/joe/Projects/remote-health-link/.git/dev-fast/reviews/a827f4e1-7e14-4f68-91be-9613ba6d4526/head/000986f66',
      detached: true,
    };
    expect(isReviewWorktree(entry)).toBe(true);
  });

  it('identifies generic review worktrees', () => {
    const entry: WorktreeEntry = {
      path: '/Users/joe/Projects/repo/reviews/pr-1234',
      branch: 'refs/heads/pr-1234',
    };
    expect(isReviewWorktree(entry)).toBe(true);
  });

  it('ignores regular feature worktrees', () => {
    const entry: WorktreeEntry = {
      path: '/Users/joe/Projects/empo-worktrees/rhl-4590-migrate-calling-messaging',
      branch: 'refs/heads/rhl-4590',
    };
    expect(isReviewWorktree(entry)).toBe(false);
  });

  it('ignores main repository worktree', () => {
    const entry: WorktreeEntry = {
      path: '/Users/joe/Projects/remote-health-link',
      branch: 'refs/heads/main',
    };
    expect(isReviewWorktree(entry)).toBe(false);
  });

  it('ignores bare worktrees', () => {
    const entry: WorktreeEntry = {
      path: '/Users/joe/Projects/remote-health-link/.git/dev-fast/reviews/bare-test',
      bare: true,
    };
    expect(isReviewWorktree(entry)).toBe(false);
  });
});

describe('findReviewArtifactDirs', () => {
  it('returns empty list if reviews directory does not exist', () => {
    const dirs = findReviewArtifactDirs('/nonexistent/path/.git', []);
    expect(dirs).toEqual([]);
  });
});

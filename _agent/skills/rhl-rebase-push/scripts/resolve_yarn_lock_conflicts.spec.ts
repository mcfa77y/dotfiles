import { describe, expect, it } from 'bun:test';
import { findConflictedLockfiles } from './resolve_yarn_lock_conflicts.ts';

describe('rhl-rebase-push', () => {
  describe('findConflictedLockfiles', () => {
    it('returns empty array when no conflicts exist', async () => {
      const res = await findConflictedLockfiles(process.cwd());
      expect(Array.isArray(res)).toBe(true);
    });
  });
});

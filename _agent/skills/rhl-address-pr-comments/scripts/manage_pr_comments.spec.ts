import { describe, expect, it } from 'bun:test';
import {
  type RawComment,
  formatThreadsAsMarkdown,
  groupCommentThreads,
  parsePrTarget,
  postCommentReply,
} from './manage_pr_comments.ts';

describe('manage_pr_comments', () => {
  describe('parsePrTarget', () => {
    it('parses raw PR number', () => {
      expect(parsePrTarget(2725)).toEqual({ repo: null, prNumber: 2725 });
      expect(parsePrTarget('2725')).toEqual({ repo: null, prNumber: 2725 });
      expect(parsePrTarget('#2725')).toEqual({ repo: null, prNumber: 2725 });
    });

    it('parses repo#number', () => {
      expect(parsePrTarget('EmpoHealth/core#2725')).toEqual({
        repo: 'EmpoHealth/core',
        prNumber: 2725,
      });
    });

    it('parses GitHub PR URL', () => {
      expect(parsePrTarget('https://github.com/EmpoHealth/core/pull/2725')).toEqual({
        repo: 'EmpoHealth/core',
        prNumber: 2725,
      });
      expect(parsePrTarget('https://github.com/EmpoHealth/core/pull/2725/files')).toEqual({
        repo: 'EmpoHealth/core',
        prNumber: 2725,
      });
    });

    it('throws on invalid target', () => {
      expect(() => parsePrTarget('not-a-pr')).toThrow('Unable to parse pull request target');
      expect(() => parsePrTarget('')).toThrow('Unable to parse pull request target');
    });
  });

  describe('groupCommentThreads', () => {
    const mockComments: RawComment[] = [
      {
        id: 101,
        user: { login: 'reviewer1' },
        path: '.github/workflows/ci.yml',
        line: 12,
        original_line: 12,
        side: 'RIGHT',
        body: 'Consider caching here.',
        in_reply_to_id: null,
        created_at: '2026-10-01T10:00:00Z',
      },
      {
        id: 102,
        user: { login: 'author1' },
        path: '.github/workflows/ci.yml',
        line: 12,
        original_line: 12,
        side: 'RIGHT',
        body: 'Done in abc1234.',
        in_reply_to_id: 101,
        created_at: '2026-10-01T10:30:00Z',
      },
      {
        id: 103,
        user: { login: 'reviewer2' },
        path: 'src/main.ts',
        line: 45,
        original_line: 45,
        side: 'RIGHT',
        body: 'Needs refactoring.',
        in_reply_to_id: null,
        created_at: '2026-10-01T11:00:00Z',
      },
    ];

    it('groups child comments into root threads', () => {
      const threads = groupCommentThreads(mockComments, 'author1');
      expect(threads).toHaveLength(2);

      const thread1 = threads.find((t) => t.id === 101)!;
      expect(thread1).toBeDefined();
      expect(thread1.replies).toHaveLength(1);
      expect(thread1.replies[0]!.id).toBe(102);
      expect(thread1.isAnsweredByAuthor).toBe(true);

      const thread2 = threads.find((t) => t.id === 103)!;
      expect(thread2).toBeDefined();
      expect(thread2.replies).toHaveLength(0);
      expect(thread2.isAnsweredByAuthor).toBe(false);
    });
  });

  describe('formatThreadsAsMarkdown', () => {
    it('formats markdown summary properly', () => {
      const threads = groupCommentThreads(
        [
          {
            id: 201,
            user: { login: 'reviewer' },
            path: 'test.ts',
            line: 5,
            original_line: 5,
            side: 'RIGHT',
            body: 'Fix this typo',
            in_reply_to_id: null,
            created_at: '2026-10-01T12:00:00Z',
          },
        ],
        'author',
      );

      const md = formatThreadsAsMarkdown(threads, [
        { id: 1, user: { login: 'approver' }, state: 'APPROVED', body: 'LGTM' },
      ]);
      expect(md).toContain('Total Threads: 1');
      expect(md).toContain('@approver (APPROVED)');
      expect(md).toContain('Thread #201: `test.ts` (line 5)');
      expect(md).toContain('⏳ Pending Response');
    });
  });

  describe('postCommentReply (dry-run)', () => {
    it('returns success in dry-run mode without network calls', async () => {
      const res = await postCommentReply('EmpoHealth/core', 2725, 101, 'Testing reply', true);
      expect(res.success).toBe(true);
      expect(res.dryRun).toBe(true);
      expect(res.commentId).toBe(101);
    });

    it('throws error when reply body is empty', async () => {
      await expect(postCommentReply('EmpoHealth/core', 2725, 101, '   ', true)).rejects.toThrow(
        'Reply body cannot be empty',
      );
    });
  });
});

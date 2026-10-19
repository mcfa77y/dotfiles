import { describe, expect, it } from 'bun:test';
import {
  evaluateReviewerStatus,
  formatMarkdownReport,
  formatSlackDigest,
  getLatestReviewsByUser,
  groupPrsByReviewers,
  type PullRequest,
  type Review,
} from './reviewer_prs';

describe('reviewer_prs', () => {
  describe('getLatestReviewsByUser', () => {
    it('returns the most recent review for each user', () => {
      const reviews: Review[] = [
        {
          user: { login: 'edahlseng' },
          state: 'COMMENTED',
          submitted_at: '2026-10-10T12:00:00Z',
          body: 'First comment',
        },
        {
          user: { login: 'edahlseng' },
          state: 'CHANGES_REQUESTED',
          submitted_at: '2026-10-12T15:00:00Z',
          body: 'Please fix this',
        },
        {
          user: { login: 'simon57b' },
          state: 'APPROVED',
          submitted_at: '2026-10-11T09:00:00Z',
        },
      ];

      const latest = getLatestReviewsByUser(reviews);
      expect(latest.size).toBe(2);
      expect(latest.get('edahlseng')?.state).toBe('CHANGES_REQUESTED');
      expect(latest.get('edahlseng')?.body).toBe('Please fix this');
      expect(latest.get('simon57b')?.state).toBe('APPROVED');
    });

    it('handles empty reviews array', () => {
      const latest = getLatestReviewsByUser([]);
      expect(latest.size).toBe(0);
    });
  });

  describe('evaluateReviewerStatus', () => {
    const mockPr: PullRequest = {
      number: 100,
      title: 'feat: add awesome feature',
      url: 'https://github.com/EmpoHealth/core/pull/100',
      reviewRequests: [{ login: 'edahlseng' }],
    };

    it('identifies CHANGES_REQUESTED even if review was requested', () => {
      const reviews: Review[] = [
        {
          user: { login: 'edahlseng' },
          state: 'CHANGES_REQUESTED',
          submitted_at: '2026-10-15T10:00:00Z',
          body: 'Architecture needs update',
        },
      ];

      const status = evaluateReviewerStatus(mockPr, 'edahlseng', reviews);
      expect(status.relationship).toBe('CHANGES_REQUESTED');
      expect(status.latestReviewBody).toBe('Architecture needs update');
      expect(status.reviewRequested).toBe(true);
    });

    it('identifies APPROVED status', () => {
      const reviews: Review[] = [
        {
          user: { login: 'edahlseng' },
          state: 'APPROVED',
          submitted_at: '2026-10-16T10:00:00Z',
        },
      ];

      const status = evaluateReviewerStatus(mockPr, 'edahlseng', reviews);
      expect(status.relationship).toBe('APPROVED');
    });

    it('identifies REVIEW_REQUESTED when requested without review', () => {
      const status = evaluateReviewerStatus(mockPr, 'edahlseng', []);
      expect(status.relationship).toBe('REVIEW_REQUESTED');
      expect(status.reviewRequested).toBe(true);
    });

    it('returns NONE if reviewer is neither requested nor has reviewed', () => {
      const status = evaluateReviewerStatus(mockPr, 'someone_else', []);
      expect(status.relationship).toBe('NONE');
    });
  });

  describe('groupPrsByReviewers', () => {
    it('aggregates PRs by reviewer correctly', () => {
      const pr1: PullRequest = {
        number: 101,
        title: 'fix: bug 1',
        url: 'https://github.com/EmpoHealth/core/pull/101',
        reviewRequests: [{ login: 'edahlseng' }, { login: 'simon57b' }],
      };
      const pr2: PullRequest = {
        number: 102,
        title: 'fix: bug 2',
        url: 'https://github.com/EmpoHealth/core/pull/102',
        reviewRequests: [{ login: 'edahlseng' }],
      };

      const reviewsByPr = new Map<number, Review[]>([
        [
          101,
          [
            {
              user: { login: 'edahlseng' },
              state: 'CHANGES_REQUESTED',
              submitted_at: '2026-10-12T00:00:00Z',
            },
            {
              user: { login: 'simon57b' },
              state: 'APPROVED',
              submitted_at: '2026-10-12T01:00:00Z',
            },
          ],
        ],
        [102, []],
      ]);

      const grouped = groupPrsByReviewers([pr1, pr2], reviewsByPr);

      const ed = grouped.get('edahlseng');
      expect(ed).toBeDefined();
      expect(ed?.changesRequested.length).toBe(1);
      expect(ed?.changesRequested[0].prNumber).toBe(101);
      expect(ed?.reviewRequested.length).toBe(1);
      expect(ed?.reviewRequested[0].prNumber).toBe(102);

      const simon = grouped.get('simon57b');
      expect(simon).toBeDefined();
      expect(simon?.approved.length).toBe(1);
      expect(simon?.approved[0].prNumber).toBe(101);
    });
  });

  describe('formatMarkdownReport', () => {
    it('renders single reviewer report with blockquotes and tables', () => {
      const pr: PullRequest = {
        number: 3117,
        title: 'fix: Paginate open PR retrieval in Terraform cleanup action',
        url: 'https://github.com/EmpoHealth/core/pull/3117',
        reviewRequests: [{ login: 'edahlseng' }],
      };
      const reviews = new Map<number, Review[]>([
        [
          3117,
          [
            {
              user: { login: 'edahlseng' },
              state: 'CHANGES_REQUESTED',
              submitted_at: '2026-10-17T00:24:22Z',
              body: 'Leave Terraform actions as is.',
            },
          ],
        ],
      ]);

      const summaries = groupPrsByReviewers([pr], reviews);
      const markdown = formatMarkdownReport(summaries, 'edahlseng');

      expect(markdown).toContain('## Reviewer Status: @edahlseng');
      expect(markdown).toContain('### 1. Changes Requested (1)');
      expect(markdown).toContain('> Leave Terraform actions as is.');
      expect(markdown).toContain('[#3117]');
    });
  });

  describe('formatSlackDigest', () => {
    it('formats a clean Slack message grouped by reviewer with unfreeze banner', () => {
      const pr1: PullRequest = {
        number: 3146,
        title: 'fix: Remove unsupported MongoDB legacy options',
        url: 'https://github.com/EmpoHealth/core/pull/3146',
        reviewRequests: [{ login: 'singhmadhurima123' }],
      };
      const pr2: PullRequest = {
        number: 3117,
        title: 'fix: Paginate open PR retrieval',
        url: 'https://github.com/EmpoHealth/core/pull/3117',
        reviewRequests: [{ login: 'edahlseng' }],
      };

      const reviews = new Map<number, Review[]>([
        [
          3117,
          [
            {
              user: { login: 'edahlseng' },
              state: 'CHANGES_REQUESTED',
              submitted_at: '2026-10-17T00:24:22Z',
            },
          ],
        ],
        [3146, []],
      ]);

      const summaries = groupPrsByReviewers([pr1, pr2], reviews);
      const slack = formatSlackDigest(summaries, { unfreezePrNumber: 3146 });

      expect(slack).toContain('🚨 *Critical Path: Repository Deployment Unfreeze*');
      expect(slack).toContain('*[PR #3146](');
      expect(slack).toContain('👤 *@edahlseng*');
      expect(slack).toContain('*(Changes addressed — re-review requested)*');
      expect(slack).toContain('👤 *@singhmadhurima123*');
    });
  });
});

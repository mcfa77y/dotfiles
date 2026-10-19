import { describe, expect, it } from 'bun:test';
import { deduplicateChecks, evaluatePr, validatePrFormat, type PrDetails } from './queue_prs.ts';

describe('validatePrFormat', () => {
  it('passes for a valid conventional commit PR title and setext structure', () => {
    const title = 'feat: add user authentication flow (RHL-1234)';
    const body = `
Detailed Description
--------------------

### Problem
Authentication was missing.

### Solution
Added auth flow.

Relevant Linear Tickets
-----------------------

This change contributes to RHL-1234.

Reviews and Merging
-------------------
`;
    const res = validatePrFormat(title, body);
    expect(res.valid).toBe(true);
    expect(res.errors).toHaveLength(0);
  });

  it('fails when title exceeds 72 characters', () => {
    const title =
      'feat: this is a very long title that definitely exceeds the seventy-two character limit strictly (RHL-1234)';
    const res = validatePrFormat(title, 'body');
    expect(res.valid).toBe(false);
    expect(res.errors.some((e) => e.includes('Title exceeds 72 characters'))).toBe(true);
  });

  it('fails when title has a trailing period', () => {
    const title = 'fix: prevent race condition on logout.';
    const res = validatePrFormat(title, 'body');
    expect(res.valid).toBe(false);
    expect(res.errors.some((e) => e.includes('must not end with a period'))).toBe(true);
  });

  it('fails when Reviews and Merging has content', () => {
    const title = 'feat: add feature (RHL-1234)';
    const body = `
Detailed Description
--------------------

Work done.

Relevant Linear Tickets
-----------------------

This change contributes to RHL-1234.

Reviews and Merging
-------------------
Please merge now
`;
    const res = validatePrFormat(title, body);
    expect(res.valid).toBe(false);
    expect(res.errors.some((e) => e.includes("'Reviews and Merging' section must be empty"))).toBe(
      true,
    );
  });
});

describe('evaluatePr', () => {
  const validBody = `
Detailed Description
--------------------

Good change.

Relevant Linear Tickets
-----------------------

This change contributes to RHL-1234.

Reviews and Merging
-------------------
`;

  it('detects already queued PR by label', () => {
    const pr: PrDetails = {
      number: 100,
      title: 'feat: ready PR (RHL-1234)',
      body: validBody,
      url: 'https://github.com/EmpoHealth/core/pull/100',
      isDraft: false,
      mergeable: 'MERGEABLE',
      mergeStateStatus: 'CLEAN',
      reviewDecision: 'APPROVED',
      labels: [{ name: 'queued' }],
      statusCheckRollup: [
        { name: 'Mergify Merge Protections', conclusion: 'SUCCESS', status: 'COMPLETED' },
      ],
      updatedAt: '2026-10-15T12:00:00Z',
    };

    const res = evaluatePr(pr);
    expect(res.status).toBe('QUEUED');
  });

  it('detects ready PR when all checks pass and PR is approved', () => {
    const pr: PrDetails = {
      number: 101,
      title: 'feat: ready PR (RHL-1234)',
      body: validBody,
      url: 'https://github.com/EmpoHealth/core/pull/101',
      isDraft: false,
      mergeable: 'MERGEABLE',
      mergeStateStatus: 'CLEAN',
      reviewDecision: 'APPROVED',
      labels: [],
      statusCheckRollup: [
        { name: 'Mergify Merge Protections', conclusion: 'SUCCESS', status: 'COMPLETED' },
        { name: 'Lint PR title and description body', conclusion: 'SUCCESS', status: 'COMPLETED' },
        { name: 'test-units', conclusion: 'SUCCESS', status: 'COMPLETED' },
      ],
      updatedAt: '2026-10-15T12:00:00Z',
    };

    const res = evaluatePr(pr);
    expect(res.status).toBe('READY');
    expect(res.blockers).toHaveLength(0);
  });

  it('marks as blocked if changes are requested', () => {
    const pr: PrDetails = {
      number: 102,
      title: 'fix: fixing something (RHL-1234)',
      body: validBody,
      url: 'https://github.com/EmpoHealth/core/pull/102',
      isDraft: false,
      mergeable: 'MERGEABLE',
      mergeStateStatus: 'CLEAN',
      reviewDecision: 'CHANGES_REQUESTED',
      labels: [],
      statusCheckRollup: [
        { name: 'Mergify Merge Protections', conclusion: 'SUCCESS', status: 'COMPLETED' },
      ],
      updatedAt: '2026-10-15T12:00:00Z',
    };

    const res = evaluatePr(pr);
    expect(res.status).toBe('BLOCKED');
    expect(res.blockers.some((b) => b.includes('Changes requested'))).toBe(true);
  });

  it('marks as blocked if PR is draft', () => {
    const pr: PrDetails = {
      number: 103,
      title: 'fix: draft PR (RHL-1234)',
      body: validBody,
      url: 'https://github.com/EmpoHealth/core/pull/103',
      isDraft: true,
      mergeable: 'MERGEABLE',
      mergeStateStatus: 'CLEAN',
      reviewDecision: 'APPROVED',
      labels: [],
      statusCheckRollup: [],
      updatedAt: '2026-10-15T12:00:00Z',
    };

    const res = evaluatePr(pr);
    expect(res.status).toBe('BLOCKED');
    expect(res.blockers.some((b) => b.includes('Draft'))).toBe(true);
  });

  it('deduplicates checks keeping the latest check run result', () => {
    const pr: PrDetails = {
      number: 104,
      title: 'feat: deduplication test (RHL-1234)',
      body: validBody,
      url: 'https://github.com/EmpoHealth/core/pull/104',
      isDraft: false,
      mergeable: 'MERGEABLE',
      mergeStateStatus: 'CLEAN',
      reviewDecision: 'APPROVED',
      labels: [],
      statusCheckRollup: [
        {
          name: 'Lint PR title and description body',
          conclusion: 'FAILURE',
          status: 'COMPLETED',
          completedAt: '2026-10-15T10:00:00Z',
        },
        {
          name: 'Lint PR title and description body',
          conclusion: 'SUCCESS',
          status: 'COMPLETED',
          completedAt: '2026-10-15T11:00:00Z',
        },
        { name: 'Mergify Merge Protections', conclusion: 'SUCCESS', status: 'COMPLETED' },
      ],
      updatedAt: '2026-10-15T12:00:00Z',
    };

    const res = evaluatePr(pr);
    expect(res.status).toBe('READY');
    expect(res.failedChecks).toHaveLength(0);
  });
});

describe('deduplicateChecks', () => {
  it('prefers the check run with a more recent completedAt timestamp', () => {
    const checks = [
      {
        name: 'ci/test',
        conclusion: 'FAILURE',
        status: 'COMPLETED',
        completedAt: '2026-10-15T09:00:00Z',
      },
      {
        name: 'ci/test',
        conclusion: 'SUCCESS',
        status: 'COMPLETED',
        completedAt: '2026-10-15T10:00:00Z',
      },
    ];
    const deduped = deduplicateChecks(checks);
    expect(deduped).toHaveLength(1);
    expect(deduped[0].conclusion).toBe('SUCCESS');
  });

  it('prefers an in-progress run if started after an earlier completed run', () => {
    const checks = [
      {
        name: 'ci/test',
        conclusion: 'FAILURE',
        status: 'COMPLETED',
        completedAt: '2026-10-15T09:00:00Z',
      },
      { name: 'ci/test', status: 'IN_PROGRESS', startedAt: '2026-10-15T09:30:00Z' },
    ];
    const deduped = deduplicateChecks(checks);
    expect(deduped).toHaveLength(1);
    expect(deduped[0].status).toBe('IN_PROGRESS');
  });
});

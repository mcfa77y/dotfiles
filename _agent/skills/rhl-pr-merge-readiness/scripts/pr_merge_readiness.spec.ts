import { describe, expect, it } from 'bun:test';
import { evaluatePR, formatTable, type RawPR, rankPRs } from './pr_merge_readiness';

describe('pr_merge_readiness', () => {
  it('correctly categorizes a draft PR as DRAFT', () => {
    const pr: RawPR = {
      number: 101,
      title: 'WIP feature',
      url: 'https://github.com/EmpoHealth/core/pull/101',
      headRefName: 'feat-wip',
      isDraft: true,
      mergeable: 'MERGEABLE',
      statusCheckRollup: [],
    };
    const evaluated = evaluatePR(pr);
    expect(evaluated.tier).toBe('DRAFT');
    expect(evaluated.tierRank).toBe(8);
  });

  it('identifies PRs currently in Mergify queue as QUEUED', () => {
    const pr: RawPR = {
      number: 102,
      title: 'Ready feature',
      url: 'https://github.com/EmpoHealth/core/pull/102',
      headRefName: 'feat-ready',
      isDraft: false,
      mergeable: 'MERGEABLE',
      reviewDecision: 'APPROVED',
      reviews: [{ author: { login: 'alice' }, state: 'APPROVED' }],
      statusCheckRollup: [
        { name: 'Mergify Merge Queue', status: 'IN_PROGRESS', conclusion: null },
        { name: 'test', status: 'COMPLETED', conclusion: 'SUCCESS' },
      ],
    };
    const evaluated = evaluatePR(pr);
    expect(evaluated.tier).toBe('QUEUED');
    expect(evaluated.tierRank).toBe(1);
    expect(evaluated.mergifyStatus).toBe('IN_QUEUE');
  });

  it('identifies approved PR with green CI as READY_TO_QUEUE', () => {
    const pr: RawPR = {
      number: 103,
      title: 'Fix issue',
      url: 'https://github.com/EmpoHealth/core/pull/103',
      headRefName: 'fix-bug',
      isDraft: false,
      mergeable: 'MERGEABLE',
      reviewDecision: 'APPROVED',
      reviews: [{ author: { login: 'bob' }, state: 'APPROVED' }],
      statusCheckRollup: [
        { name: 'test-units', status: 'COMPLETED', conclusion: 'SUCCESS' },
        { name: 'Mergify Merge Protections', status: 'COMPLETED', conclusion: 'SUCCESS' },
      ],
    };
    const evaluated = evaluatePR(pr);
    expect(evaluated.tier).toBe('READY_TO_QUEUE');
    expect(evaluated.tierRank).toBe(2);
  });
  it('treats approved PR with failing Mergify Merge Protections as READY_TO_QUEUE with clean CI', () => {
    const pr: RawPR = {
      number: 1031,
      title: 'Fix issue',
      url: 'https://github.com/EmpoHealth/core/pull/1031',
      headRefName: 'fix-bug',
      isDraft: false,
      mergeable: 'MERGEABLE',
      reviewDecision: 'APPROVED',
      reviews: [{ author: { login: 'bob' }, state: 'APPROVED' }],
      statusCheckRollup: [
        { name: 'test-units', status: 'COMPLETED', conclusion: 'SUCCESS' },
        { name: 'Mergify Merge Protections', status: 'COMPLETED', conclusion: 'FAILURE' },
      ],
    };
    const evaluated = evaluatePR(pr);
    expect(evaluated.tier).toBe('READY_TO_QUEUE');
    expect(evaluated.tierRank).toBe(2);
    expect(evaluated.failingChecks).toEqual([]);
    expect(evaluated.totalChecks).toBe(1);
    expect(evaluated.passingChecks).toBe(1);
  });

  it('detects pending checks when approved as CHECKS_PENDING', () => {
    const pr: RawPR = {
      number: 104,
      title: 'Pending deploy',
      url: 'https://github.com/EmpoHealth/core/pull/104',
      headRefName: 'feat-deploy',
      isDraft: false,
      mergeable: 'MERGEABLE',
      reviewDecision: 'APPROVED',
      reviews: [{ author: { login: 'carol' }, state: 'APPROVED' }],
      statusCheckRollup: [{ name: 'deploy', status: 'IN_PROGRESS', conclusion: null }],
    };
    const evaluated = evaluatePR(pr);
    expect(evaluated.tier).toBe('CHECKS_PENDING');
    expect(evaluated.tierRank).toBe(3);
    expect(evaluated.pendingChecks).toContain('deploy');
  });

  it('flags merge conflicts or changes requested as BLOCKED_OR_CONFLICTING', () => {
    const conflictingPR: RawPR = {
      number: 105,
      title: 'Has conflicts',
      url: 'https://github.com/EmpoHealth/core/pull/105',
      headRefName: 'feat-conflict',
      isDraft: false,
      mergeable: 'CONFLICTING',
      statusCheckRollup: [],
    };
    expect(evaluatePR(conflictingPR).tier).toBe('BLOCKED_OR_CONFLICTING');

    const changesPR: RawPR = {
      number: 106,
      title: 'Needs fix',
      url: 'https://github.com/EmpoHealth/core/pull/106',
      headRefName: 'feat-changes',
      isDraft: false,
      mergeable: 'MERGEABLE',
      reviewDecision: 'CHANGES_REQUESTED',
      reviews: [{ author: { login: 'david' }, state: 'CHANGES_REQUESTED' }],
      statusCheckRollup: [],
    };
    expect(evaluatePR(changesPR).tier).toBe('BLOCKED_OR_CONFLICTING');
  });

  it('ranks multiple PRs in order of merge proximity', () => {
    const prs: RawPR[] = [
      {
        number: 201,
        title: 'Review needed',
        url: 'https://github.com/EmpoHealth/core/pull/201',
        headRefName: 'r1',
        isDraft: false,
        mergeable: 'MERGEABLE',
        reviewDecision: 'REVIEW_REQUIRED',
        statusCheckRollup: [{ name: 'test', status: 'COMPLETED', conclusion: 'SUCCESS' }],
      },
      {
        number: 202,
        title: 'In queue',
        url: 'https://github.com/EmpoHealth/core/pull/202',
        headRefName: 'q1',
        isDraft: false,
        mergeable: 'MERGEABLE',
        reviewDecision: 'APPROVED',
        reviews: [{ author: { login: 'e' }, state: 'APPROVED' }],
        statusCheckRollup: [{ name: 'Mergify Merge Queue', status: 'IN_PROGRESS' }],
      },
      {
        number: 203,
        title: 'Ready',
        url: 'https://github.com/EmpoHealth/core/pull/203',
        headRefName: 'r2',
        isDraft: false,
        mergeable: 'MERGEABLE',
        reviewDecision: 'APPROVED',
        reviews: [{ author: { login: 'f' }, state: 'APPROVED' }],
        statusCheckRollup: [{ name: 'test', status: 'COMPLETED', conclusion: 'SUCCESS' }],
      },
    ];

    const ranked = rankPRs(prs);
    expect(ranked[0].number).toBe(202); // QUEUED
    expect(ranked[1].number).toBe(203); // READY_TO_QUEUE
    expect(ranked[2].number).toBe(201); // AWAITING_REVIEW
  });

  it('formats markdown table properly', () => {
    const prs: RawPR[] = [
      {
        number: 301,
        title: 'Table test',
        url: 'https://github.com/EmpoHealth/core/pull/301',
        headRefName: 'branch-1',
        isDraft: false,
        mergeable: 'MERGEABLE',
        reviewDecision: 'APPROVED',
        reviews: [{ author: { login: 'reviewer' }, state: 'APPROVED' }],
        statusCheckRollup: [{ name: 'ci', status: 'COMPLETED', conclusion: 'SUCCESS' }],
      },
    ];
    const table = formatTable(rankPRs(prs));
    expect(table).toContain('| Rank | PR | Title | Status | Reviews | CI Checks | Action Needed |');
    expect(table).toContain('[#301](https://github.com/EmpoHealth/core/pull/301)');
    expect(table).toContain('READY_TO_QUEUE');
  });
});

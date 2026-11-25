#!/usr/bin/env bun
/**
 * pr_merge_readiness.ts
 *
 * Inspects open pull requests for a given author on GitHub, evaluates CI check
 * status, review decisions, and Mergify queue/protections, and ranks PRs by
 * proximity to being merged.
 */

import { $ } from 'bun';
import { Command } from 'commander';

export type MergeTier =
  | 'QUEUED'
  | 'READY_TO_QUEUE'
  | 'CHECKS_PENDING'
  | 'REQUEUE_NEEDED'
  | 'AWAITING_REVIEW'
  | 'CI_FAILING'
  | 'BLOCKED_OR_CONFLICTING'
  | 'DRAFT';

export const TIER_PRIORITY: Record<MergeTier, number> = {
  QUEUED: 1,
  READY_TO_QUEUE: 2,
  CHECKS_PENDING: 3,
  REQUEUE_NEEDED: 4,
  AWAITING_REVIEW: 5,
  CI_FAILING: 6,
  BLOCKED_OR_CONFLICTING: 7,
  DRAFT: 8,
};

export interface CheckRun {
  name: string;
  status: string;
  conclusion?: string | null;
  workflowName?: string;
  detailsUrl?: string;
}

export interface Review {
  author?: { login: string };
  state: 'APPROVED' | 'CHANGES_REQUESTED' | 'COMMENTED' | 'DISMISSED' | 'PENDING' | string;
  submittedAt?: string;
}

export interface RawPR {
  number: number;
  title: string;
  url: string;
  headRefName: string;
  isDraft: boolean;
  mergeable: 'MERGEABLE' | 'CONFLICTING' | 'UNKNOWN' | string;
  reviewDecision?: 'APPROVED' | 'CHANGES_REQUESTED' | 'REVIEW_REQUIRED' | string | null;
  reviews?: Review[];
  statusCheckRollup?: CheckRun[];
  comments?: Array<{
    body: string;
    author?: { login: string };
  }>;
  updatedAt?: string;
}

export interface EvaluatedPR {
  number: number;
  title: string;
  url: string;
  branch: string;
  tier: MergeTier;
  tierRank: number;
  reviewDecision: string;
  approvals: string[];
  changesRequested: string[];
  mergifyStatus: 'IN_QUEUE' | 'PROTECTIONS_PASSED' | 'PROTECTIONS_FAILED' | 'UNKNOWN';
  failingChecks: string[];
  pendingChecks: string[];
  totalChecks: number;
  passingChecks: number;
  mergeable: string;
  recommendedAction: string;
}

/**
 * Computes the merge readiness and assigns a tier to a given PR.
 */
export function evaluatePR(pr: RawPR): EvaluatedPR {
  if (pr.isDraft) {
    return createEvaluatedPR(pr, 'DRAFT', 'Mark PR ready for review when complete');
  }

  const rawChecks = pr.statusCheckRollup || [];
  const mergifyProtectionCheck = rawChecks.find((c) =>
    (c.name || '').toLowerCase().includes('mergify merge protections'),
  );
  // Real CI checks (excluding composite Mergify protection check)
  const checks = rawChecks.filter(
    (c) => !(c.name || '').toLowerCase().includes('mergify merge protections'),
  );
  const failingChecks: string[] = [];
  const pendingChecks: string[] = [];
  let passingChecks = 0;

  for (const c of checks) {
    const conc = (c.conclusion || c.status || '').toUpperCase();
    if (conc === 'SUCCESS' || conc === 'SKIPPED' || conc === 'NEUTRAL') {
      passingChecks++;
    } else if (['FAILURE', 'CANCELLED', 'TIMED_OUT', 'ACTION_REQUIRED'].includes(conc)) {
      failingChecks.push(c.name);
    } else if (['IN_PROGRESS', 'QUEUED', 'PENDING', 'WAITING'].includes(conc)) {
      pendingChecks.push(c.name);
    }
  }

  // Deduplicate reviews to latest per author
  const latestReviews = new Map<string, string>();
  for (const r of pr.reviews || []) {
    const author = r.author?.login;
    if (author) {
      latestReviews.set(author, r.state);
    }
  }

  const approvals: string[] = [];
  const changesRequested: string[] = [];
  for (const [author, state] of latestReviews.entries()) {
    if (state === 'APPROVED') approvals.push(author);
    if (state === 'CHANGES_REQUESTED') changesRequested.push(author);
  }

  // Mergify status analysis
  const mergifyQueueCheck = checks.find((c) =>
    (c.name || '').toLowerCase().includes('mergify merge queue'),
  );
  // mergifyProtectionCheck already identified from rawChecks

  const isInMergifyQueue =
    mergifyQueueCheck &&
    (mergifyQueueCheck.status === 'IN_PROGRESS' || mergifyQueueCheck.status === 'QUEUED');

  let mergifyStatus: EvaluatedPR['mergifyStatus'] = 'UNKNOWN';
  if (isInMergifyQueue) {
    mergifyStatus = 'IN_QUEUE';
  } else if (mergifyProtectionCheck?.conclusion === 'SUCCESS') {
    mergifyStatus = 'PROTECTIONS_PASSED';
  } else if (mergifyProtectionCheck?.conclusion === 'FAILURE') {
    mergifyStatus = 'PROTECTIONS_FAILED';
  }

  // Check comments for recent Mergify queue cancellation due to push
  const lastMergifyComment =
    [...(pr.comments || [])]
      .reverse()
      .find((c) => (c.author?.login || '').toLowerCase().includes('mergify'))?.body || '';

  const queueCancelledByPush =
    lastMergifyComment.includes('queue request been cancelled: new commits pushed') ||
    lastMergifyComment.includes('queue request has been cancelled: new commits pushed');

  // Conflict or Changes Requested check
  if (pr.mergeable === 'CONFLICTING' || changesRequested.length > 0) {
    const reason =
      pr.mergeable === 'CONFLICTING'
        ? 'Resolve merge conflicts with base branch'
        : `Address requested changes from ${changesRequested.join(', ')}`;
    return {
      number: pr.number,
      title: pr.title,
      url: pr.url,
      branch: pr.headRefName,
      tier: 'BLOCKED_OR_CONFLICTING',
      tierRank: TIER_PRIORITY.BLOCKED_OR_CONFLICTING,
      reviewDecision: pr.reviewDecision || 'UNKNOWN',
      approvals,
      changesRequested,
      mergifyStatus,
      failingChecks,
      pendingChecks,
      totalChecks: checks.length,
      passingChecks,
      mergeable: pr.mergeable,
      recommendedAction: reason,
    };
  }

  // Real CI failures
  const realFailures = failingChecks;

  // Tier 1: In Queue
  if (isInMergifyQueue) {
    return {
      number: pr.number,
      title: pr.title,
      url: pr.url,
      branch: pr.headRefName,
      tier: 'QUEUED',
      tierRank: TIER_PRIORITY.QUEUED,
      reviewDecision: pr.reviewDecision || 'APPROVED',
      approvals,
      changesRequested,
      mergifyStatus,
      failingChecks,
      pendingChecks,
      totalChecks: checks.length,
      passingChecks,
      mergeable: pr.mergeable,
      recommendedAction: 'In merge queue; waiting on speculative test/rebase execution',
    };
  }

  // Tier 2: Ready to Queue
  const isApproved = pr.reviewDecision === 'APPROVED' || approvals.length > 0;
  if (isApproved && realFailures.length === 0 && pendingChecks.length === 0) {
    return {
      number: pr.number,
      title: pr.title,
      url: pr.url,
      branch: pr.headRefName,
      tier: 'READY_TO_QUEUE',
      tierRank: TIER_PRIORITY.READY_TO_QUEUE,
      reviewDecision: pr.reviewDecision || 'APPROVED',
      approvals,
      changesRequested,
      mergifyStatus,
      failingChecks,
      pendingChecks,
      totalChecks: checks.length,
      passingChecks,
      mergeable: pr.mergeable,
      recommendedAction:
        'Ready to queue: comment `@mergifyio queue` or tick Mergify queue checkbox',
    };
  }

  // Tier 3: Checks Pending
  if (isApproved && realFailures.length === 0 && pendingChecks.length > 0) {
    return {
      number: pr.number,
      title: pr.title,
      url: pr.url,
      branch: pr.headRefName,
      tier: 'CHECKS_PENDING',
      tierRank: TIER_PRIORITY.CHECKS_PENDING,
      reviewDecision: pr.reviewDecision || 'APPROVED',
      approvals,
      changesRequested,
      mergifyStatus,
      failingChecks,
      pendingChecks,
      totalChecks: checks.length,
      passingChecks,
      mergeable: pr.mergeable,
      recommendedAction: `Wait for in-progress checks: ${pendingChecks.slice(0, 2).join(', ')}`,
    };
  }

  // Tier 4: Re-queue Needed
  if (isApproved && queueCancelledByPush) {
    return {
      number: pr.number,
      title: pr.title,
      url: pr.url,
      branch: pr.headRefName,
      tier: 'REQUEUE_NEEDED',
      tierRank: TIER_PRIORITY.REQUEUE_NEEDED,
      reviewDecision: pr.reviewDecision || 'APPROVED',
      approvals,
      changesRequested,
      mergifyStatus,
      failingChecks,
      pendingChecks,
      totalChecks: checks.length,
      passingChecks,
      mergeable: pr.mergeable,
      recommendedAction:
        'Re-queue required: new commit reset queue status; comment `@mergifyio queue`',
    };
  }

  // Tier 5: Awaiting Review
  if (!isApproved && realFailures.length === 0) {
    return {
      number: pr.number,
      title: pr.title,
      url: pr.url,
      branch: pr.headRefName,
      tier: 'AWAITING_REVIEW',
      tierRank: TIER_PRIORITY.AWAITING_REVIEW,
      reviewDecision: pr.reviewDecision || 'REVIEW_REQUIRED',
      approvals,
      changesRequested,
      mergifyStatus,
      failingChecks,
      pendingChecks,
      totalChecks: checks.length,
      passingChecks,
      mergeable: pr.mergeable,
      recommendedAction: 'Request review or ping assigned reviewers',
    };
  }

  // Tier 6: CI Failing
  return {
    number: pr.number,
    title: pr.title,
    url: pr.url,
    branch: pr.headRefName,
    tier: 'CI_FAILING',
    tierRank: TIER_PRIORITY.CI_FAILING,
    reviewDecision: pr.reviewDecision || 'UNKNOWN',
    approvals,
    changesRequested,
    mergifyStatus,
    failingChecks: realFailures,
    pendingChecks,
    totalChecks: checks.length,
    passingChecks,
    mergeable: pr.mergeable,
    recommendedAction: `Fix failing check(s): ${realFailures.slice(0, 2).join(', ')}`,
  };
}

function createEvaluatedPR(pr: RawPR, tier: MergeTier, action: string): EvaluatedPR {
  return {
    number: pr.number,
    title: pr.title,
    url: pr.url,
    branch: pr.headRefName,
    tier,
    tierRank: TIER_PRIORITY[tier],
    reviewDecision: pr.reviewDecision || 'UNKNOWN',
    approvals: [],
    changesRequested: [],
    mergifyStatus: 'UNKNOWN',
    failingChecks: [],
    pendingChecks: [],
    totalChecks: (pr.statusCheckRollup || []).filter(
      (c) => !(c.name || '').toLowerCase().includes('mergify merge protections'),
    ).length,
    passingChecks: 0,
    mergeable: pr.mergeable,
    recommendedAction: action,
  };
}

/**
 * Fetches open pull requests for a given author via GitHub CLI.
 */
export async function fetchOpenPRs(repo: string, author: string, limit = 50): Promise<RawPR[]> {
  const result =
    await $`gh pr list --repo ${repo} --author ${author} --state open --limit ${limit} --json number,title,url,headRefName,isDraft,mergeable,reviewDecision,reviews,statusCheckRollup,comments,updatedAt`.text();
  return JSON.parse(result);
}

/**
 * Ranks PRs by distance to merge.
 */
export function rankPRs(prs: RawPR[]): EvaluatedPR[] {
  return prs.map(evaluatePR).sort((a, b) => a.tierRank - b.tierRank || b.number - a.number);
}

/**
 * Formats evaluated PRs as a markdown/terminal table.
 */
export function formatTable(ranked: EvaluatedPR[]): string {
  const lines: string[] = [];
  lines.push('| Rank | PR | Title | Status | Reviews | CI Checks | Action Needed |');
  lines.push('| :---: | :---: | :--- | :--- | :--- | :--- | :--- |');

  for (let i = 0; i < ranked.length; i++) {
    const p = ranked[i];
    const checksStr =
      p.failingChecks.length > 0
        ? `❌ ${p.failingChecks.length} failed`
        : p.pendingChecks.length > 0
          ? `⏳ ${p.pendingChecks.length} pending`
          : `✅ ${p.passingChecks}/${p.totalChecks}`;

    const reviewsStr =
      p.approvals.length > 0
        ? `✅ ${p.approvals.join(', ')}`
        : p.changesRequested.length > 0
          ? `🛑 ${p.changesRequested.join(', ')}`
          : `⏳ ${p.reviewDecision}`;

    lines.push(
      `| ${i + 1} | [#${p.number}](${p.url}) | ${p.title} | \`${p.tier}\` | ${reviewsStr} | ${checksStr} | ${p.recommendedAction} |`,
    );
  }

  return lines.join('\n');
}

export async function main() {
  const program = new Command();

  program
    .name('pr_merge_readiness')
    .description('Rank open PRs by distance to merge, evaluating reviews, CI, and Mergify status')
    .option('--repo <repo>', 'GitHub repository in owner/repo format', 'EmpoHealth/core')
    .option('--author <author>', 'GitHub username of PR author', 'mcfa77y')
    .option('--format <format>', 'Output format: table, markdown, json', 'table')
    .option('--limit <number>', 'Maximum number of PRs to query', '50')
    .action(async (options) => {
      const prs = await fetchOpenPRs(options.repo, options.author, parseInt(options.limit, 10));
      const ranked = rankPRs(prs);

      if (options.format === 'json') {
        console.log(JSON.stringify(ranked, null, 2));
      } else {
        console.log(formatTable(ranked));
      }
    });

  await program.parseAsync(process.argv);
}

if (import.meta.main) {
  await main();
}

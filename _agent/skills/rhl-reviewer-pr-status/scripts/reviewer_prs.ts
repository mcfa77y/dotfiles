#!/usr/bin/env bun
/**
 * reviewer_prs.ts
 *
 * Inspects open pull requests for a given author, audits reviews, change requests,
 * and review requests across reviewers, and formats summaries for terminal, markdown,
 * or Slack digests.
 */

import { $ } from 'bun';
import { Command } from 'commander';

export interface Review {
  id?: number | string;
  user?: { login: string };
  state: 'APPROVED' | 'CHANGES_REQUESTED' | 'COMMENTED' | 'DISMISSED' | 'PENDING' | string;
  submitted_at?: string;
  body?: string;
}

export interface ReviewRequest {
  login: string;
  name?: string;
}

export interface PRFile {
  path: string;
}

export interface PullRequest {
  number: number;
  title: string;
  url: string;
  headRefName?: string;
  isDraft?: boolean;
  reviewDecision?: string;
  reviewRequests?: ReviewRequest[];
  latestReviews?: Array<{
    author?: { login: string };
    state?: string;
  }>;
  files?: PRFile[];
  updatedAt?: string;
}

export type ReviewerRelationship =
  | 'CHANGES_REQUESTED'
  | 'REVIEW_REQUESTED'
  | 'APPROVED'
  | 'COMMENTED'
  | 'NONE';

export interface ReviewerPRItem {
  prNumber: number;
  title: string;
  url: string;
  relationship: ReviewerRelationship;
  latestReviewState?: string;
  latestReviewDate?: string;
  latestReviewBody?: string;
  reviewRequested: boolean;
  mergifyRequired?: boolean;
  mergifyReason?: string;
  isDraft?: boolean;
}

export interface ReviewerSummary {
  reviewer: string;
  changesRequested: ReviewerPRItem[];
  reviewRequested: ReviewerPRItem[];
  approved: ReviewerPRItem[];
  commentedOnly: ReviewerPRItem[];
}

/**
 * Filters and deduplicates reviews, returning the latest review per user.
 */
export function getLatestReviewsByUser(reviews: Review[]): Map<string, Review> {
  const latestMap = new Map<string, Review>();

  for (const review of reviews) {
    const user = review.user?.login;
    if (!user) continue;

    const existing = latestMap.get(user);
    if (!existing) {
      latestMap.set(user, review);
      continue;
    }

    const existingDate = new Date(existing.submitted_at || 0).getTime();
    const newDate = new Date(review.submitted_at || 0).getTime();

    if (newDate >= existingDate) {
      latestMap.set(user, review);
    }
  }

  return latestMap;
}
/**
 * Checks whether a reviewer's approval is strictly required by repository Mergify rules.
 */
export function evaluateMergifyReviewerRequirement(
  files: PRFile[] | undefined,
  reviewer: string,
): { required: boolean; reason?: string } {
  if (!files || files.length === 0) {
    return { required: false };
  }
  const filePaths = files.map((f) => f.path);
  const rev = reviewer.toLowerCase();

  if (rev === 'edahlseng') {
    // 1. Root / core repo config
    const touchesCore = filePaths.some(
      (p) =>
        (!p.startsWith('workspaces/') && !p.startsWith('.github/workflows/qa--')) ||
        p.startsWith('workspaces/_repository-configuration'),
    );
    if (touchesCore) {
      return { required: true, reason: "Require Eric's review on core repository configuration" };
    }
    // 2. SAAS accounts
    if (filePaths.some((p) => p.startsWith('workspaces/_saas-accounts'))) {
      return {
        required: true,
        reason: "Require Eric or Anuj's review on SAAS configuration changes",
      };
    }
    // 3. Repository sync
    if (filePaths.some((p) => p.startsWith('workspaces/repository-sync'))) {
      return { required: true, reason: "Require Eric's review on Repository Syncing changes" };
    }
  }

  if (rev === 'anuj-khandelwal') {
    if (filePaths.some((p) => p.startsWith('workspaces/_saas-accounts'))) {
      return {
        required: true,
        reason: "Require Eric or Anuj's review on SAAS configuration changes",
      };
    }
  }

  if (rev === 'cynthia642' || rev === 'singhmadhurima123') {
    const touchesAppOrBackend = filePaths.some(
      (p) =>
        p === 'package.json' ||
        p.startsWith('tsconfig') ||
        p === 'yarn.lock' ||
        p.startsWith('workspaces/frontend-app/') ||
        p.startsWith('workspaces/backend-api/') ||
        p.startsWith('workspaces/common/'),
    );
    if (touchesAppOrBackend) {
      return { required: true, reason: "Require QA's approval on frontend and backend changes" };
    }
  }

  return { required: false };
}

/**
 * Determines the status of a specific reviewer on a single PR.
 */
export function evaluateReviewerStatus(
  pr: PullRequest,
  reviewer: string,
  reviews: Review[],
): ReviewerPRItem {
  const normReviewer = reviewer.toLowerCase();
  const requested = (pr.reviewRequests || []).some((r) => r.login.toLowerCase() === normReviewer);
  const mergify = evaluateMergifyReviewerRequirement(pr.files, reviewer);

  const reviewerReviews = reviews
    .filter((r) => r.user?.login.toLowerCase() === normReviewer)
    .sort(
      (a, b) => new Date(b.submitted_at || 0).getTime() - new Date(a.submitted_at || 0).getTime(),
    );

  const latestReview = reviewerReviews[0];
  const state = latestReview?.state?.toUpperCase();

  let relationship: ReviewerRelationship = 'NONE';

  if (state === 'CHANGES_REQUESTED') {
    relationship = 'CHANGES_REQUESTED';
  } else if (state === 'APPROVED') {
    relationship = 'APPROVED';
  } else if (requested || mergify.required) {
    relationship = 'REVIEW_REQUESTED';
  } else if (state === 'COMMENTED') {
    relationship = requested ? 'REVIEW_REQUESTED' : 'COMMENTED';
  }

  return {
    prNumber: pr.number,
    title: pr.title,
    url: pr.url,
    relationship,
    latestReviewState: state,
    latestReviewDate: latestReview?.submitted_at,
    latestReviewBody: latestReview?.body?.trim(),
    reviewRequested: requested,
    mergifyRequired: mergify.required,
    mergifyReason: mergify.reason,
    isDraft: pr.isDraft,
  };
}

export function groupPrsByReviewers(
  prs: PullRequest[],
  reviewsByPr: Map<number, Review[]>,
): Map<string, ReviewerSummary> {
  const summaryMap = new Map<string, ReviewerSummary>();

  function getOrCreateSummary(reviewer: string): ReviewerSummary {
    if (!summaryMap.has(reviewer)) {
      summaryMap.set(reviewer, {
        reviewer,
        changesRequested: [],
        reviewRequested: [],
        approved: [],
        commentedOnly: [],
      });
    }
    return summaryMap.get(reviewer)!;
  }

  const candidateReviewers = ['edahlseng', 'cynthia642', 'singhmadhurima123', 'anuj-khandelwal'];

  for (const pr of prs) {
    const reviews = reviewsByPr.get(pr.number) || [];
    const involvedReviewers = new Set<string>();

    for (const req of pr.reviewRequests || []) {
      if (req.login) involvedReviewers.add(req.login);
    }

    for (const r of reviews) {
      if (r.user?.login) involvedReviewers.add(r.user.login);
    }

    for (const cand of candidateReviewers) {
      const mergify = evaluateMergifyReviewerRequirement(pr.files, cand);
      if (mergify.required) {
        involvedReviewers.add(cand);
      }
    }

    for (const reviewer of involvedReviewers) {
      const summary = getOrCreateSummary(reviewer);
      const item = evaluateReviewerStatus(pr, reviewer, reviews);

      switch (item.relationship) {
        case 'CHANGES_REQUESTED':
          summary.changesRequested.push(item);
          break;
        case 'REVIEW_REQUESTED':
          summary.reviewRequested.push(item);
          break;
        case 'APPROVED':
          summary.approved.push(item);
          break;
        case 'COMMENTED':
          summary.commentedOnly.push(item);
          break;
      }
    }
  }

  return summaryMap;
}

/**

/**
 * Formats a Markdown report for a specific reviewer or overall reviewers.
 */
export function formatMarkdownReport(
  summaries: Map<string, ReviewerSummary>,
  targetReviewer?: string,
): string {
  const lines: string[] = [];

  if (targetReviewer) {
    const summary = summaries.get(targetReviewer) || {
      reviewer: targetReviewer,
      changesRequested: [],
      reviewRequested: [],
      approved: [],
      commentedOnly: [],
    };

    lines.push(`## Reviewer Status: @${targetReviewer}`);
    lines.push('');

    // 1. Changes Requested
    lines.push(`### 1. Changes Requested (${summary.changesRequested.length})`);
    if (summary.changesRequested.length === 0) {
      lines.push('_No pending change requests._');
    } else {
      for (const item of summary.changesRequested) {
        lines.push(`- **[#${item.prNumber}](${item.url}): ${item.title}**`);
        if (item.latestReviewDate) {
          lines.push(`  - *Submitted*: ${item.latestReviewDate}`);
        }
        if (item.latestReviewBody) {
          const quoted = item.latestReviewBody
            .split('\n')
            .map((l) => `  > ${l}`)
            .join('\n');
          lines.push(quoted);
        }
      }
    }
    lines.push('');

    // 2. Awaiting Review
    lines.push(`### 2. Awaiting Review (${summary.reviewRequested.length})`);
    if (summary.reviewRequested.length === 0) {
      lines.push('_No PRs currently awaiting review._');
    } else {
      lines.push('| PR | Title | Review Requested |');
      lines.push('| :--- | :--- | :---: |');
      for (const item of summary.reviewRequested) {
        lines.push(
          `| [#${item.prNumber}](${item.url}) | ${item.title} | ${item.reviewRequested ? 'Yes' : 'No'} |`,
        );
      }
    }
    lines.push('');

    // 3. Approved
    lines.push(`### 3. Approved PRs (${summary.approved.length})`);
    if (summary.approved.length === 0) {
      lines.push('_No approved PRs._');
    } else {
      for (const item of summary.approved) {
        lines.push(`- [#${item.prNumber}](${item.url}): ${item.title}`);
      }
    }

    return lines.join('\n');
  }

  // Multi-reviewer markdown summary
  lines.push('## Open PRs Reviewer Breakdown');
  lines.push('');

  for (const [reviewer, summary] of summaries.entries()) {
    const totalPending = summary.changesRequested.length + summary.reviewRequested.length;
    if (totalPending === 0) continue;

    lines.push(`### @${reviewer} (${totalPending} pending action)`);
    if (summary.changesRequested.length > 0) {
      lines.push('**Changes Requested:**');
      for (const item of summary.changesRequested) {
        lines.push(`- [#${item.prNumber}](${item.url}): ${item.title}`);
      }
    }
    if (summary.reviewRequested.length > 0) {
      lines.push('**Review Requested:**');
      for (const item of summary.reviewRequested) {
        lines.push(`- [#${item.prNumber}](${item.url}): ${item.title}`);
      }
    }
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Formats a clean Slack digest grouped by reviewer.
 */
export function formatSlackDigest(
  summaries: Map<string, ReviewerSummary>,
  options: { unfreezePrNumber?: number } = {},
): string {
  const sections: string[] = [];

  sections.push(
    '👋 Hey team! When you have a moment, could you please take a look at the following PRs?\n',
  );

  // If there's an unfreeze PR or critical item, highlight it
  const unfreezePr = options.unfreezePrNumber;
  if (unfreezePr) {
    sections.push('---');
    sections.push('🚨 *Critical Path: Repository Deployment Unfreeze*');
    sections.push(
      `* *[PR #${unfreezePr}](https://github.com/EmpoHealth/core/pull/${unfreezePr})* — Highest priority unblock`,
    );
    sections.push('---\n');
  }

  for (const [reviewer, summary] of summaries.entries()) {
    const pendingItems = [...summary.changesRequested, ...summary.reviewRequested];
    if (pendingItems.length === 0) continue;

    const reviewerSection: string[] = [];
    reviewerSection.push(`👤 *@${reviewer}*`);

    if (summary.changesRequested.length > 0) {
      for (const item of summary.changesRequested) {
        reviewerSection.push(
          `* *[PR #${item.prNumber}](${item.url})* — ${item.title} *(Changes addressed — re-review requested)*`,
        );
      }
    }

    if (summary.reviewRequested.length > 0) {
      for (const item of summary.reviewRequested) {
        if (item.prNumber === unfreezePr) continue;
        reviewerSection.push(`* *[PR #${item.prNumber}](${item.url})* — ${item.title}`);
      }
    }

    sections.push(reviewerSection.join('\n'));
    sections.push('');
  }

  sections.push('Thank you! 🙏');
  return sections.join('\n');
}

/**
 * Formats individual, copy-paste ready Slack DM messages grouped by reviewer.
 * Does not include Markdown blockquote ('>') markers so users can cleanly copy
 * directly into Slack DMs.
 */
export function formatSlackDmMessages(
  summaries: Map<string, ReviewerSummary>,
  options: { targetReviewer?: string } = {},
): string {
  const lines: string[] = [
    '# Slack Review Requests (Grouped by Reviewer)',
    '',
    'Ready-to-send Slack messages for each reviewer with the consolidated list of pull requests awaiting their review or re-review.',
    '',
    '---',
    '',
  ];

  let reviewerIndex = 1;
  for (const [reviewer, summary] of summaries.entries()) {
    if (options.targetReviewer && reviewer !== options.targetReviewer) continue;

    const pendingItems = [...summary.changesRequested, ...summary.reviewRequested];
    if (pendingItems.length === 0) continue;

    lines.push(`## ${reviewerIndex}. \`@${reviewer}\``);
    lines.push('');
    lines.push(
      `Hi \`@${reviewer}\`! 👋 When you have a moment, could you please take a look at the following PR${
        pendingItems.length === 1 ? '' : 's'
      } awaiting your review / re-review?`,
    );
    lines.push('');

    if (summary.changesRequested.length > 0) {
      for (const item of summary.changesRequested) {
        const ruleNote = item.mergifyRequired
          ? ` *(Required by Mergify: ${item.mergifyReason})*`
          : ' *(Feedback addressed)*';
        lines.push(`• [#${item.prNumber}](${item.url}): ${item.title}${ruleNote}`);
      }
    }

    if (summary.reviewRequested.length > 0) {
      for (const item of summary.reviewRequested) {
        const ruleNote = item.mergifyRequired
          ? ` *(Required by Mergify: ${item.mergifyReason})*`
          : ' *(Initial review)*';
        lines.push(`• [#${item.prNumber}](${item.url}): ${item.title}${ruleNote}`);
      }
    }

    lines.push('');
    lines.push('Thanks so much! 🙏');
    lines.push('');
    lines.push('---');
    lines.push('');

    reviewerIndex++;
  }

  if (lines[lines.length - 2] === '---') {
    lines.splice(lines.length - 2, 2);
  }

  return `${lines.join('\n').trim()}\n`;
}

/**
 * Main execution logic.
 */
export async function run(): Promise<void> {
  const program = new Command();

  program
    .name('reviewer_prs.ts')
    .description(
      'Audits PR review status, changes requested, and review requests across reviewers.',
    )
    .option(
      '-r, --repo <repo>',
      'Target GitHub repository (default: EmpoHealth/core)',
      'EmpoHealth/core',
    )
    .option('-a, --author <author>', 'Target PR author (default: mcfa77y)', 'mcfa77y')
    .option('--reviewer <reviewer>', 'Filter status for a specific reviewer login')
    .option(
      '-f, --format <format>',
      'Output format: markdown, slack, slack-dm, json, table',
      'markdown',
    )
    .option(
      '--unapproved-only',
      'Filter out PRs with reviewDecision=APPROVED to focus only on pending reviews',
      false,
    )
    .option(
      '-o, --output <file>',
      'Write output directly to a file path (e.g. docs/slack-review-requests.md)',
    )
    .option(
      '--unfreeze-pr <number>',
      'Highlight a specific PR number as deployment unfreeze critical path',
      parseInt,
    )
    .option(
      '--mergify-required-only',
      'Filter to only PRs where the reviewer is strictly required by Mergify rules (Group 1)',
      false,
    )
    .option('--include-drafts', 'Include draft pull requests', false);

  program.parse(process.argv);
  const opts = program.opts();

  const repo = opts.repo;
  const author = opts.author;
  const targetReviewer = opts.reviewer;
  const format = opts.format;

  // 1. Fetch open PRs
  const prsJson =
    await $`gh pr list --repo ${repo} --author ${author} --state open --limit 50 --json number,title,url,reviewRequests,reviewDecision,headRefName,updatedAt,isDraft,files`.text();
  const prs: PullRequest[] = JSON.parse(prsJson || '[]');
  if (prs.length === 0) {
    console.log(`No open pull requests found for @${author} in ${repo}.`);
    return;
  }

  // 2. Fetch reviews for each PR
  const reviewsByPr = new Map<number, Review[]>();
  for (const pr of prs) {
    try {
      const revText = await $`gh api repos/${repo}/pulls/${pr.number}/reviews`.text();
      const reviews: Review[] = JSON.parse(revText || '[]');
      reviewsByPr.set(pr.number, reviews);
    } catch {
      reviewsByPr.set(pr.number, []);
    }
  }

  // 3. Group and analyze
  // 3. Filter PRs if unapproved-only or slack-dm format
  let activePrs = prs;
  if (!opts.includeDrafts) {
    activePrs = activePrs.filter((pr) => !pr.isDraft);
  }
  if (opts.unapprovedOnly) {
    activePrs = activePrs.filter(
      (pr) =>
        pr.reviewDecision === 'REVIEW_REQUIRED' ||
        pr.reviewDecision === 'CHANGES_REQUESTED' ||
        !pr.reviewDecision,
    );
  }

  // 4. Group and analyze
  const summaries = groupPrsByReviewers(activePrs, reviewsByPr);
  if (opts.mergifyRequiredOnly) {
    for (const [_reviewer, summary] of summaries.entries()) {
      summary.changesRequested = summary.changesRequested.filter((item) => item.mergifyRequired);
      summary.reviewRequested = summary.reviewRequested.filter((item) => item.mergifyRequired);
      summary.approved = summary.approved.filter((item) => item.mergifyRequired);
      summary.commentedOnly = summary.commentedOnly.filter((item) => item.mergifyRequired);
    }
  }

  // 5. Generate output according to requested format
  let output = '';
  if (format === 'json') {
    if (targetReviewer) {
      output = JSON.stringify(summaries.get(targetReviewer) || null, null, 2);
    } else {
      const obj: Record<string, ReviewerSummary> = {};
      for (const [k, v] of summaries.entries()) {
        obj[k] = v;
      }
      output = JSON.stringify(obj, null, 2);
    }
  } else if (format === 'slack') {
    output = formatSlackDigest(summaries, { unfreezePrNumber: opts.unfreezePr });
  } else if (format === 'slack-dm') {
    output = formatSlackDmMessages(summaries, { targetReviewer });
  } else {
    // Default: markdown
    output = formatMarkdownReport(summaries, targetReviewer);
  }

  if (opts.output) {
    await Bun.write(opts.output, output);
    console.log(`Successfully wrote ${output.length} bytes to ${opts.output}`);
  } else {
    console.log(output);
  }
}

if (import.meta.main) {
  run().catch((err) => {
    console.error(`Error: ${err.message || err}`);
    process.exit(1);
  });
}

#!/usr/bin/env bun
/**
 * queue_prs.ts
 *
 * Inspects open pull requests in an Empo Health repository, determines Mergify queue readiness,
 * and allows queuing eligible PRs.
 */

import { $ } from 'bun';
import { Command } from 'commander';

export interface CheckRunItem {
  __typename?: string;
  name?: string;
  context?: string;
  status?: string;
  conclusion?: string | null;
  state?: string;
  workflowName?: string;
  detailsUrl?: string;
  startedAt?: string;
  completedAt?: string;
}

export function deduplicateChecks(checks: CheckRunItem[]): CheckRunItem[] {
  const map = new Map<string, CheckRunItem>();

  for (const check of checks) {
    const key = check.name || check.context || 'Unknown check';
    const existing = map.get(key);
    if (!existing) {
      map.set(key, check);
      continue;
    }

    const existingTime = new Date(existing.completedAt || existing.startedAt || 0).getTime();
    const newTime = new Date(check.completedAt || check.startedAt || 0).getTime();

    if (newTime >= existingTime) {
      map.set(key, check);
    }
  }

  return Array.from(map.values());
}

export interface ReviewItem {
  author?: { login: string };
  state?: string;
  submittedAt?: string;
}

export interface LabelItem {
  name: string;
}

export interface PrDetails {
  number: number;
  title: string;
  body: string;
  url: string;
  isDraft: boolean;
  mergeable: string;
  mergeStateStatus: string;
  reviewDecision: string;
  reviews?: ReviewItem[];
  labels?: LabelItem[];
  statusCheckRollup?: CheckRunItem[];
  updatedAt: string;
}

export type PrReadinessStatus = 'QUEUED' | 'READY' | 'IN_PROGRESS' | 'BLOCKED';

export interface ReadinessEvaluation {
  prNumber: number;
  title: string;
  url: string;
  status: PrReadinessStatus;
  isDraft: boolean;
  mergeable: string;
  reviewDecision: string;
  mergifyProtectionsStatus: 'SUCCESS' | 'FAILURE' | 'PENDING' | 'MISSING';
  ciStatus: 'SUCCESS' | 'FAILURE' | 'PENDING' | 'EMPTY';
  failedChecks: string[];
  pendingChecks: string[];
  lintValid: boolean;
  lintErrors: string[];
  blockers: string[];
}

export function validatePrFormat(
  title: string,
  body: string,
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Title validation
  if (title.length > 72) {
    errors.push(`Title exceeds 72 characters (${title.length}/72)`);
  }
  if (title.endsWith('.')) {
    errors.push('Title must not end with a period');
  }
  const typeMatch = title.match(/^([a-z]+)(\([a-z0-9._-]+\))?!?:\s+(.+)$/);
  if (!typeMatch) {
    errors.push('Title does not match conventional commit format (e.g. feat: ..., fix(ci): ...)');
  }

  // Header validation
  const detailedDescMatch = body.match(/^Detailed Description\r?\n---+\r?$/m);
  const relevantTicketsMatch = body.match(/^Relevant Linear Tickets\r?\n---+\r?$/m);
  const reviewsMergingMatch = body.match(/^Reviews and Merging\r?\n---+\r?$/m);

  if (!detailedDescMatch) {
    errors.push("Missing or invalid 'Detailed Description' Setext header");
  }
  if (!relevantTicketsMatch) {
    errors.push("Missing or invalid 'Relevant Linear Tickets' Setext header");
  }
  if (!reviewsMergingMatch) {
    errors.push("Missing or invalid 'Reviews and Merging' Setext header");
  }

  // Linear Ticket reference validation
  const ticketPattern = /This change contributes to [A-Z]+-\d+/;
  if (!ticketPattern.test(body)) {
    errors.push("Missing valid ticket reference ('This change contributes to RHL-XXXX.')");
  }

  // Reviews and Merging must be empty
  const reviewsIdx = body.indexOf('Reviews and Merging');
  if (reviewsIdx !== -1) {
    const afterReviews = body.slice(reviewsIdx).split('\n').slice(2).join('\n').trim();
    if (afterReviews.length > 0) {
      errors.push("'Reviews and Merging' section must be empty");
    }
  }

  return { valid: errors.length === 0, errors };
}

export function evaluatePr(pr: PrDetails): ReadinessEvaluation {
  const blockers: string[] = [];
  const failedChecks: string[] = [];
  const pendingChecks: string[] = [];
  let mergifyProtectionsStatus: 'SUCCESS' | 'FAILURE' | 'PENDING' | 'MISSING' = 'MISSING';
  let isAlreadyQueued = false;

  // Check if labeled as queued
  if (pr.labels?.some((l) => l.name.toLowerCase() === 'queued')) {
    isAlreadyQueued = true;
  }

  // 1. Draft check
  if (pr.isDraft) {
    blockers.push('PR is marked as Draft');
  }

  // 2. Mergeable check
  if (pr.mergeable === 'CONFLICTING') {
    blockers.push('Has merge conflicts with target branch');
  } else if (pr.mergeable !== 'MERGEABLE') {
    blockers.push(`Mergeable status is ${pr.mergeable}`);
  }

  // 3. Review decision
  if (pr.reviewDecision === 'CHANGES_REQUESTED') {
    blockers.push('Changes requested by reviewer(s)');
  } else if (pr.reviewDecision !== 'APPROVED') {
    blockers.push(`Review decision is ${pr.reviewDecision || 'PENDING'}`);
  }

  // 4. CI checks & Mergify Protections
  let ciStatus: 'SUCCESS' | 'FAILURE' | 'PENDING' | 'EMPTY' = 'EMPTY';
  if (pr.statusCheckRollup && pr.statusCheckRollup.length > 0) {
    ciStatus = 'SUCCESS';
    const effectiveChecks = deduplicateChecks(pr.statusCheckRollup);
    for (const check of effectiveChecks) {
      const name = check.name || check.context || 'Unknown check';
      const conclusion = (check.conclusion || check.state || '').toUpperCase();
      const status = (check.status || '').toUpperCase();

      if (name === 'Mergify Merge Protections') {
        if (conclusion === 'SUCCESS') mergifyProtectionsStatus = 'SUCCESS';
        else if (conclusion === 'FAILURE') mergifyProtectionsStatus = 'FAILURE';
        else if (status === 'IN_PROGRESS' || status === 'QUEUED')
          mergifyProtectionsStatus = 'PENDING';
      }

      if (name === 'Mergify Merge Queue' && (status === 'IN_PROGRESS' || status === 'QUEUED')) {
        isAlreadyQueued = true;
      }

      // Ignore Mergify Merge Queue check when calculating standard CI pending state
      if (name === 'Mergify Merge Queue') {
        continue;
      }

      if (status === 'IN_PROGRESS' || status === 'QUEUED') {
        pendingChecks.push(name);
      } else if (
        conclusion === 'FAILURE' ||
        conclusion === 'TIMED_OUT' ||
        conclusion === 'STARTUP_FAILURE' ||
        conclusion === 'ERROR'
      ) {
        failedChecks.push(name);
      }
    }

    if (failedChecks.length > 0) {
      ciStatus = 'FAILURE';
      blockers.push(
        `${failedChecks.length} CI check(s) failing (e.g. ${failedChecks.slice(0, 2).join(', ')})`,
      );
    } else if (pendingChecks.length > 0) {
      ciStatus = 'PENDING';
      blockers.push(`${pendingChecks.length} CI check(s) currently running`);
    }
  } else {
    blockers.push('No CI check results found');
  }

  if (
    mergifyProtectionsStatus === 'FAILURE' &&
    !failedChecks.includes('Mergify Merge Protections')
  ) {
    blockers.push('Mergify Merge Protections check is failing');
  }

  // 5. Title & Body linting
  const lint = validatePrFormat(pr.title, pr.body || '');
  if (!lint.valid) {
    blockers.push(`PR format lint issue: ${lint.errors[0]}`);
  }

  let finalStatus: PrReadinessStatus = 'BLOCKED';
  if (isAlreadyQueued) {
    finalStatus = 'QUEUED';
  } else if (blockers.length === 0) {
    finalStatus = 'READY';
  } else if (ciStatus === 'PENDING' && blockers.every((b) => b.includes('currently running'))) {
    finalStatus = 'IN_PROGRESS';
  }

  return {
    prNumber: pr.number,
    title: pr.title,
    url: pr.url,
    status: finalStatus,
    isDraft: pr.isDraft,
    mergeable: pr.mergeable,
    reviewDecision: pr.reviewDecision,
    mergifyProtectionsStatus,
    ciStatus,
    failedChecks,
    pendingChecks,
    lintValid: lint.valid,
    lintErrors: lint.errors,
    blockers,
  };
}

export async function getCurrentUser(): Promise<string> {
  const res = await $`gh api user --jq .login`.quiet();
  if (res.exitCode === 0) {
    return res.stdout.toString().trim();
  }
  return 'mcfa77y';
}

export async function fetchOpenPrs(repo: string, author?: string): Promise<PrDetails[]> {
  const baseFields = [
    'number',
    'title',
    'body',
    'url',
    'isDraft',
    'mergeable',
    'mergeStateStatus',
    'reviewDecision',
    'reviews',
    'labels',
    'updatedAt',
  ].join(',');

  const authorFilter = author ? ['--author', author] : [];
  const res =
    await $`gh pr list --repo ${repo} ${authorFilter} --state open --json ${baseFields}`.quiet();
  if (res.exitCode !== 0) {
    throw new Error(`Failed to fetch PRs from GitHub: ${res.stderr.toString()}`);
  }

  const list = JSON.parse(res.stdout.toString()) as PrDetails[];

  // Fetch statusCheckRollup per PR in small concurrent batches to prevent GraphQL 504 timeouts
  const concurrency = 4;
  const enriched: PrDetails[] = [];

  for (let i = 0; i < list.length; i += concurrency) {
    const batch = list.slice(i, i + concurrency);
    const batchResults = await Promise.all(
      batch.map(async (pr) => {
        try {
          const checkRes =
            await $`gh pr view ${pr.number} --repo ${repo} --json statusCheckRollup`.quiet();
          if (checkRes.exitCode === 0) {
            const data = JSON.parse(checkRes.stdout.toString());
            pr.statusCheckRollup = data.statusCheckRollup || [];
          }
        } catch {
          // If check fetch fails, statusCheckRollup will remain undefined/empty
        }
        return pr;
      }),
    );
    enriched.push(...batchResults);
  }

  return enriched;
}

export async function queuePr(repo: string, prNumber: number): Promise<void> {
  console.log(`Queuing PR #${prNumber} on ${repo} via '@mergifyio queue'...`);
  const commentRes =
    await $`gh pr comment ${prNumber} --repo ${repo} --body "@mergifyio queue"`.quiet();
  if (commentRes.exitCode !== 0) {
    throw new Error(`Failed to queue PR #${prNumber}: ${commentRes.stderr.toString()}`);
  }
  console.log(`✓ PR #${prNumber} successfully queued!`);
}

export function formatReportMarkdown(
  evaluations: ReadinessEvaluation[],
  repo: string,
  author: string,
): string {
  const ready = evaluations.filter((e) => e.status === 'READY');
  const queued = evaluations.filter((e) => e.status === 'QUEUED');
  const inProgress = evaluations.filter((e) => e.status === 'IN_PROGRESS');
  const blocked = evaluations.filter((e) => e.status === 'BLOCKED');

  const lines: string[] = [];
  lines.push(`## Mergify PR Readiness Report: \`${repo}\` (@${author})\n`);
  lines.push(
    `**Summary**: ${ready.length} Ready | ${queued.length} Queued | ${inProgress.length} In Progress | ${blocked.length} Blocked (Total: ${evaluations.length})\n`,
  );

  lines.push('| PR | Title | Status | Review | Mergeable | CI / Protections | Blockers |');
  lines.push('|---|---|---|---|---|---|---|');

  for (const item of evaluations) {
    const badge =
      item.status === 'READY'
        ? '✅ **READY**'
        : item.status === 'QUEUED'
          ? '⏳ **QUEUED**'
          : item.status === 'IN_PROGRESS'
            ? '🔄 **IN PROGRESS**'
            : '❌ **BLOCKED**';

    const blockersText = item.blockers.length > 0 ? item.blockers.join('; ') : '-';
    lines.push(
      `| [#${item.prNumber}](${item.url}) | ${item.title.replace(/\|/g, '\\|')} | ${badge} | ${item.reviewDecision || 'PENDING'} | ${item.mergeable} | ${item.ciStatus} / ${item.mergifyProtectionsStatus} | ${blockersText.replace(/\|/g, '\\|')} |`,
    );
  }

  return lines.join('\n');
}

export async function main() {
  const program = new Command()
    .name('queue_prs')
    .description('Inspect open PRs for Mergify queue readiness and queue eligible PRs')
    .option('-r, --repo <repo>', 'Target GitHub repository', 'EmpoHealth/core')
    .option('-a, --author <author>', 'Target PR author (defaults to current user)')
    .option('--queue <prNumber>', 'Directly queue a specific PR by number', (v) => parseInt(v, 10))
    .option('--queue-all-ready', 'Queue all PRs that are currently verified as READY')
    .option('--format <format>', 'Output format: text, markdown, or json', 'text');

  program.parse();
  const opts = program.opts();

  const author = opts.author || (await getCurrentUser());
  const repo = opts.repo;

  if (opts.queue) {
    await queuePr(repo, opts.queue);
    return;
  }

  console.log(`\nFetching open PRs for @${author} in ${repo}...`);
  const prs = await fetchOpenPrs(repo, author);
  console.log(`Found ${prs.length} open PR(s).\n`);

  const evaluations = prs.map(evaluatePr);
  const readyPrs = evaluations.filter((e) => e.status === 'READY');

  if (opts.format === 'json') {
    console.log(JSON.stringify(evaluations, null, 2));
    return;
  }

  if (opts.format === 'markdown') {
    console.log(formatReportMarkdown(evaluations, repo, author));
    return;
  }

  console.log('='.repeat(90));
  console.log(`MERGIFY PR READINESS REPORT: ${repo} (@${author})`);
  console.log('='.repeat(90));

  for (const item of evaluations) {
    const statusIcon =
      item.status === 'READY'
        ? '✅ READY'
        : item.status === 'QUEUED'
          ? '⏳ ALREADY QUEUED'
          : item.status === 'IN_PROGRESS'
            ? '🔄 IN PROGRESS'
            : '❌ BLOCKED';

    console.log(`\n${statusIcon} | PR #${item.prNumber}: ${item.title}`);
    console.log(`   URL: ${item.url}`);
    console.log(
      `   Review: ${item.reviewDecision || 'PENDING'} | Mergeable: ${item.mergeable} | CI: ${item.ciStatus} | Protections: ${item.mergifyProtectionsStatus}`,
    );
    if (item.blockers.length > 0) {
      console.log('   Blockers:');
      for (const blocker of item.blockers) {
        console.log(`     - ${blocker}`);
      }
    }
  }

  const queuedPrs = evaluations.filter((e) => e.status === 'QUEUED');
  const inProgressPrs = evaluations.filter((e) => e.status === 'IN_PROGRESS');
  const blockedPrs = evaluations.filter((e) => e.status === 'BLOCKED');

  console.log('\n' + '='.repeat(90));
  console.log(
    `SUMMARY: ${readyPrs.length} ready, ${queuedPrs.length} already queued, ${inProgressPrs.length} in progress, ${blockedPrs.length} blocked (${evaluations.length} total).`,
  );
  console.log('='.repeat(90));

  if (readyPrs.length > 0) {
    console.log('\nReady to be queued:');
    for (const pr of readyPrs) {
      console.log(`  - #${pr.prNumber}: ${pr.title}`);
    }

    if (opts.queueAllReady) {
      console.log('\n--queue-all-ready specified. Proceeding to queue ready PRs...');
      for (const pr of readyPrs) {
        await queuePr(repo, pr.prNumber);
      }
    }
  }
}

if (import.meta.main) {
  await main();
}

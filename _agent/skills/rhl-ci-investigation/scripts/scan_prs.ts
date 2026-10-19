#!/usr/bin/env bun
/**
 * scan_prs.ts
 *
 * Scans open pull requests across all pages to detect affected PRs where
 * ephemeral staging environments were prematurely destroyed or where
 * Terraform workspace initialization/cache selection failed.
 */

import { $ } from 'bun';
import { Command } from 'commander';

export const DEFAULT_REPO = 'EmpoHealth/core';

export interface PullRequest {
  number: number;
  title: string;
  headRefName: string;
  url: string;
  author: { login: string };
}

export interface WorkflowRun {
  databaseId: number;
  name: string;
  status: string;
  conclusion: string;
  url: string;
}

export interface FailureMatch {
  runId: number;
  jobName: string;
  runUrl: string;
  category: 'destroyed-backend' | 'terraform-workspace';
  matchedText: string;
}

export interface ScannedPRResult {
  prNumber: number;
  prTitle: string;
  prUrl: string;
  author: string;
  branch: string;
  destroyedBackendQAFailures: FailureMatch[];
  terraformInitWorkspaceFailures: FailureMatch[];
}

export interface ScanOptions {
  repo?: string;
  limit?: number;
  author?: string;
  pr?: number;
  format?: 'table' | 'json' | 'markdown';
  dryRun?: boolean;
}

/**
 * Checks log text against known signatures for prematurely destroyed preview environments.
 */
export function matchDestroyedBackendSignature(logText: string): string | null {
  if (logText.includes('getaddrinfo ENOTFOUND')) {
    return 'getaddrinfo ENOTFOUND';
  }
  if (logText.includes('net::ERR_NAME_NOT_RESOLVED')) {
    return 'net::ERR_NAME_NOT_RESOLVED';
  }
  if (logText.includes('503 Service Temporarily Unavailable')) {
    return '503 Service Temporarily Unavailable';
  }
  return null;
}

/**
 * Checks log text against known signatures for Terraform workspace selection / cache failures.
 */
export function matchTerraformWorkspaceSignature(logText: string): string | null {
  if (logText.includes('Failed to select workspace: EOF')) {
    return 'Failed to select workspace: EOF';
  }
  if (logText.includes('Currently selected workspace') && logText.includes('does not exist')) {
    return 'Currently selected workspace does not exist';
  }
  if (logText.includes('does not exist. Please enter a number to select a workspace')) {
    return 'Workspace does not exist (interactive prompt)';
  }
  return null;
}

/**
 * Parses raw JSON output from `gh pr list` into typed PullRequest array.
 */
export function parsePullRequestsJson(jsonText: string): PullRequest[] {
  try {
    const parsed = JSON.parse(jsonText);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((item) => ({
      number: item.number,
      title: item.title,
      headRefName: item.headRefName || '',
      url: item.url || '',
      author: { login: item.author?.login || 'unknown' },
    }));
  } catch {
    return [];
  }
}

/**
 * Formats results into GitHub-flavored Markdown.
 */
export function formatMarkdownReport(results: ScannedPRResult[]): string {
  if (results.length === 0) {
    return '### Open PR Environment Scan\n\nNo affected pull requests detected. All ephemeral environments and workflows are healthy.\n';
  }

  let out = '### Open PR Environment Scan Report\n\n';
  out += `Found **${results.length}** affected pull requests.\n\n`;
  out += '| PR | Author | Branch | Destroyed QA Failures | Terraform Workspace Errors |\n';
  out += '|---|---|---|:---:|:---:|\n';

  for (const r of results) {
    out += `| [#${r.prNumber}](${r.prUrl}) | @${r.author} | \`${r.branch}\` | ${r.destroyedBackendQAFailures.length} | ${r.terraformInitWorkspaceFailures.length} |\n`;
  }

  out += '\n#### Failure Details\n\n';
  for (const r of results) {
    out += `##### PR #${r.prNumber}: ${r.prTitle}\n`;
    if (r.destroyedBackendQAFailures.length > 0) {
      out += '- **Destroyed Backend Failures**:\n';
      for (const f of r.destroyedBackendQAFailures) {
        out += `  - [${f.jobName}](${f.runUrl}) (matched: \`${f.matchedText}\`)\n`;
      }
    }
    if (r.terraformInitWorkspaceFailures.length > 0) {
      out += '- **Terraform Workspace / EOF Failures**:\n';
      for (const f of r.terraformInitWorkspaceFailures) {
        out += `  - [${f.jobName}](${f.runUrl}) (matched: \`${f.matchedText}\`)\n`;
      }
    }
  }

  return out;
}

export async function fetchOpenPRs(
  repo: string,
  limit = 100,
  author?: string,
): Promise<PullRequest[]> {
  const authorFlag = author ? `--author ${author}` : '';
  const cmd = `gh pr list --repo ${repo} --state open --limit ${limit} ${authorFlag} --json number,title,headRefName,url,author`;
  const result = await $`sh -c ${cmd}`.quiet().text();
  return parsePullRequestsJson(result);
}

export async function fetchBranchRuns(
  repo: string,
  branch: string,
  limit = 10,
): Promise<WorkflowRun[]> {
  try {
    const cmd = `gh run list --repo ${repo} --branch ${branch} --limit ${limit} --json databaseId,name,status,conclusion,url`;
    const result = await $`sh -c ${cmd}`.quiet().text();
    const runs = JSON.parse(result);
    return Array.isArray(runs) ? runs : [];
  } catch {
    return [];
  }
}

export async function fetchFailedRunLog(repo: string, runId: number): Promise<string> {
  try {
    const cmd = `gh run view ${runId} --repo ${repo} --log-failed`;
    const result = await $`sh -c ${cmd}`.quiet().text();
    return result;
  } catch (err: any) {
    return err?.stdout?.toString() || '';
  }
}

export async function scanPRs(options: ScanOptions = {}): Promise<ScannedPRResult[]> {
  const repo = options.repo || DEFAULT_REPO;
  let prs: PullRequest[] = [];

  if (options.pr) {
    const cmd = `gh pr view ${options.pr} --repo ${repo} --json number,title,headRefName,url,author`;
    try {
      const res = await $`sh -c ${cmd}`.quiet().text();
      const parsed = JSON.parse(res);
      prs = [
        {
          number: parsed.number,
          title: parsed.title,
          headRefName: parsed.headRefName,
          url: parsed.url,
          author: { login: parsed.author?.login || 'unknown' },
        },
      ];
    } catch {
      return [];
    }
  } else {
    prs = await fetchOpenPRs(repo, options.limit || 100, options.author);
  }

  const affectedResults: ScannedPRResult[] = [];

  for (const pr of prs) {
    if (!pr.headRefName) continue;
    const runs = await fetchBranchRuns(repo, pr.headRefName, 10);
    const failedRuns = runs.filter((r) => r.conclusion === 'failure');
    if (failedRuns.length === 0) continue;

    const result: ScannedPRResult = {
      prNumber: pr.number,
      prTitle: pr.title,
      prUrl: pr.url,
      author: pr.author.login,
      branch: pr.headRefName,
      destroyedBackendQAFailures: [],
      terraformInitWorkspaceFailures: [],
    };

    for (const run of failedRuns) {
      const log = await fetchFailedRunLog(repo, run.databaseId);
      const destroyedMatch = matchDestroyedBackendSignature(log);
      if (destroyedMatch) {
        result.destroyedBackendQAFailures.push({
          runId: run.databaseId,
          jobName: run.name,
          runUrl: run.url,
          category: 'destroyed-backend',
          matchedText: destroyedMatch,
        });
      }

      const tfMatch = matchTerraformWorkspaceSignature(log);
      if (tfMatch) {
        result.terraformInitWorkspaceFailures.push({
          runId: run.databaseId,
          jobName: run.name,
          runUrl: run.url,
          category: 'terraform-workspace',
          matchedText: tfMatch,
        });
      }
    }

    if (
      result.destroyedBackendQAFailures.length > 0 ||
      result.terraformInitWorkspaceFailures.length > 0
    ) {
      affectedResults.push(result);
    }
  }

  return affectedResults;
}

if (import.meta.main) {
  const program = new Command()
    .name('scan_prs')
    .description(
      'Scan open pull requests for premature environment teardown and Terraform workspace errors',
    )
    .option('-r, --repo <repo>', 'GitHub repository (default: EmpoHealth/core)', DEFAULT_REPO)
    .option('-l, --limit <limit>', 'Maximum number of open PRs to fetch', '100')
    .option('-a, --author <author>', 'Filter by PR author')
    .option('-p, --pr <pr>', 'Scan a single pull request by number')
    .option('-f, --format <format>', 'Output format: table, json, or markdown', 'markdown')
    .action(async (opts) => {
      const limit = parseInt(opts.limit, 10) || 100;
      const prNumber = opts.pr ? parseInt(opts.pr, 10) : undefined;

      const results = await scanPRs({
        repo: opts.repo,
        limit,
        author: opts.author,
        pr: prNumber,
      });

      if (opts.format === 'json') {
        console.log(JSON.stringify(results, null, 2));
      } else {
        console.log(formatMarkdownReport(results));
      }
    });

  program.parse(process.argv);
}

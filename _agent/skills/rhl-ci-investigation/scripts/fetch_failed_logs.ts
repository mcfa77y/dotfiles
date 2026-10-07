#!/usr/bin/env bun
/**
 * fetch_failed_logs.ts
 *
 * Fetch and parse logs for failed jobs in a GitHub Actions workflow run.
 * Works even while the workflow run is still in progress.
 */

import { mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { $ } from 'bun';
import { Command } from 'commander';

export const DEFAULT_REPO = 'EmpoHealth/core';

export interface ParsedTarget {
  repo: string;
  runId: string | null;
  jobId: string | null;
}

export function parseUrlOrId(inputStr: string): ParsedTarget {
  const target = inputStr.trim();
  let repo = DEFAULT_REPO;
  let runId: string | null = null;
  let jobId: string | null = null;

  if (target.startsWith('http://') || target.startsWith('https://')) {
    const url = new URL(target);
    const pathParts = url.pathname.split('/').filter(Boolean);

    if (pathParts.length >= 2) {
      repo = `${pathParts[0]}/${pathParts[1]}`;
    }

    const runsIdx = pathParts.indexOf('runs');
    if (runsIdx !== -1 && runsIdx + 1 < pathParts.length) {
      runId = pathParts[runsIdx + 1]!;
    }

    const jobIdx = pathParts.indexOf('job');
    if (jobIdx !== -1 && jobIdx + 1 < pathParts.length) {
      jobId = pathParts[jobIdx + 1]!;
    }
  } else if (target.includes('/')) {
    const parts = target.split('/');
    if (parts.length === 2 && !target.includes('actions')) {
      repo = target;
    }
  } else if (/^\d+$/.test(target)) {
    runId = target;
  }

  return { repo, runId, jobId };
}

export interface PlaywrightError {
  file: string;
  test: string;
  error: string;
  expected?: string;
  received?: string;
  snippet?: string;
}

function parsePlaywrightHeader(trimmed: string): { file: string; test: string } | null {
  const parenIdx = trimmed.indexOf(') [');
  const closeBracketIdx = trimmed.indexOf('] › ');
  if (parenIdx <= 0 || closeBracketIdx <= parenIdx) return null;

  const rest = trimmed.slice(closeBracketIdx + 4);
  const chevronIdx = rest.indexOf(' › ');
  if (chevronIdx <= 0) return null;

  const fileLoc = rest.slice(0, chevronIdx).trim();
  const testName = rest.slice(chevronIdx + 3).trim();
  const colon1 = fileLoc.lastIndexOf(':');
  const colon2 = colon1 > 0 ? fileLoc.lastIndexOf(':', colon1 - 1) : -1;
  const file = colon2 > 0 ? fileLoc.slice(0, colon1) : fileLoc;
  return { file, test: testName };
}

function extractExpectedReceived(trimmed: string, err: PlaywrightError) {
  if (trimmed.startsWith('Expected:') || trimmed.startsWith('Expected string:')) {
    if (!err.expected) {
      const colonIdx = trimmed.indexOf(':');
      err.expected = trimmed.slice(colonIdx + 1).trim();
    }
  } else if (trimmed.startsWith('Expected ') && !err.expected) {
    err.expected = trimmed.slice('Expected '.length).trim();
  }

  if (trimmed.startsWith('Received:') || trimmed.startsWith('Received string:')) {
    if (!err.received) {
      const colonIdx = trimmed.indexOf(':');
      err.received = trimmed.slice(colonIdx + 1).trim();
    }
  } else if (trimmed.startsWith('Received ') && !err.received) {
    err.received = trimmed.slice('Received '.length).trim();
  }
}

export function extractPlaywrightErrors(logText: string): PlaywrightError[] {
  const errors: PlaywrightError[] = [];
  const lines = logText.split('\n');

  let currentError: PlaywrightError | null = null;
  const bodyLines: string[] = [];

  function flushCurrent() {
    if (currentError) {
      currentError.error = bodyLines.join('\n').trim();
      for (const line of bodyLines) {
        extractExpectedReceived(line.trim(), currentError);
      }
      errors.push(currentError);
      bodyLines.length = 0;
      currentError = null;
    }
  }

  for (const line of lines) {
    const trimmed = line.trim();
    const header = parsePlaywrightHeader(trimmed);
    if (header) {
      flushCurrent();
      currentError = { file: header.file, test: header.test, error: '' };
      continue;
    }

    if (trimmed.startsWith('Slow test') || trimmed.endsWith(' failed')) {
      flushCurrent();
    } else if (currentError) {
      bodyLines.push(line);
    }
  }
  flushCurrent();

  return errors;
}

export async function fetchJobLog(repo: string, jobId: string): Promise<string> {
  try {
    return await $`gh api repos/${repo}/actions/jobs/${jobId}/logs --allow-escape-sequences`
      .quiet()
      .text();
  } catch (err: unknown) {
    throw new Error(
      `Failed to fetch logs for job ${jobId}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

export function displayPlaywrightErrors(errors: PlaywrightError[], prefix = ''): void {
  for (const err of errors) {
    if (prefix) {
      console.log(`${prefix}${err.file}: ${err.test}`);
    } else {
      console.log(`\n• File: ${err.file}`);
      console.log(`  Test: ${err.test}`);
      if (err.expected) console.log(`  Expected: ${err.expected}`);
      if (err.received) console.log(`  Received: ${err.received}`);
    }
  }
}

export async function handleSingleJob(repo: string, jobId: string, outDir: string): Promise<void> {
  console.log(`Fetching log for single job ${jobId} (${repo})...`);
  const log = await fetchJobLog(repo, jobId);
  const logFile = join(outDir, `job_${jobId}.log`);
  await Bun.write(logFile, log);
  console.log(`Saved log to ${logFile}`);

  const errors = extractPlaywrightErrors(log);
  if (errors.length > 0) {
    console.log(`\nFound ${errors.length} Playwright test failure(s):`);
    displayPlaywrightErrors(errors);
  }
}

export interface WorkflowJob {
  id: number | string;
  name: string;
  conclusion?: string;
}

export async function fetchFailedJobs(repo: string, runId: string): Promise<WorkflowJob[]> {
  console.log(`Fetching jobs for run ${runId} (${repo})...`);
  const jobsOutput = await $`gh api repos/${repo}/actions/runs/${runId}/jobs --paginate`
    .quiet()
    .text();
  const jobsData = JSON.parse(jobsOutput);
  const jobs: WorkflowJob[] = Array.isArray(jobsData) ? jobsData : jobsData.jobs || [];

  const failedJobs = jobs.filter((j) => j.conclusion === 'failure');
  console.log(`Total jobs: ${jobs.length} | Failed jobs: ${failedJobs.length}`);
  return failedJobs;
}

export async function processFailedJob(
  repo: string,
  job: WorkflowJob,
  outDir: string,
): Promise<void> {
  console.log(`\n--- [FAILED] ${job.name} (Job ID: ${job.id}) ---`);
  try {
    const log = await fetchJobLog(repo, String(job.id));
    const safeName = job.name.replace(/[^a-zA-Z0-9_-]/g, '_');
    const logFile = join(outDir, `job_${job.id}_${safeName}.log`);
    await Bun.write(logFile, log);
    console.log(`Saved log: ${logFile}`);

    const errors = extractPlaywrightErrors(log);
    if (errors.length > 0) {
      console.log(`  → Extracted ${errors.length} Playwright failure(s):`);
      displayPlaywrightErrors(errors, '    • ');
    }
  } catch (err: unknown) {
    console.error(
      `  ✗ Error retrieving job log: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

export async function downloadRunArtifacts(
  repo: string,
  runId: string,
  outDir: string,
): Promise<void> {
  console.log(`\nDownloading artifacts for run ${runId}...`);
  const artifactsDir = join(outDir, 'artifacts');
  try {
    await $`gh run download ${runId} --repo ${repo} --dir ${artifactsDir}`.quiet();
    console.log(`Artifacts downloaded to ${artifactsDir}`);
  } catch (err: unknown) {
    console.error(
      `Failed to download artifacts: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

export async function runCli(): Promise<void> {
  const program = new Command()
    .name('fetch_failed_logs')
    .description('Fetch and parse logs for failed jobs in a GitHub Actions workflow run.')
    .option('-r, --run-id <id_or_url>', 'GitHub Actions run ID or full run/job URL')
    .option('-j, --job-id <id>', 'Specific GitHub Actions job ID')
    .option('--repo <owner/repo>', 'GitHub repository', DEFAULT_REPO)
    .option('-o, --out-dir <dir>', 'Directory to save log files')
    .option('-d, --download-artifacts', 'Download and extract run artifacts (qa-pr-report)')
    .addHelpText(
      'after',
      `
Examples:
  $ bun run fetch_failed_logs.ts --run-id 35910923024
  $ bun run fetch_failed_logs.ts --run-id "https://github.com/EmpoHealth/core/actions/runs/35910923024/job/107357575748"
  $ bun run fetch_failed_logs.ts --job-id 107357575748
  $ bun run fetch_failed_logs.ts --run-id 35910923024 --download-artifacts
`,
    );

  program.parse();

  const opts = program.opts<{
    runId?: string;
    jobId?: string;
    repo?: string;
    outDir?: string;
    downloadArtifacts?: boolean;
  }>();

  let targetRepo = opts.repo || DEFAULT_REPO;
  let targetRunId = opts.runId || null;
  let targetJobId = opts.jobId || null;

  if (targetRunId) {
    const parsed = parseUrlOrId(targetRunId);
    if (parsed.repo) targetRepo = parsed.repo;
    if (parsed.runId) targetRunId = parsed.runId;
    if (parsed.jobId && !targetJobId) targetJobId = parsed.jobId;
  }

  if (!targetRunId && !targetJobId) {
    console.error('Error: Must specify --run-id <ID/URL> or --job-id <ID>.');
    program.help();
  }

  const outDir = opts.outDir || mkdtempSync(join(tmpdir(), 'ci_logs-'));
  mkdirSync(outDir, { recursive: true });

  if (targetJobId) {
    await handleSingleJob(targetRepo, targetJobId, outDir);
    return;
  }

  const failedJobs = await fetchFailedJobs(targetRepo, targetRunId!);
  if (failedJobs.length === 0) {
    console.log('No failed jobs found for this run.');
    return;
  }

  for (const job of failedJobs) {
    await processFailedJob(targetRepo, job, outDir);
  }

  if (opts.downloadArtifacts && targetRunId) {
    await downloadRunArtifacts(targetRepo, targetRunId, outDir);
  }
}

if (import.meta.main) {
  try {
    await runCli();
  } catch (err: unknown) {
    console.error('Fatal error:', err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

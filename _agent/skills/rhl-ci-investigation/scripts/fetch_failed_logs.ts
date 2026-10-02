#!/usr/bin/env bun
/**
 * fetch_failed_logs.ts
 *
 * Fetch and parse logs for failed jobs in a GitHub Actions workflow run.
 * Works even while the workflow run is still in progress.
 */

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

export function extractPlaywrightErrors(logText: string): PlaywrightError[] {
  const errors: PlaywrightError[] = [];
  const testBlockRegex =
    /(\d+\)\s+\[[^\]]+\]\s+›\s+([^:]+):(\d+):(\d+)\s+›\s+([^\n]+))([\s\S]*?)(?=\n\s*\d+\)\s+\[|\n\s*Slow test|\n\s*\d+\s+failed|$)/g;

  for (const match of logText.matchAll(testBlockRegex)) {
    const file = match[2] ? `${match[2]}:${match[3]}` : '';
    const test = match[5]?.trim() || '';
    const body = match[6] || '';

    const expectedMatch = body.match(/Expected(?:\s+string)?:?\s*(.+)/);
    const receivedMatch = body.match(/Received(?:\s+string)?:?\s*(.+)/);

    errors.push({
      file,
      test,
      error: body.trim(),
      expected: expectedMatch?.[1]?.trim(),
      received: receivedMatch?.[1]?.trim(),
    });
  }

  return errors;
}

export async function fetchJobLog(repo: string, jobId: string): Promise<string> {
  try {
    return await $`gh api repos/${repo}/actions/jobs/${jobId}/logs`.quiet().text();
  } catch (err: unknown) {
    throw new Error(
      `Failed to fetch logs for job ${jobId}: ${err instanceof Error ? err.message : String(err)}`,
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
    .option('-o, --out-dir <dir>', 'Directory to save log files', '/tmp/ci_logs')
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

  const outDir = opts.outDir || '/tmp/ci_logs';
  await $`mkdir -p ${outDir}`.quiet();

  if (targetJobId) {
    console.log(`Fetching log for single job ${targetJobId} (${targetRepo})...`);
    const log = await fetchJobLog(targetRepo, targetJobId);
    const logFile = `${outDir}/job_${targetJobId}.log`;
    await Bun.write(logFile, log);
    console.log(`Saved log to ${logFile}`);

    const errors = extractPlaywrightErrors(log);
    if (errors.length > 0) {
      console.log(`\nFound ${errors.length} Playwright test failure(s):`);
      for (const err of errors) {
        console.log(`\n• File: ${err.file}`);
        console.log(`  Test: ${err.test}`);
        if (err.expected) console.log(`  Expected: ${err.expected}`);
        if (err.received) console.log(`  Received: ${err.received}`);
      }
    }
    return;
  }

  console.log(`Fetching jobs for run ${targetRunId} (${targetRepo})...`);
  const jobsOutput = await $`gh api repos/${targetRepo}/actions/runs/${targetRunId}/jobs --paginate`
    .quiet()
    .text();
  const jobsData = JSON.parse(jobsOutput);
  const jobs: any[] = Array.isArray(jobsData) ? jobsData : jobsData.jobs || [];

  const failedJobs = jobs.filter((j) => j.conclusion === 'failure');
  console.log(`Total jobs: ${jobs.length} | Failed jobs: ${failedJobs.length}`);

  if (failedJobs.length === 0) {
    console.log('No failed jobs found for this run.');
    return;
  }

  for (const job of failedJobs) {
    console.log(`\n--- [FAILED] ${job.name} (Job ID: ${job.id}) ---`);
    try {
      const log = await fetchJobLog(targetRepo, String(job.id));
      const logFile = `${outDir}/job_${job.id}_${job.name.replace(/[^a-zA-Z0-9_-]/g, '_')}.log`;
      await Bun.write(logFile, log);
      console.log(`Saved log: ${logFile}`);

      const errors = extractPlaywrightErrors(log);
      if (errors.length > 0) {
        console.log(`  → Extracted ${errors.length} Playwright failure(s):`);
        for (const err of errors) {
          console.log(`    • ${err.file}: ${err.test}`);
        }
      }
    } catch (err: unknown) {
      console.error(
        `  ✗ Error retrieving job log: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  if (opts.downloadArtifacts && targetRunId) {
    console.log(`\nDownloading artifacts for run ${targetRunId}...`);
    try {
      await $`gh run download ${targetRunId} --repo ${targetRepo} --dir ${outDir}/artifacts`.quiet();
      console.log(`Artifacts downloaded to ${outDir}/artifacts`);
    } catch (err: unknown) {
      console.error(
        `Failed to download artifacts: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}

if (import.meta.main) {
  runCli().catch((err: unknown) => {
    console.error('Fatal error:', err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
}

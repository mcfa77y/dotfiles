#!/usr/bin/env bun
/**
 * triage-pr-failures.ts
 *
 * Automated diagnostic triage tool for failing GitHub Actions CI pipelines and PR checks.
 * Matches known failure patterns (Terraform EOF, Playwright 502/503 ALB errors,
 * Yarn Berry lockfile sync YN0028, Docker push/auth failures) and generates structured reports.
 */

import { $ } from 'bun';
import { Command } from 'commander';
import stripAnsiPkg from 'strip-ansi';

/**
 * Strips standard ANSI terminal escape sequences and gh-CLI caret-bracket escapes (^[[...m).
 */
export function stripAnsi(text: string): string {
  return stripAnsiPkg(text).replace(/\^\[\[[0-9;]*[a-zA-Z]/g, '');
}

export const DEFAULT_REPO = 'EmpoHealth/core';

export interface CheckItem {
  name: string;
  status: string;
  duration: string;
  url: string;
  runId: string | null;
  jobId: string | null;
}

export interface DiagnosticFailure {
  category: string;
  errorExcerpt: string;
  rootCause: string;
  recommendation: string;
}

export interface TriageReportOptions {
  pr?: string | number;
  runId?: string;
  checks?: CheckItem[];
}

/**
 * Extracts failed checks/runs from raw `gh pr checks` text output.
 * Supports tab-delimited and columnar whitespace-delimited outputs.
 */
export function parseChecksOutput(checksText: string): CheckItem[] {
  const lines = checksText.split('\n');
  const results: CheckItem[] = [];

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    // Skip table header if present
    if (/^name\s+(?:state|status|elapsed|url|description)/i.test(line)) {
      continue;
    }

    let name = '';
    let status = '';
    let duration = '-';
    let url = '';

    if (line.includes('\t')) {
      const parts = line
        .split('\t')
        .map((p) => p.trim())
        .filter(Boolean);
      if (parts.length >= 4) {
        name = parts[0]!;
        status = parts[1]!;
        duration = parts[2]!;
        url = parts[3]!;
      } else if (parts.length === 3) {
        name = parts[0]!;
        status = parts[1]!;
        url = parts[2]!;
      }
    } else {
      // Columnar format: extract URL from end
      const urlMatch = line.match(/(https?:\/\/\S+)$/);
      if (urlMatch) {
        url = urlMatch[1]!;
        const beforeUrl = line.slice(0, line.length - url.length).trim();

        // Check for duration at end of beforeUrl (e.g. 12m34s, 45s, 1h2m, 0s, -)
        const durMatch = beforeUrl.match(/\s+(\d+[hms](?:\d+[ms])?|-)\s*$/i);
        let beforeDur = beforeUrl;
        if (durMatch) {
          duration = durMatch[1]!;
          beforeDur = beforeUrl.slice(0, beforeUrl.length - durMatch[0].length).trim();
        }

        // Check for status marker or status keyword at end of beforeDur
        const statusMatch = beforeDur.match(/\s+([a-zA-Z_]+|[✓✗X!])\s*$/);
        if (statusMatch) {
          status = statusMatch[1]!;
          name = beforeDur.slice(0, beforeDur.length - statusMatch[0].length).trim();
        } else {
          name = beforeDur;
        }
      }
    }

    // Clean leading status icons from job name (e.g., "X  Job Name", "✓  Job Name")
    name = name.replace(/^[✓✗X!*]\s+/, '').trim();

    // Check if status indicates failure
    const isFailure =
      /^(fail|failed|failure|timed_out|timeout|cancelled|canceled|startup_failure|action_required|x|✗)$/i.test(
        status,
      );

    if (isFailure && (name || url)) {
      let runId: string | null = null;
      let jobId: string | null = null;

      const runMatch = url.match(/\/runs\/(\d+)/);
      if (runMatch) {
        runId = runMatch[1]!;
      }

      const jobMatch = url.match(/\/job\/(\d+)/);
      if (jobMatch) {
        jobId = jobMatch[1]!;
      }

      results.push({
        name,
        status,
        duration: duration || '-',
        url,
        runId,
        jobId,
      });
    }
  }

  return results;
}

/**
 * Extracts a multi-line excerpt around a matching line index.
 */
function extractContextExcerpt(lines: string[], matchIndex: number, radius = 1): string {
  const start = Math.max(0, matchIndex - radius);
  const end = Math.min(lines.length - 1, matchIndex + radius);
  return lines
    .slice(start, end + 1)
    .map((l) => l.trimEnd())
    .join('\n');
}

/**
 * Matches log text against known CI failure patterns and returns structured diagnostics.
 */
export function diagnoseLogFailures(logText: string): DiagnosticFailure[] {
  const diagnostics: DiagnosticFailure[] = [];
  const cleanLog = stripAnsi(logText);
  const lines = cleanLog.split('\n');

  // Rule 1: Terraform workspace interactive EOF prompt
  const tfEofIndex = lines.findIndex(
    (line) =>
      /Failed to select workspace:\s*EOF/i.test(line) ||
      (/select workspace/i.test(line) && /EOF/i.test(line)),
  );
  if (tfEofIndex !== -1) {
    diagnostics.push({
      category: 'Terraform Workspace EOF',
      errorExcerpt: extractContextExcerpt(lines, tfEofIndex),
      rootCause:
        '.terraform/environment restored from cache or TF_PLUGIN_CACHE_DIR mismatch, causing Terraform to prompt interactively on a non-interactive CI runner.',
      recommendation:
        'Wipe stale .terraform cache entries, ensure CI runs with -no-color -input=false, and avoid restoring .terraform/environment across different branch runs.',
    });
  }

  // Rule 2: Playwright timeouts and HTTP 503 / 502 ALB errors
  const albErrorIndex = lines.findIndex(
    (line) =>
      /503\s+Service\s+Temporarily\s+Unavailable/i.test(line) ||
      /502\s+Bad\s+Gateway/i.test(line) ||
      /(?:HTTP\s*\/[0-9.]+\s+)?(?:502|503)\s+(?:Bad Gateway|Service Temporarily Unavailable)/i.test(
        line,
      ),
  );
  if (albErrorIndex !== -1) {
    diagnostics.push({
      category: 'Playwright E2E / ALB Gateway Error',
      errorExcerpt: extractContextExcerpt(lines, albErrorIndex),
      rootCause:
        'Ephemeral preview environment ALB or ECS task returned HTTP 502 Bad Gateway / 503 Service Temporarily Unavailable during page navigation or API requests.',
      recommendation:
        'Verify backend service health in ECS target groups, check service warm-up delays, and ensure preview environments are fully healthy before running E2E suites.',
    });
  } else {
    // Check for general Playwright timeout if no 502/503 ALB error was found
    const pwTimeoutIndex = lines.findIndex(
      (line) =>
        /TimeoutError:.*exceeded/i.test(line) ||
        /Test timeout of \d+ms exceeded/i.test(line) ||
        /locator\..*timed out waiting/i.test(line),
    );
    if (pwTimeoutIndex !== -1) {
      diagnostics.push({
        category: 'Playwright E2E Timeout',
        errorExcerpt: extractContextExcerpt(lines, pwTimeoutIndex),
        rootCause:
          'Playwright action or assertion timed out waiting for DOM element or network condition.',
        recommendation:
          'Inspect Playwright trace artifacts and page snapshots, verify selector specificity, and increase action timeout if network calls require more time.',
      });
    }
  }

  // Rule 3: Yarn Berry immutable lockfile sync errors (YN0028)
  const yarnLockIndex = lines.findIndex(
    (line) => /YN0028/i.test(line) || /The lockfile would have been created or updated/i.test(line),
  );
  if (yarnLockIndex !== -1) {
    diagnostics.push({
      category: 'Yarn Lockfile Sync (YN0028)',
      errorExcerpt: extractContextExcerpt(lines, yarnLockIndex),
      rootCause:
        'yarn.lock is out of sync with package.json dependencies while running with --immutable or --immutable-cache in CI.',
      recommendation:
        'Run `yarn install` locally without --immutable, commit the updated yarn.lock file, and push to the branch.',
    });
  }

  // Rule 4: Docker build layer push or authentication failures
  const dockerPushIndex = lines.findIndex(
    (line) =>
      /denied:\s*requested access to the resource is denied/i.test(line) ||
      /no basic auth credentials/i.test(line) ||
      /unauthorized:\s*authentication required/i.test(line) ||
      /error pushing image/i.test(line) ||
      /failed to push/i.test(line) ||
      /failed to copy:\s*httpReadSeeker:\s*failed to open/i.test(line),
  );
  if (dockerPushIndex !== -1) {
    diagnostics.push({
      category: 'Docker Push / Auth Failure',
      errorExcerpt: extractContextExcerpt(lines, dockerPushIndex),
      rootCause:
        'AWS ECR or Docker registry authentication failed, access token expired, or IAM role lacks write/push permissions for the target repository.',
      recommendation:
        'Verify AWS ECR login step (aws-actions/amazon-ecr-login) and ensure runner IAM role includes ecr:BatchCheckLayerAvailability, ecr:PutImage, and ecr:InitiateLayerUpload.',
    });
  }
  // Rule 5: Frontend Vitest unit / integration test failure
  const vitestIndex = lines.findIndex(
    (line) =>
      /FAIL\s+.*(?:sources\/|\.spec\.[jt]sx?)/i.test(line) ||
      /VitestBrowserElementError/i.test(line) ||
      /Failed Tests\s+\d+/i.test(line) ||
      /One or more frontend test shards failed/i.test(line),
  );
  if (vitestIndex !== -1) {
    const specificFailIndex = lines.findIndex(
      (line) => /FAIL\s+.*\.spec\.[jt]sx?/i.test(line) || /VitestBrowserElementError/i.test(line),
    );
    const targetIndex = specificFailIndex !== -1 ? specificFailIndex : vitestIndex;
    diagnostics.push({
      category: 'Frontend Vitest Unit / Integration Test Failure',
      errorExcerpt: extractContextExcerpt(lines, targetIndex),
      rootCause:
        'Vitest unit or browser-mode test assertion failed or timed out during test shard execution.',
      recommendation:
        'Run the failing test file locally (e.g. `yarn vitest run <file>` or `yarn test:browser`), inspect test screenshot artifacts in `.tests-results/screenshots`, and verify locator or assertion timing.',
    });
  }

  return diagnostics;
}

/**
 * Generates formatted Markdown or JSON triage reports.
 */
export function generateTriageReport(
  diagnostics: DiagnosticFailure[],
  format: 'markdown' | 'json' = 'markdown',
  options: TriageReportOptions = {},
): string {
  if (format === 'json') {
    return JSON.stringify(
      {
        pr: options.pr ?? null,
        runId: options.runId ?? null,
        checks: options.checks ?? [],
        diagnostics,
      },
      null,
      2,
    );
  }

  const sections: string[] = ['# CI Failure Triage Report\n'];

  if (options.pr) {
    sections.push(`**PR:** #${options.pr}`);
  }
  if (options.runId) {
    sections.push(`**Run ID:** ${options.runId}`);
  }
  if (options.pr || options.runId) {
    sections.push('');
  }

  if (options.checks && options.checks.length > 0) {
    sections.push('## Failed Checks');
    sections.push('| Job Name | Status | Duration | URL |');
    sections.push('|---|---|---|---|');
    for (const check of options.checks) {
      sections.push(`| ${check.name} | ${check.status} | ${check.duration} | ${check.url} |`);
    }
    sections.push('');
  }

  sections.push('## Diagnostic Analysis');
  if (diagnostics.length === 0) {
    sections.push('No known CI failure patterns detected. Manual log inspection recommended.\n');
  } else {
    for (let i = 0; i < diagnostics.length; i++) {
      const diag = diagnostics[i]!;
      sections.push(`### ${i + 1}. ${diag.category}`);
      sections.push('**Error Excerpt:**');
      sections.push('```text');
      sections.push(diag.errorExcerpt);
      sections.push('```');
      sections.push(`**Root Cause:** ${diag.rootCause}`);
      sections.push(`**Recommendation:** ${diag.recommendation}\n`);
    }
  }

  return sections.join('\n').trimEnd();
}

/**
 * CLI Command runner
 */
export async function runCli(argv: string[] = process.argv): Promise<void> {
  const program = new Command()
    .name('triage-pr-failures')
    .description('Diagnose and triage failing GitHub Actions runs and PR checks')
    .option('-p, --pr <number>', 'PR number to inspect checks for')
    .option('-r, --run-id <id>', 'Specific GitHub Actions run ID to inspect')
    .option('-f, --format <format>', 'Output format (markdown|json)', 'markdown')
    .option('--dry-run', 'Simulated execution without running live gh commands')
    .action(async (opts) => {
      const format = opts.format === 'json' ? 'json' : 'markdown';

      if (!opts.pr && !opts.runId) {
        console.error('Error: Either --pr <number> or --run-id <id> must be specified.');
        process.exit(1);
      }

      if (opts.dryRun) {
        const simulatedChecks: CheckItem[] = [
          {
            name: 'E2E Tests / Playwright',
            status: 'fail',
            duration: '12m34s',
            url: `https://github.com/${DEFAULT_REPO}/actions/runs/${opts.runId || '35910923024'}/job/107357575748`,
            runId: opts.runId || '35910923024',
            jobId: '107357575748',
          },
        ];

        const simulatedDiagnostics: DiagnosticFailure[] = [
          {
            category: 'Simulated Dry-Run Diagnostic',
            errorExcerpt: `[dry-run] Inspection simulated for PR #${opts.pr || 'N/A'}, Run ID: ${opts.runId || '35910923024'}`,
            rootCause:
              'Simulation mode enabled (--dry-run). No live network requests or gh CLI processes executed.',
            recommendation:
              'Run without --dry-run against live GitHub repositories to fetch actual run logs.',
          },
        ];

        const report = generateTriageReport(simulatedDiagnostics, format, {
          pr: opts.pr,
          runId: opts.runId || '35910923024',
          checks: simulatedChecks,
        });

        console.log(report);
        return;
      }

      let checks: CheckItem[] = [];
      let combinedLogs = '';

      if (opts.pr) {
        try {
          const checksOutput = await $`gh pr checks ${opts.pr} --repo ${DEFAULT_REPO}`
            .nothrow()
            .text();
          checks = parseChecksOutput(checksOutput);
        } catch (err: unknown) {
          const errorMsg = err instanceof Error ? err.message : String(err);
          console.error(`Failed to fetch checks for PR #${opts.pr}: ${errorMsg}`);
        }
      }

      // Collect logs from failed checks or runId
      const runIdsToFetch = new Set<string>();
      if (opts.runId) {
        runIdsToFetch.add(String(opts.runId));
      }
      for (const check of checks) {
        if (check.runId) {
          runIdsToFetch.add(check.runId);
        }
      }

      for (const runId of runIdsToFetch) {
        try {
          const logText = await $`gh run view ${runId} --repo ${DEFAULT_REPO} --log-failed`.text();
          combinedLogs += `\n${logText}`;
        } catch {
          // If --log-failed fails (e.g. run in progress), fallback to jobs if available
          for (const check of checks.filter((c) => c.runId === runId && c.jobId)) {
            try {
              const jobLog =
                await $`gh api /repos/${DEFAULT_REPO}/actions/jobs/${check.jobId}/logs`.text();
              combinedLogs += `\n${jobLog}`;
            } catch {
              // Ignore individual job log fetch failure
            }
          }
        }
      }

      const diagnostics = diagnoseLogFailures(combinedLogs);
      const report = generateTriageReport(diagnostics, format, {
        pr: opts.pr,
        runId: opts.runId,
        checks,
      });

      console.log(report);
    });

  await program.parseAsync(argv);
}

if (import.meta.main) {
  runCli().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

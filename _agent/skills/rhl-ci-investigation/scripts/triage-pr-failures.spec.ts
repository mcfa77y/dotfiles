import { describe, expect, it } from 'bun:test';
import {
  type CheckItem,
  type DiagnosticFailure,
  diagnoseLogFailures,
  generateTriageReport,
  parseChecksOutput,
  runCli,
  stripAnsi,
} from './triage-pr-failures.ts';

describe('triage-pr-failures', () => {
  describe('parseChecksOutput', () => {
    it('parses tab-delimited checks output and extracts only failed items', () => {
      const tabOutput = [
        'E2E Tests\tfail\t12m34s\thttps://github.com/EmpoHealth/core/actions/runs/35910923024/job/107357575748',
        'Docker Build & Push\tfail\t3m12s\thttps://github.com/EmpoHealth/core/actions/runs/35910923024/job/107357575749',
        'Unit Tests\tpass\t1m05s\thttps://github.com/EmpoHealth/core/actions/runs/35910923024/job/107357575750',
      ].join('\n');

      const failedChecks = parseChecksOutput(tabOutput);
      expect(failedChecks).toHaveLength(2);

      expect(failedChecks[0]!.name).toBe('E2E Tests');
      expect(failedChecks[0]!.status).toBe('fail');
      expect(failedChecks[0]!.duration).toBe('12m34s');
      expect(failedChecks[0]!.url).toBe(
        'https://github.com/EmpoHealth/core/actions/runs/35910923024/job/107357575748',
      );
      expect(failedChecks[0]!.runId).toBe('35910923024');
      expect(failedChecks[0]!.jobId).toBe('107357575748');

      expect(failedChecks[1]!.name).toBe('Docker Build & Push');
      expect(failedChecks[1]!.status).toBe('fail');
      expect(failedChecks[1]!.duration).toBe('3m12s');
      expect(failedChecks[1]!.jobId).toBe('107357575749');
    });

    it('parses columnar whitespace-delimited checks with status markers', () => {
      const columnarOutput = `
NAME                                     STATE  ELAPSED  URL
X  Terraform Preview                     fail   2m15s    https://github.com/EmpoHealth/core/actions/runs/123456789/job/987654321
✓  Lint & Formatting                     pass   45s      https://github.com/EmpoHealth/core/actions/runs/123456789/job/987654322
✗  Frontend E2E Tests                    timed_out 15m00s https://github.com/EmpoHealth/core/actions/runs/123456789/job/987654323
`;

      const failedChecks = parseChecksOutput(columnarOutput);
      expect(failedChecks).toHaveLength(2);

      expect(failedChecks[0]!.name).toBe('Terraform Preview');
      expect(failedChecks[0]!.status).toBe('fail');
      expect(failedChecks[0]!.duration).toBe('2m15s');
      expect(failedChecks[0]!.runId).toBe('123456789');
      expect(failedChecks[0]!.jobId).toBe('987654321');

      expect(failedChecks[1]!.name).toBe('Frontend E2E Tests');
      expect(failedChecks[1]!.status).toBe('timed_out');
      expect(failedChecks[1]!.duration).toBe('15m00s');
      expect(failedChecks[1]!.jobId).toBe('987654323');
    });

    it('returns empty array when all checks pass or input is empty', () => {
      const passOutput = `
✓  Lint               pass   30s   https://github.com/EmpoHealth/core/actions/runs/111/job/222
✓  Test               pass   1m    https://github.com/EmpoHealth/core/actions/runs/111/job/333
`;
      expect(parseChecksOutput(passOutput)).toEqual([]);
      expect(parseChecksOutput('')).toEqual([]);
    });
  });

  describe('diagnoseLogFailures', () => {
    it('detects Terraform workspace interactive EOF prompt failure', () => {
      const tfLog = `
2026-10-06T14:22:01.123Z [INFO] Initializing Terraform backend...
2026-10-06T14:22:03.456Z Select workspace:
Failed to select workspace: EOF
Error: Process completed with exit code 1.
`;

      const diagnostics = diagnoseLogFailures(tfLog);
      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0]!.category).toBe('Terraform Workspace EOF');
      expect(diagnostics[0]!.errorExcerpt).toContain('Failed to select workspace: EOF');
      expect(diagnostics[0]!.rootCause).toContain('.terraform/environment restored from cache');
      expect(diagnostics[0]!.recommendation).toContain('Wipe stale .terraform cache');
    });

    it('detects Playwright timeouts and HTTP 503 / 502 ALB gateway errors', () => {
      const playwrightAlbLog = `
  1) [chromium] › e2e/appointments.spec.ts:34:5 › Book Appointment
    Error: page.goto: net::ERR_HTTP_RESPONSE_CODE_FAILURE at https://pr-2754.preview.empohealth.com
    =========================== logs ===========================
    navigating to "https://pr-2754.preview.empohealth.com", waiting until "load"
    503 Service Temporarily Unavailable
    ============================================================
      33 | test('Book Appointment', async ({ page }) => {
    > 34 |   await page.goto('/');
         |              ^
`;

      const diagnostics = diagnoseLogFailures(playwrightAlbLog);
      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0]!.category).toBe('Playwright E2E / ALB Gateway Error');
      expect(diagnostics[0]!.errorExcerpt).toContain('503 Service Temporarily Unavailable');
      expect(diagnostics[0]!.rootCause).toContain(
        'HTTP 502 Bad Gateway / 503 Service Temporarily Unavailable',
      );
      expect(diagnostics[0]!.recommendation).toContain('ECS target groups');
    });

    it('detects 502 Bad Gateway error', () => {
      const alb502Log = `
Request failed with status: 502 Bad Gateway
Response body: <html><center><h1>502 Bad Gateway</h1></center></html>
`;
      const diagnostics = diagnoseLogFailures(alb502Log);
      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0]!.category).toBe('Playwright E2E / ALB Gateway Error');
      expect(diagnostics[0]!.errorExcerpt).toContain('502 Bad Gateway');
    });

    it('detects pure Playwright locator timeout when no ALB error is present', () => {
      const timeoutLog = `
  1) [chromium] › tests/patient.spec.ts:15:7 › Patient flow
    Test timeout of 30000ms exceeded.
    Error: locator.click: Target page, context or browser has been closed
`;

      const diagnostics = diagnoseLogFailures(timeoutLog);
      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0]!.category).toBe('Playwright E2E Timeout');
      expect(diagnostics[0]!.errorExcerpt).toContain('Test timeout of 30000ms exceeded');
      expect(diagnostics[0]!.recommendation).toContain('Inspect Playwright trace artifacts');
    });

    it('detects Yarn Berry immutable lockfile sync errors (YN0028)', () => {
      const yarnLog = `
➤ YN0000: ┌ Resolution step
➤ YN0028: │ The lockfile would have been created or updated, but immutable mode is enabled
➤ YN0000: └ Completed in 1s 234ms
➤ YN0000: Failed with errors in 1s 236ms
`;

      const diagnostics = diagnoseLogFailures(yarnLog);
      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0]!.category).toBe('Yarn Lockfile Sync (YN0028)');
      expect(diagnostics[0]!.errorExcerpt).toContain('YN0028');
      expect(diagnostics[0]!.rootCause).toContain('yarn.lock is out of sync');
      expect(diagnostics[0]!.recommendation).toContain('yarn install');
    });

    it('detects Docker build push and authentication failures', () => {
      const dockerLog = `
#12 exporting to image
#12 pushing layers 1.2s done
#12 ERROR: failed to push 123456789012.dkr.ecr.us-east-1.amazonaws.com/empo/core:denied: requested access to the resource is denied
------
 > pushing layers:
------
ERROR: failed to solve: denied: requested access to the resource is denied
`;

      const diagnostics = diagnoseLogFailures(dockerLog);
      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0]!.category).toBe('Docker Push / Auth Failure');
      expect(diagnostics[0]!.errorExcerpt).toContain(
        'denied: requested access to the resource is denied',
      );
      expect(diagnostics[0]!.rootCause).toContain(
        'AWS ECR or Docker registry authentication failed',
      );
      expect(diagnostics[0]!.recommendation).toContain('aws-actions/amazon-ecr-login');
    });

    it('detects Vitest unit and integration test failures even with ANSI escape sequences', () => {
      const vitestLog = `
\u001b[41m\u001b[1m FAIL \u001b[22m\u001b[49m \u001b[30m\u001b[43m integration (chromium) \u001b[49m\u001b[39m sources/modules/dashboard/Screenings.spec.tsx:307:1 > loads newer data points
\u001b[31m\u001b[1mVitestBrowserElementError\u001b[22m: Cannot find element with locator: getByRole('dialog')
One or more frontend test shards failed or were cancelled.
`;

      const diagnostics = diagnoseLogFailures(vitestLog);
      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0]!.category).toBe('Frontend Vitest Unit / Integration Test Failure');
      expect(diagnostics[0]!.errorExcerpt).toContain('Screenings.spec.tsx');
      expect(diagnostics[0]!.rootCause).toContain(
        'Vitest unit or browser-mode test assertion failed',
      );
      expect(diagnostics[0]!.recommendation).toContain('yarn vitest run');
    });

    it('detects multiple diagnostic failures in a single combined log', () => {
      const multiLog = `
--- Job 1: Yarn setup ---
➤ YN0028: The lockfile would have been created or updated

--- Job 2: Terraform ---
Failed to select workspace: EOF
`;

      const diagnostics = diagnoseLogFailures(multiLog);
      expect(diagnostics).toHaveLength(2);
      const categories = diagnostics.map((d) => d.category);
      expect(categories).toContain('Yarn Lockfile Sync (YN0028)');
      expect(categories).toContain('Terraform Workspace EOF');
    });

    it('returns empty diagnostics for benign or passing logs', () => {
      const normalLog = `
✓ All 45 unit tests passed.
Built bundle in 2.3s.
Done in 12.4s.
`;
      expect(diagnoseLogFailures(normalLog)).toEqual([]);
    });
    it('correctly strips ANSI escape codes', () => {
      const colored = '\u001b[31mError:\u001b[0m \u001b[1mFailed\u001b[22m';
      expect(stripAnsi(colored)).toBe('Error: Failed');
    });
  });

  describe('generateTriageReport', () => {
    const mockChecks: CheckItem[] = [
      {
        name: 'E2E Playwright',
        status: 'fail',
        duration: '10m05s',
        url: 'https://github.com/EmpoHealth/core/actions/runs/123/job/456',
        runId: '123',
        jobId: '456',
      },
    ];

    const mockDiagnostics: DiagnosticFailure[] = [
      {
        category: 'Playwright E2E / ALB Gateway Error',
        errorExcerpt: '503 Service Temporarily Unavailable',
        rootCause: 'ALB target group returned 503.',
        recommendation: 'Check ECS container health.',
      },
    ];

    it('generates markdown report with checks table and diagnostics', () => {
      const md = generateTriageReport(mockDiagnostics, 'markdown', {
        pr: 2754,
        runId: '123',
        checks: mockChecks,
      });

      expect(md).toContain('# CI Failure Triage Report');
      expect(md).toContain('**PR:** #2754');
      expect(md).toContain('**Run ID:** 123');
      expect(md).toContain('## Failed Checks');
      expect(md).toContain(
        '| E2E Playwright | fail | 10m05s | https://github.com/EmpoHealth/core/actions/runs/123/job/456 |',
      );
      expect(md).toContain('### 1. Playwright E2E / ALB Gateway Error');
      expect(md).toContain('503 Service Temporarily Unavailable');
      expect(md).toContain('**Root Cause:** ALB target group returned 503.');
      expect(md).toContain('**Recommendation:** Check ECS container health.');
    });

    it('generates valid JSON report', () => {
      const jsonStr = generateTriageReport(mockDiagnostics, 'json', {
        pr: '2754',
        runId: '123',
        checks: mockChecks,
      });

      const parsed = JSON.parse(jsonStr);
      expect(parsed.pr).toBe('2754');
      expect(parsed.runId).toBe('123');
      expect(parsed.checks).toHaveLength(1);
      expect(parsed.diagnostics).toHaveLength(1);
      expect(parsed.diagnostics[0].category).toBe('Playwright E2E / ALB Gateway Error');
    });

    it('handles empty diagnostics gracefully in markdown', () => {
      const md = generateTriageReport([], 'markdown', { pr: 100 });
      expect(md).toContain('No known CI failure patterns detected.');
    });
  });

  describe('runCli --dry-run', () => {
    it('executes in dry-run mode for PR number without throwing', async () => {
      const logs: string[] = [];
      const originalLog = console.log;
      console.log = (msg: string) => logs.push(msg);

      try {
        await runCli(['bun', 'triage-pr-failures.ts', '--dry-run', '-p', '2754']);
        expect(logs.length).toBeGreaterThan(0);
        expect(logs[0]).toContain('# CI Failure Triage Report');
        expect(logs[0]).toContain('**PR:** #2754');
      } finally {
        console.log = originalLog;
      }
    });

    it('executes in dry-run mode for JSON output', async () => {
      const logs: string[] = [];
      const originalLog = console.log;
      console.log = (msg: string) => logs.push(msg);

      try {
        await runCli([
          'bun',
          'triage-pr-failures.ts',
          '--dry-run',
          '-r',
          '35910923024',
          '-f',
          'json',
        ]);
        expect(logs.length).toBeGreaterThan(0);
        const parsed = JSON.parse(logs[0]!);
        expect(parsed.runId).toBe('35910923024');
        expect(parsed.diagnostics).toHaveLength(1);
      } finally {
        console.log = originalLog;
      }
    });
  });
});

#!/usr/bin/env bun
/**
 * mock_service_ctl.ts
 *
 * Unified CLI controller for RHL mock services: health checks, build, start, and QA test execution.
 */

import { $ } from 'bun';
import { Command } from 'commander';

export interface HealthCheckResult {
  healthy: boolean;
  statusCode: number;
  body?: string;
  url: string;
}

export async function checkMockHealth(
  port: number = 3001,
  timeoutMs: number = 5000,
): Promise<HealthCheckResult> {
  const url = `http://localhost:${port}/health`;
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);

    const text = await res.text();
    return {
      healthy: res.status === 200,
      statusCode: res.status,
      body: text,
      url,
    };
  } catch (err: unknown) {
    return {
      healthy: false,
      statusCode: 0,
      body: err instanceof Error ? err.message : String(err),
      url,
    };
  }
}
export interface ResetScenariosOptions {
  port?: number;
  prTag?: string;
  adminSecret?: string;
}

export async function resetScenarios(
  opts: ResetScenariosOptions = {},
): Promise<{ cleared: boolean; statusCode: number; error?: string }> {
  const port = opts.port ?? 3001;
  const url = opts.prTag
    ? `http://localhost:${port}/mock-admin/scenarios?prTag=${encodeURIComponent(opts.prTag)}`
    : `http://localhost:${port}/mock-admin/scenarios`;

  const headers: Record<string, string> = {};
  if (opts.adminSecret) {
    headers['x-mock-admin-secret'] = opts.adminSecret;
  }

  try {
    const res = await fetch(url, {
      method: 'DELETE',
      headers,
    });
    return {
      cleared: res.ok,
      statusCode: res.status,
      error: res.ok ? undefined : await res.text(),
    };
  } catch (err: unknown) {
    return {
      cleared: false,
      statusCode: 0,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export interface RegisterMemfaultScenarioOptions {
  port?: number;
  prTag?: string;
  deviceSerial: string;
  cohortSlug: string;
  project?: string;
  adminSecret?: string;
}

export async function registerMemfaultScenario(
  opts: RegisterMemfaultScenarioOptions,
): Promise<{ registered: boolean; id?: string; statusCode: number; error?: string }> {
  const port = opts.port ?? 3001;
  const project = opts.project ?? 'remote-health-link';
  const url = `http://localhost:${port}/mock-admin/scenarios`;
  const canonicalPath = `/memfault/api/v0/organizations/empo-health/projects/${project}/devices`;

  const payload = {
    service: 'memfault',
    protocol: 'REST',
    consumeMode: 'persistent',
    ttlSeconds: 3600,
    prTag: opts.prTag,
    criteria: {
      method: 'POST',
      path: canonicalPath,
      bodyMatches: {
        device_serial: opts.deviceSerial,
      },
    },
    response: {
      status: 201,
      headers: { 'content-type': 'application/json' },
      body: {
        data: {
          device_serial: opts.deviceSerial,
          cohort: { slug: opts.cohortSlug, name: opts.cohortSlug },
          hardware_version: { name: 'default' },
        },
      },
    },
  };

  const headers: Record<string, string> = {
    'content-type': 'application/json',
  };
  if (opts.adminSecret) {
    headers['x-mock-admin-secret'] = opts.adminSecret;
  }
  if (opts.prTag) {
    headers['x-pr-tag'] = opts.prTag;
  }

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });
    const json = res.ok ? ((await res.json()) as { id?: string }) : undefined;
    return {
      registered: res.ok,
      id: json?.id,
      statusCode: res.status,
      error: res.ok ? undefined : await res.text(),
    };
  } catch (err: unknown) {
    return {
      registered: false,
      statusCode: 0,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function findRepoRoot(): Promise<string> {
  try {
    const root = (await $`git rev-parse --show-toplevel`.quiet().text()).trim();
    if (root) return root;
  } catch {
    // Fall back to process.cwd()
  }
  return process.cwd();
}

export async function runCli(): Promise<void> {
  const program = new Command()
    .name('mock_service_ctl')
    .description('Manage and interact with RHL mock-services (health, build, start, test).');

  program
    .command('health')
    .description('Check health endpoint of local mock-services')
    .option('-p, --port <number>', 'Mock services port', (v) => Number.parseInt(v, 10), 3001)
    .option('-t, --timeout <number>', 'Timeout in ms', (v) => Number.parseInt(v, 10), 5000)
    .action(async (opts: { port: number; timeout: number }) => {
      const res = await checkMockHealth(opts.port, opts.timeout);
      if (res.healthy) {
        console.log(`✓ mock-services is healthy (HTTP 200) at ${res.url}`);
        if (res.body) console.log(`  Response: ${res.body}`);
      } else {
        console.error(`✗ mock-services health check failed (HTTP ${res.statusCode}) at ${res.url}`);
        if (res.body) console.error(`  Error: ${res.body}`);
        process.exit(1);
      }
    });

  program
    .command('build')
    .description('Build workspaces/mock-services')
    .action(async () => {
      const repoRoot = await findRepoRoot();
      const mockDir = `${repoRoot}/workspaces/mock-services`;
      if (!(await Bun.file(`${mockDir}/package.json`).exists())) {
        console.error(`Error: mock-services workspace not found at ${mockDir}`);
        process.exit(1);
      }
      console.log(`Building mock-services in ${mockDir}...`);
      await $`yarn build`.cwd(mockDir);
      console.log('✓ Build completed successfully.');
    });

  program
    .command('start')
    .description('Start mock-services in development mode')
    .option('-p, --port <number>', 'Mock services port', (v) => Number.parseInt(v, 10), 3001)
    .action(async (opts: { port: number }) => {
      const repoRoot = await findRepoRoot();
      const mockDir = `${repoRoot}/workspaces/mock-services`;
      if (!(await Bun.file(`${mockDir}/package.json`).exists())) {
        console.error(`Error: mock-services workspace not found at ${mockDir}`);
        process.exit(1);
      }

      console.log(`Starting mock-services on port ${opts.port}...`);
      await $`PORT=${opts.port} yarn start:dev`.cwd(mockDir);
    });

  program
    .command('test [testFiles...]')
    .description('Run QA regression tests against mock services')
    .action(async (testFiles: string[]) => {
      const repoRoot = await findRepoRoot();
      const qaDir = `${repoRoot}/workspaces/qa`;
      if (!(await Bun.file(`${qaDir}/package.json`).exists())) {
        console.error(`Error: QA workspace not found at ${qaDir}`);
        process.exit(1);
      }

      if (testFiles.length === 0) {
        console.log('Running all QA tests in mock mode...');
        await $`yarn test:mock`.cwd(qaDir);
      } else {
        console.log(`Running QA test(s) in mock mode: ${testFiles.join(' ')}`);
        await $`yarn test:mock ${testFiles}`.cwd(qaDir);
      }
    });

  program
    .command('reset-scenarios')
    .description('Reset mock scenarios (for a PR tag or all)')
    .option('-p, --port <number>', 'Mock services port', (v) => Number.parseInt(v, 10), 3001)
    .option('--pr-tag <tag>', 'PR tag to reset (omit to reset all scenarios)')
    .option('--secret <secret>', 'Mock admin secret header')
    .action(async (opts: { port: number; prTag?: string; secret?: string }) => {
      const res = await resetScenarios({
        port: opts.port,
        prTag: opts.prTag,
        adminSecret: opts.secret,
      });
      if (res.cleared) {
        console.log(
          `✓ Scenarios reset successfully${opts.prTag ? ` for PR tag: ${opts.prTag}` : ' (all)'}.`,
        );
      } else {
        console.error(`✗ Scenario reset failed (HTTP ${res.statusCode}): ${res.error}`);
        process.exit(1);
      }
    });

  program
    .command('register-memfault')
    .description('Register a mock Memfault device provisioning scenario')
    .requiredOption('-s, --serial <serial>', 'Device serial number')
    .requiredOption('-c, --cohort <cohort>', 'Cohort slug')
    .option('-p, --port <number>', 'Mock services port', (v) => Number.parseInt(v, 10), 3001)
    .option('--pr-tag <tag>', 'PR tag for tenant isolation')
    .option('--project <project>', 'Memfault project slug', 'remote-health-link')
    .option('--secret <secret>', 'Mock admin secret header')
    .action(
      async (opts: {
        serial: string;
        cohort: string;
        port: number;
        prTag?: string;
        project: string;
        secret?: string;
      }) => {
        const res = await registerMemfaultScenario({
          port: opts.port,
          prTag: opts.prTag,
          deviceSerial: opts.serial,
          cohortSlug: opts.cohort,
          project: opts.project,
          adminSecret: opts.secret,
        });
        if (res.registered) {
          console.log(
            `✓ Memfault scenario registered (id: ${res.id ?? 'unknown'}) for ${opts.serial}`,
          );
        } else {
          console.error(
            `✗ Memfault scenario registration failed (HTTP ${res.statusCode}): ${res.error}`,
          );
          process.exit(1);
        }
      },
    );

  await program.parseAsync();
}

if (import.meta.main) {
  try {
    await runCli();
  } catch (err: unknown) {
    console.error('Fatal error:', err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

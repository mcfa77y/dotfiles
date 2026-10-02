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

export async function checkMockHealth(port: number = 3001, timeoutMs: number = 5000): Promise<HealthCheckResult> {
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
    .option('-p, --port <number>', 'Mock services port', (v) => parseInt(v, 10), 3001)
    .option('-t, --timeout <number>', 'Timeout in ms', (v) => parseInt(v, 10), 5000)
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
    .option('-p, --port <number>', 'Mock services port', (v) => parseInt(v, 10), 3001)
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

  await program.parseAsync();
}

if (import.meta.main) {
  runCli().catch((err: unknown) => {
    console.error('Fatal error:', err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
}

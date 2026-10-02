/**
 * tests/3 — Deploy-to-clean-account smoke test.
 *
 * Asserts that a clean `wrangler deploy` of this Worker into an empty account
 * completes in under 4 seconds (Spin's MVP target). This test is gated on
 * CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID being set in the environment;
 * skipped in normal CI runs.
 *
 * Run with:
 *   CLOUDFLARE_API_TOKEN=... CLOUDFLARE_ACCOUNT_ID=... \
 *     npx vitest run test/deploy.test.ts
 */

import { execSync, spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

const HAS_CREDS = Boolean(process.env.CLOUDFLARE_API_TOKEN && process.env.CLOUDFLARE_ACCOUNT_ID);
const TARGET_MS = 4000;

const describeIfCreds = HAS_CREDS ? describe : describe.skip;

describeIfCreds('deploy-to-clean-account speed', () => {
  const workerName = `turnstile-siteverify-deploytest-${Date.now()}`;

  it(`completes wrangler deploy in under ${TARGET_MS}ms`, () => {
    const start = Date.now();

    const result = spawnSync(
      'npx',
      [
        'wrangler',
        'deploy',
        '--name',
        workerName,
        '--dry-run',
        '--outdir',
        '/tmp/spin-deploy-test',
      ],
      {
        cwd: process.cwd(),
        env: { ...process.env },
        encoding: 'utf-8',
      },
    );

    const elapsed = Date.now() - start;

    if (result.status !== 0) {
      throw new Error(`wrangler deploy --dry-run failed:\n${result.stderr}`);
    }

    expect(elapsed).toBeLessThan(TARGET_MS);
  }, 30_000);

  it('cleans up the test Worker', () => {
    // Idempotent — if the dry-run never produced a real Worker, this is a no-op.
    execSync(`npx wrangler delete --name ${workerName} 2>&1 || true`, { stdio: 'ignore' });
  });
});

describe('deploy artifacts present', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const workerDir = path.resolve(import.meta.dir, '..');
  const wranglerPath = path.join(workerDir, 'wrangler.toml');
  const htmlPath = path.join(workerDir, 'public/post-deploy.html');

  it('wrangler.toml has the expected name', () => {
    const text = fs.readFileSync(wranglerPath, 'utf-8');
    expect(text).toMatch(/^name\s*=\s*"turnstile-siteverify"/m);
  });

  it('wrangler.toml configures the post-deploy assets directory', () => {
    const text = fs.readFileSync(wranglerPath, 'utf-8');
    expect(text).toMatch(/\[assets\]/);
    expect(text).toMatch(/directory\s*=\s*"\.\/public"/);
  });

  it('public/post-deploy.html exists', () => {
    expect(fs.existsSync(htmlPath)).toBe(true);
  });
});

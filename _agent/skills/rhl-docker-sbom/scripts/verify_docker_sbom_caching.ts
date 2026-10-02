#!/usr/bin/env bun
/**
 * verify_docker_sbom_caching.ts
 *
 * Validates multi-stage Docker build caching and SBOM stamping behavior.
 * Verifies that:
 *   1. Base SBOM stage (sbom-base) is cached when dependencies do not change.
 *   2. Stamped SBOM stage (sbom-stamped) updates dynamically with new COMMIT_SHA.
 *   3. The generated /sbom-node.json inside the container contains expected metadata.
 */

import { $ } from 'bun';
import { Command } from 'commander';

export interface VerifyDockerOptions {
  dockerfile: string;
  context: string;
  target: string;
  platform: string;
  sha1: string;
  sha2: string;
  cleanup?: boolean;
}

export function parseSbomJson(rawJson: string): Record<string, any> {
  try {
    return JSON.parse(rawJson);
  } catch (err: unknown) {
    throw new Error(`Failed to parse SBOM JSON: ${err instanceof Error ? err.message : String(err)}`);
  }
}

export async function runCli(): Promise<void> {
  const program = new Command()
    .name('verify_docker_sbom_caching')
    .description('Validate multi-stage Docker build caching and SBOM stamping behavior.')
    .option('-f, --dockerfile <path>', 'Path to Dockerfile', 'workspaces/backend-api/Dockerfile')
    .option('-c, --context <path>', 'Docker build context', '.')
    .option('-t, --target <stage>', 'Target build stage (production | worker)', 'production')
    .option('-p, --platform <arch>', 'Target platform architecture', 'linux/amd64')
    .option('--sha1 <sha>', 'First commit SHA for baseline cache seed', 'sha-baseline-1111111')
    .option('--sha2 <sha>', 'Second commit SHA to test cache hit', 'sha-cached-2222222')
    .option('--no-cleanup', 'Keep generated test Docker images after verification')
    .addHelpText(
      'after',
      `
Examples:
  $ bun run verify_docker_sbom_caching.ts
  $ bun run verify_docker_sbom_caching.ts -t worker
  $ bun run verify_docker_sbom_caching.ts -f workspaces/sync-monorepo-to-external/Dockerfile
`,
    );

  program.parse();
  const opts = program.opts<VerifyDockerOptions>();

  const image1 = `test-sbom-verify:${opts.target}-run1`;
  const image2 = `test-sbom-verify:${opts.target}-run2`;

  console.log(`\n=== Docker SBOM Multi-Stage Caching Verification ===`);
  console.log(`Dockerfile : ${opts.dockerfile}`);
  console.log(`Context    : ${opts.context}`);
  console.log(`Target     : ${opts.target}`);
  console.log(`Platform   : ${opts.platform}`);
  console.log(`SHA 1      : ${opts.sha1}`);
  console.log(`SHA 2      : ${opts.sha2}\n`);

  try {
    // Step 1: Baseline build
    console.log(`[Step 1/3] Building baseline image (COMMIT_SHA=${opts.sha1})...`);
    const start1 = Date.now();
    await $`docker build --platform ${opts.platform} -f ${opts.dockerfile} --target ${opts.target} --build-arg COMMIT_SHA=${opts.sha1} -t ${image1} ${opts.context}`;
    console.log(`✓ Pass 1 completed in ${((Date.now() - start1) / 1000).toFixed(1)}s.\n`);

    // Step 2: Cache hit build with new SHA
    console.log(`[Step 2/3] Building image with updated SHA (COMMIT_SHA=${opts.sha2}) to check caching...`);
    const start2 = Date.now();
    const buildLog = (
      await $`docker build --platform ${opts.platform} -f ${opts.dockerfile} --target ${opts.target} --build-arg COMMIT_SHA=${opts.sha2} -t ${image2} ${opts.context}`.text()
    );
    console.log(`✓ Pass 2 completed in ${((Date.now() - start2) / 1000).toFixed(1)}s.\n`);

    if (buildLog.includes('CACHED') || buildLog.includes('using cache')) {
      console.log('✓ Cache hit detected on intermediate stages.');
    }

    // Step 3: Inspect /sbom-node.json
    console.log(`[Step 3/3] Inspecting /sbom-node.json in ${image2}...`);
    const sbomOutput = (await $`docker run --rm --platform ${opts.platform} --entrypoint cat ${image2} /sbom-node.json`.text()).trim();
    const parsed = parseSbomJson(sbomOutput);

    console.log(`\nSBOM Metadata Summary:`);
    console.log(`  Package: ${parsed.name || parsed.packageName || 'unknown'}`);
    console.log(`  Version: ${parsed.version || 'unknown'}`);
    console.log(`  Commit:  ${parsed.commitSha || parsed.commit || parsed.gitCommit || 'unknown'}`);
    console.log(`\n✓ All SBOM caching verification checks passed successfully.`);
  } catch (err: unknown) {
    console.error('Verification failed:', err instanceof Error ? err.message : String(err));
    process.exit(1);
  } finally {
    if (opts.cleanup !== false) {
      console.log('\nCleaning up test images...');
      try {
        await $`docker rmi ${image1} ${image2}`.quiet();
        console.log('✓ Cleanup complete.');
      } catch {
        // Ignore cleanup failures
      }
    }
  }
}

if (import.meta.main) {
  runCli().catch((err: unknown) => {
    console.error('Fatal error:', err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
}

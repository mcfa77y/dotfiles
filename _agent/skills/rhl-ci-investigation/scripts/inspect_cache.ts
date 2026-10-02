#!/usr/bin/env bun
/**
 * inspect_cache.ts
 *
 * Inspects GitHub Actions cache usage, quotas, active entries, and key version collisions.
 */

import { $ } from 'bun';
import { Command } from 'commander';

export const DEFAULT_REPO = 'EmpoHealth/core';
export const GITHUB_CACHE_QUOTA_BYTES = 10 * 1024 * 1024 * 1024; // 10 GiB

export interface CacheEntry {
  id: number;
  ref: string;
  key: string;
  version: string;
  size_in_bytes: number;
  created_at: string;
  last_accessed_at: string;
}

export function formatBytes(bytesVal: number): string {
  if (bytesVal < 1024) return `${bytesVal} B`;
  if (bytesVal < 1024 * 1024) return `${(bytesVal / 1024).toFixed(2)} KiB`;
  if (bytesVal < 1024 * 1024 * 1024) return `${(bytesVal / (1024 * 1024)).toFixed(2)} MiB`;
  return `${(bytesVal / (1024 * 1024 * 1024)).toFixed(2)} GiB`;
}

export async function fetchCaches(repo: string, key?: string, ref?: string): Promise<CacheEntry[]> {
  const queryParams = new URLSearchParams();
  if (key) queryParams.set('key', key);
  if (ref) queryParams.set('ref', ref);

  const queryString = queryParams.toString();
  const querySuffix = queryString ? `?${queryString}` : '';
  const endpoint = `/repos/${repo}/actions/caches${querySuffix}`;

  try {
    const rawOutput = (await $`gh api ${endpoint} --paginate`.quiet().text()).trim();
    if (!rawOutput) return [];

    const data = JSON.parse(rawOutput);
    if (Array.isArray(data)) return data;
    return (data.actions_caches as CacheEntry[]) || [];
  } catch (err: unknown) {
    throw new Error(
      `Failed to query GitHub cache API: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

export async function runCli(): Promise<void> {
  const program = new Command()
    .name('inspect_cache')
    .description('Inspect GitHub Actions cache usage, quota allocation, and active entries.')
    .option('-r, --repo <owner/repo>', 'GitHub repository', DEFAULT_REPO)
    .option('-k, --key <substring>', 'Filter by cache key prefix/substring')
    .option('--ref <git_ref>', 'Filter by git ref (e.g. refs/pull/2864/merge)')
    .option('-d, --details', 'Print individual cache entries')
    .option('-j, --json', 'Output results formatted as JSON')
    .addHelpText(
      'after',
      `
Examples:
  $ bun run inspect_cache.ts
  $ bun run inspect_cache.ts --key yarn
  $ bun run inspect_cache.ts --ref refs/pull/2864/merge --details
`,
    );

  program.parse();

  const opts = program.opts<{
    repo: string;
    key?: string;
    ref?: string;
    details?: boolean;
    json?: boolean;
  }>();

  try {
    const caches = await fetchCaches(opts.repo, opts.key, opts.ref);

    if (opts.json) {
      console.log(JSON.stringify(caches, null, 2));
      return;
    }

    const totalBytes = caches.reduce((acc, c) => acc + (c.size_in_bytes || 0), 0);
    const quotaPct = (totalBytes / GITHUB_CACHE_QUOTA_BYTES) * 100;

    console.log(`\n=== GitHub Actions Cache: ${opts.repo} ===`);
    console.log(`Total Entries: ${caches.length}`);
    console.log(
      `Total Usage:   ${formatBytes(totalBytes)} / ${formatBytes(GITHUB_CACHE_QUOTA_BYTES)} (${quotaPct.toFixed(1)}%)`,
    );

    if (quotaPct >= 90) {
      console.log(
        '⚠️  Warning: Cache usage is near or exceeding 90% of the 10 GiB repository quota.',
      );
    }

    const byRef: Record<string, { count: number; bytes: number }> = {};
    for (const c of caches) {
      const r = c.ref || 'unknown';
      if (!byRef[r]) byRef[r] = { count: 0, bytes: 0 };
      byRef[r]!.count += 1;
      byRef[r]!.bytes += c.size_in_bytes || 0;
    }

    console.log('\nUsage by Branch / Ref:');
    const sortedRefs = Object.entries(byRef).sort((a, b) => b[1].bytes - a[1].bytes);
    for (const [r, stat] of sortedRefs) {
      console.log(
        `  • ${r.padEnd(35)} ${stat.count.toString().padStart(3)} entries | ${formatBytes(stat.bytes)}`,
      );
    }

    if (opts.details && caches.length > 0) {
      console.log('\nDetailed Cache Entries:');
      for (const c of caches) {
        console.log(
          `  [ID: ${c.id}] ${formatBytes(c.size_in_bytes).padEnd(10)} | ${c.ref.padEnd(30)} | ${c.key}`,
        );
      }
    }
    console.log();
  } catch (err: unknown) {
    console.error('Execution error:', err instanceof Error ? err.message : String(err));
    process.exit(1);
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

#!/usr/bin/env bun
import { Command } from 'commander';
import { resolve } from 'node:path';

export interface ShardOptions {
  shards: number;
  shard?: number;
  backendDir: string;
  dryRun: boolean;
  failFast: boolean;
  extraArgs: string[];
}

export function buildJestArgs(
  shardIndex: number,
  totalShards: number,
  extraArgs: string[] = [],
): string[] {
  return [
    'jest',
    '--cache',
    '--config',
    'sources/e2e/jest-e2e.config.js',
    '--runInBand',
    '--forceExit',
    `--shard=${shardIndex}/${totalShards}`,
    ...extraArgs,
  ];
}

export function parseShardList(shards: number, onlyShard?: number): number[] {
  if (!Number.isInteger(shards) || shards < 1) {
    throw new Error(`--shards must be a positive integer, got: ${shards}`);
  }
  if (onlyShard !== undefined) {
    if (!Number.isInteger(onlyShard) || onlyShard < 1 || onlyShard > shards) {
      throw new Error(`--shard must be between 1 and ${shards}, got: ${onlyShard}`);
    }
    return [onlyShard];
  }
  return Array.from({ length: shards }, (_, i) => i + 1);
}

export async function runShardedE2E(opts: ShardOptions): Promise<number> {
  const shardIndices = parseShardList(opts.shards, opts.shard);
  const cwd = resolve(opts.backendDir);
  const failedShards: number[] = [];

  for (const idx of shardIndices) {
    const args = buildJestArgs(idx, opts.shards, opts.extraArgs);
    console.log('='.repeat(60));
    console.log(`Running E2E shard ${idx}/${opts.shards} in ${cwd}`);
    console.log('='.repeat(60));

    if (opts.dryRun) {
      console.log(`[dry-run] yarn ${args.join(' ')}`);
      continue;
    }

    const proc = Bun.spawn(['yarn', ...args], {
      cwd,
      stdio: ['inherit', 'inherit', 'inherit'],
    });
    const exitCode = await proc.exited;
    if (exitCode !== 0) {
      failedShards.push(idx);
      if (opts.failFast) {
        console.error(`Shard ${idx}/${opts.shards} failed (exit ${exitCode}). Stopping.`);
        return exitCode;
      }
    }
  }

  console.log('='.repeat(60));
  if (failedShards.length > 0) {
    console.error(`Failed shards: ${failedShards.join(', ')} (out of ${opts.shards})`);
    return 1;
  }

  console.log(
    opts.dryRun
      ? `[dry-run] Would run ${shardIndices.length} E2E shard(s).`
      : `All ${shardIndices.length} E2E shard(s) passed.`,
  );
  return 0;
}

if (import.meta.main) {
  const program = new Command();
  program
    .name('run-e2e-sharded')
    .description('Run backend-api E2E tests in sequential Jest shards to avoid Node heap OOM.')
    .option('-n, --shards <number>', 'Total number of shards', (v) => Number(v), 4)
    .option('-s, --shard <number>', 'Run only a single shard (1..N)', (v) => Number(v))
    .option('-d, --backend-dir <path>', 'Path to workspaces/backend-api', process.cwd())
    .option('--dry-run', 'Print commands without executing them', false)
    .option('--fail-fast', 'Stop immediately on first failing shard', false)
    .allowUnknownOption(true)
    .addHelpText(
      'after',
      `
Examples:
  $ bun run run-e2e-sharded.ts -d workspaces/backend-api
  $ bun run run-e2e-sharded.ts --shards 6 --shard 2 -d workspaces/backend-api
  $ bun run run-e2e-sharded.ts --dry-run -d workspaces/backend-api`,
    )
    .action(async (options, cmd) => {
      const exitCode = await runShardedE2E({
        shards: options.shards,
        shard: options.shard,
        backendDir: options.backendDir,
        dryRun: options.dryRun,
        failFast: options.failFast,
        extraArgs: cmd.args,
      });
      process.exit(exitCode);
    });

  await program.parseAsync(process.argv);
}

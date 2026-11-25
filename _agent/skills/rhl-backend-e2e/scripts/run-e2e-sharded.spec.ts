import { describe, expect, it } from 'bun:test';
import { buildJestArgs, parseShardList, runShardedE2E } from './run-e2e-sharded';

describe('parseShardList', () => {
  it('returns 1..N when no single shard is specified', () => {
    expect(parseShardList(4)).toEqual([1, 2, 3, 4]);
  });

  it('returns [onlyShard] when a valid shard is specified', () => {
    expect(parseShardList(4, 2)).toEqual([2]);
  });

  it('throws on invalid shard counts', () => {
    expect(() => parseShardList(0)).toThrow();
    expect(() => parseShardList(-1)).toThrow();
  });

  it('throws when --shard is out of range', () => {
    expect(() => parseShardList(4, 0)).toThrow();
    expect(() => parseShardList(4, 5)).toThrow();
  });
});

describe('buildJestArgs', () => {
  it('builds expected jest shard arguments', () => {
    expect(buildJestArgs(2, 4, ['--verbose'])).toEqual([
      'jest',
      '--cache',
      '--config',
      'sources/e2e/jest-e2e.config.js',
      '--runInBand',
      '--forceExit',
      '--shard=2/4',
      '--verbose',
    ]);
  });
});

describe('runShardedE2E', () => {
  it('succeeds in dry-run mode without spawning processes', async () => {
    const code = await runShardedE2E({
      shards: 3,
      backendDir: process.cwd(),
      dryRun: true,
      failFast: false,
      extraArgs: [],
    });
    expect(code).toBe(0);
  });
});

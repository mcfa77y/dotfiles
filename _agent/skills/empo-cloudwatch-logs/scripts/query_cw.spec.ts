import { describe, expect, it } from 'bun:test';
import { buildGetResultsArgs, buildStartQueryArgs, parseTimestamp, runQuery } from './query_cw';

describe('query_cw parseTimestamp', () => {
  it('parses valid epoch seconds string', () => {
    expect(parseTimestamp('1762468500')).toBe(1762468500);
  });

  it('parses ISO-8601 string to epoch seconds', () => {
    const iso = '2026-10-06T22:35:00Z';
    const expected = Math.floor(Date.parse(iso) / 1000);
    expect(parseTimestamp(iso)).toBe(expected);
  });

  it('calculates default timestamp when offset is provided', () => {
    const nowSec = Math.floor(Date.now() / 1000);
    const result = parseTimestamp(undefined, 30);
    expect(result).toBeGreaterThanOrEqual(nowSec - 1805);
    expect(result).toBeLessThanOrEqual(nowSec - 1795);
  });

  it('throws for invalid timestamp formats', () => {
    expect(() => parseTimestamp('invalid-date')).toThrow('Invalid timestamp format');
  });
});

describe('query_cw command builders', () => {
  it('builds start-query CLI command with proper escaping', () => {
    const cmd = buildStartQueryArgs({
      logGroup: '/ecs/backend/',
      query: 'fields @timestamp | filter res.statusCode >= 400',
      startSec: 1000,
      endSec: 2000,
      profile: 'empo-staging-read-only',
      region: 'us-east-1',
    });

    expect(cmd).toContain('--log-group-name "/ecs/backend/"');
    expect(cmd).toContain('--start-time "1000"');
    expect(cmd).toContain('--end-time "2000"');
    expect(cmd).toContain('--query-string "fields @timestamp | filter res.statusCode >= 400"');
    expect(cmd).toContain('--profile "empo-staging-read-only"');
  });

  it('builds get-query-results CLI command', () => {
    const cmd = buildGetResultsArgs('qid-12345', 'empo-staging-read-only', 'us-east-1');
    expect(cmd).toBe(
      'aws logs get-query-results --profile "empo-staging-read-only" --region "us-east-1" --query-id "qid-12345" --output json',
    );
  });
});

describe('query_cw runQuery', () => {
  it('returns query plan in dryRun mode without executing runner', async () => {
    const mockRunner = async () => {
      throw new Error('Runner should not be called in dryRun');
    };

    const result = (await runQuery(
      {
        logGroup: '/ecs/backend/',
        query: 'fields @timestamp',
        start: '1762468000',
        end: '1762469000',
        dryRun: true,
      },
      mockRunner,
    )) as { dryRun: boolean; startCommand: string; startSec: number; endSec: number };

    expect(result.dryRun).toBe(true);
    expect(result.startSec).toBe(1762468000);
    expect(result.endSec).toBe(1762469000);
    expect(result.startCommand).toContain('--start-time "1762468000"');
  });

  it('polls status until Complete and parses JSON result', async () => {
    let pollCount = 0;
    const mockRunner = async (cmd: string) => {
      if (cmd.includes('start-query')) {
        return 'qid-999';
      }
      if (cmd.includes('--query status')) {
        pollCount++;
        return pollCount > 1 ? 'Complete' : 'Running';
      }
      if (cmd.includes('--output json')) {
        return JSON.stringify({
          status: 'Complete',
          results: [[{ field: '@timestamp', value: '2026-10-06' }]],
        });
      }
      return '';
    };

    const sleeper = async () => {};

    const result = (await runQuery(
      {
        logGroup: '/ecs/backend/',
        start: '1762468000',
        end: '1762469000',
        timeout: 5,
      },
      mockRunner,
      sleeper,
    )) as { status: string; results: unknown[] };

    expect(result.status).toBe('Complete');
    expect(result.results.length).toBe(1);
    expect(pollCount).toBe(2);
  });

  it('throws when query status fails', async () => {
    const mockRunner = async (cmd: string) => {
      if (cmd.includes('start-query')) return 'qid-failed';
      if (cmd.includes('--query status')) return 'Failed';
      return '';
    };

    expect(
      runQuery(
        {
          start: '1762468000',
          end: '1762469000',
        },
        mockRunner,
        async () => {},
      ),
    ).rejects.toThrow('CloudWatch query ended with status: Failed');
  });
});

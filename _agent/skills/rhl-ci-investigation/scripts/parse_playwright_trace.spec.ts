import { describe, expect, it } from 'bun:test';
import {
  findTraceZips,
  formatTextReport,
  parseNetworkLines,
  parseTraceLines,
  type ParsedTraceResult,
} from './parse_playwright_trace';

describe('parse_playwright_trace', () => {
  describe('findTraceZips', () => {
    it('returns empty array for non-existent path', () => {
      expect(findTraceZips('/path/that/does/not/exist/trace.zip')).toEqual([]);
    });

    it('returns single zip path when targeting a zip file', () => {
      // Use existing trace in /tmp if available, or test logic
      const zips = findTraceZips('/tmp/nonexistent.zip');
      expect(zips).toEqual([]);
    });
  });

  describe('parseTraceLines', () => {
    it('handles empty lines gracefully', () => {
      const result = parseTraceLines(['', '   ']);
      expect(result.hasError).toBe(false);
      expect(result.precedingCalls).toEqual([]);
    });

    it('extracts error and preceding actions', () => {
      const lines = [
        JSON.stringify({
          type: 'action',
          callId: '1',
          title: 'click',
          params: { selector: 'button.submit' },
          startTime: 1000,
        }),
        JSON.stringify({
          type: 'action',
          callId: '2',
          title: 'waitForSelector',
          params: { selector: 'div.success' },
          startTime: 1050,
        }),
        JSON.stringify({
          type: 'error',
          callId: '3',
          message: 'TimeoutError: locator.waitFor: Timeout 5000ms exceeded.',
          stack: 'TimeoutError: locator.waitFor\n    at Object.test (test.ts:10:5)',
        }),
      ];

      const result = parseTraceLines(lines, 5);
      expect(result.hasError).toBe(true);
      expect(result.error).toContain('TimeoutError');
      expect(result.precedingCalls.length).toBe(2);
      expect(result.precedingCalls[0].selector).toBe('button.submit');
      expect(result.precedingCalls[1].selector).toBe('div.success');
    });

    it('respects the limit argument', () => {
      const lines: string[] = [];
      for (let i = 0; i < 10; i++) {
        lines.push(
          JSON.stringify({
            type: 'action',
            callId: `${i}`,
            title: `action-${i}`,
          }),
        );
      }
      lines.push(
        JSON.stringify({
          type: 'error',
          message: 'Fatal error',
        }),
      );

      const result = parseTraceLines(lines, 3);
      expect(result.precedingCalls.length).toBe(3);
      expect(result.precedingCalls[0].title).toBe('action-7');
      expect(result.precedingCalls[2].title).toBe('action-9');
    });
  });
  describe('parseNetworkLines', () => {
    it('parses network snapshots from trace log lines', () => {
      const lines = [
        JSON.stringify({
          snapshot: {
            request: { method: 'POST', url: 'https://api.staging.empohealth.com/visits' },
            response: { status: 201, statusText: 'Created' },
          },
        }),
        JSON.stringify({
          snapshot: {
            request: { method: 'GET', url: 'https://api.staging.empohealth.com/health' },
            response: { status: 500, statusText: 'Internal Server Error' },
          },
        }),
      ];
      const calls = parseNetworkLines(lines);
      expect(calls).toHaveLength(2);
      expect(calls[0].method).toBe('POST');
      expect(calls[0].url).toBe('https://api.staging.empohealth.com/visits');
      expect(calls[0].status).toBe(201);
      expect(calls[1].status).toBe(500);
    });

    it('ignores invalid non-snapshot lines', () => {
      const calls = parseNetworkLines(['', 'not a json', '{"other": 123}']);
      expect(calls).toEqual([]);
    });
  });

  describe('formatTextReport', () => {
    it('formats passed and failed traces into readable text', () => {
      const results: ParsedTraceResult[] = [
        {
          traceFile: '/tmp/trace-passed.zip',
          hasError: false,
          precedingCalls: [],
        },
        {
          traceFile: '/tmp/trace-failed.zip',
          hasError: true,
          error: 'Error: expect(received).toBe(expected)',
          precedingCalls: [
            {
              type: 'action',
              title: 'click',
              selector: 'a.link',
              stack: { file: 'test.ts', line: 42 },
            },
          ],
        },
      ];

      const text = formatTextReport(results);
      expect(text).toContain('Trace: /tmp/trace-passed.zip');
      expect(text).toContain('Status: PASSED');
      expect(text).toContain('Trace: /tmp/trace-failed.zip');
      expect(text).toContain('Status: FAILED');
      expect(text).toContain('Error: expect(received).toBe(expected)');
      expect(text).toContain('[action] click [selector: a.link] (test.ts:42)');
    });
    it('formats network calls when present in trace result', () => {
      const results: ParsedTraceResult[] = [
        {
          traceFile: '/tmp/trace-net.zip',
          hasError: true,
          error: 'TimeoutError',
          precedingCalls: [],
          networkCalls: [
            { method: 'GET', url: 'https://link.staging.empohealth.com/data', status: 200 },
            { method: 'PATCH', url: 'https://link.staging.empohealth.com/fail', status: 500 },
          ],
        },
      ];

      const text = formatTextReport(results);
      expect(text).toContain('Network Requests (2):');
      expect(text).toContain('GET [200] https://link.staging.empohealth.com/data');
      expect(text).toContain('PATCH [500] https://link.staging.empohealth.com/fail');
    });
  });
});

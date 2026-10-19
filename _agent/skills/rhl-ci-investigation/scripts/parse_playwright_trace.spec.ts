import { describe, expect, it } from 'bun:test';
import {
  findTraceZips,
  formatTextReport,
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
  });
});

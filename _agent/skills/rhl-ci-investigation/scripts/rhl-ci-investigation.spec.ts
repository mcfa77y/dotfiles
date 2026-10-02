import { describe, expect, it } from 'bun:test';
import { extractPlaywrightErrors, parseUrlOrId } from './fetch_failed_logs.ts';
import { formatBytes } from './inspect_cache.ts';

describe('rhl-ci-investigation', () => {
  describe('parseUrlOrId', () => {
    it('parses run ID directly', () => {
      const res = parseUrlOrId('35910923024');
      expect(res.runId).toBe('35910923024');
      expect(res.jobId).toBeNull();
      expect(res.repo).toBe('EmpoHealth/core');
    });

    it('parses full GitHub Actions job URL', () => {
      const url = 'https://github.com/EmpoHealth/core/actions/runs/35910923024/job/107357575748?pr=2754';
      const res = parseUrlOrId(url);
      expect(res.runId).toBe('35910923024');
      expect(res.jobId).toBe('107357575748');
      expect(res.repo).toBe('EmpoHealth/core');
    });
  });

  describe('extractPlaywrightErrors', () => {
    it('extracts test file and expected/received errors from sample log text', () => {
      const sampleLog = `
  1) [chromium] › tests/patient-page.spec.ts:42:7 › Patient Page › should load patient table
    Error: expect(received).toBe(expected) // Object.is equality

    Expected: "Active"
    Received: "Inactive"
      40 |   await page.goto('/patients');
      41 |   const status = await page.getByRole('cell', { name: 'Status' }).innerText();
    > 42 |   expect(status).toBe('Active');
         |                  ^
`;

      const errors = extractPlaywrightErrors(sampleLog);
      expect(errors).toHaveLength(1);
      expect(errors[0]!.file).toBe('tests/patient-page.spec.ts:42');
      expect(errors[0]!.expected).toBe('"Active"');
      expect(errors[0]!.received).toBe('"Inactive"');
    });
  });

  describe('formatBytes', () => {
    it('formats bytes correctly across units', () => {
      expect(formatBytes(500)).toBe('500 B');
      expect(formatBytes(1024 * 5)).toBe('5.00 KiB');
      expect(formatBytes(1024 * 1024 * 20)).toBe('20.00 MiB');
      expect(formatBytes(1024 * 1024 * 1024 * 3.5)).toBe('3.50 GiB');
    });
  });
});

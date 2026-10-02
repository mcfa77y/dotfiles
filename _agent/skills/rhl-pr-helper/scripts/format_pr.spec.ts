import { describe, expect, it } from 'bun:test';
import { extractTicketIds, formatPullRequest, sanitizeDetailedDescription } from './format_pr.ts';

describe('format_pr', () => {
  describe('extractTicketIds', () => {
    it('extracts unique Linear tickets from text', () => {
      const text = 'Fixes RHL-4460 and also relates to RHL-1234 and RHL-4460.';
      expect(extractTicketIds(text)).toEqual(['RHL-4460', 'RHL-1234']);
    });

    it('returns empty array when no tickets present', () => {
      expect(extractTicketIds('No tickets here')).toEqual([]);
    });
  });

  describe('sanitizeDetailedDescription', () => {
    it('converts level 1 and 2 ATX headers to level 3', () => {
      const raw = `# Main Header

Some info.

## Problem
Broken logic.`;

      const sanitized = sanitizeDetailedDescription(raw);
      expect(sanitized).toContain('### Main Header');
      expect(sanitized).toContain('### Problem');
    });

    it('returns scaffold when empty', () => {
      const sanitized = sanitizeDetailedDescription('');
      expect(sanitized).toContain('### Problem');
      expect(sanitized).toContain('### Solution');
      expect(sanitized).toContain('### Verification');
    });
  });

  describe('formatPullRequest', () => {
    it('creates a strictly valid Empo Health PR format', () => {
      const result = formatPullRequest({
        title: 'feat: add user authentication',
        body: 'Added auth logic.',
        tickets: ['RHL-4460'],
      });

      expect(result.valid).toBe(true);
      expect(result.title).toBe('feat: add user authentication (RHL-4460)');
      expect(result.formatted).toContain('Detailed Description\n--------------------');
      expect(result.formatted).toContain('Relevant Linear Tickets\n-----------------------');
      expect(result.formatted).toContain('This change contributes to RHL-4460.');
      expect(result.formatted).toContain('Reviews and Merging\n-------------------');
    });
  });
});

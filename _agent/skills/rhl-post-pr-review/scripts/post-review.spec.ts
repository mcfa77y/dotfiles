import { describe, expect, it } from 'bun:test';
import { extractValidPatchLines, parsePrTarget } from './post-review.ts';

describe('post-review', () => {
  describe('parsePrTarget', () => {
    it('parses numeric string', () => {
      const res = parsePrTarget('2864');
      expect(res.prNumber).toBe(2864);
      expect(res.repo).toBeNull();
    });

    it('parses number directly', () => {
      const res = parsePrTarget(2864);
      expect(res.prNumber).toBe(2864);
      expect(res.repo).toBeNull();
    });

    it('parses full GitHub PR URL', () => {
      const res = parsePrTarget('https://github.com/EmpoHealth/core/pull/2864');
      expect(res.prNumber).toBe(2864);
      expect(res.repo).toBe('EmpoHealth/core');
    });

    it('parses repo#number', () => {
      const res = parsePrTarget('EmpoHealth/core#2864');
      expect(res.prNumber).toBe(2864);
      expect(res.repo).toBe('EmpoHealth/core');
    });

    it('throws on invalid target', () => {
      expect(() => parsePrTarget('invalid-target')).toThrow();
    });
  });

  describe('extractValidPatchLines', () => {
    it('correctly tracks valid right line numbers from diff hunk', () => {
      const samplePatch = `@@ -10,3 +20,4 @@
 context
-deleted
+added
 context 2`;
      const validLines = extractValidPatchLines(samplePatch);
      // context -> line 20
      // deleted -> left line only
      // added -> line 21
      // context 2 -> line 22
      expect(validLines.has(20)).toBe(true);
      expect(validLines.has(21)).toBe(true);
      expect(validLines.has(22)).toBe(true);
      expect(validLines.has(23)).toBe(false);
    });
  });
});

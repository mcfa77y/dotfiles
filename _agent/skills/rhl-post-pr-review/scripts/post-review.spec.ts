import { describe, expect, it } from 'bun:test';
import { parsePrTarget } from './post-review.ts';

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
});

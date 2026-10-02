import { describe, expect, it } from 'bun:test';
import { parseSbomJson } from './verify_docker_sbom_caching.ts';

describe('rhl-docker-sbom', () => {
  describe('parseSbomJson', () => {
    it('parses valid sbom metadata json', () => {
      const sample = JSON.stringify({
        name: 'backend-api',
        version: '1.0.0',
        commitSha: 'sha-123456',
      });
      const parsed = parseSbomJson(sample);
      expect(parsed.name).toBe('backend-api');
      expect(parsed.commitSha).toBe('sha-123456');
    });

    it('throws on invalid json', () => {
      expect(() => parseSbomJson('not-json')).toThrow();
    });
  });
});

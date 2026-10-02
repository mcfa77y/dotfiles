import { describe, expect, it } from 'bun:test';
import { checkMockHealth } from './mock_service_ctl.ts';
import { resolveApiKey } from './trigger_inbound_sms.ts';

describe('rhl-mock-services', () => {
  describe('resolveApiKey', () => {
    it('returns default fallback or env key', async () => {
      const key = await resolveApiKey();
      expect(key).toBeDefined();
      expect(typeof key).toBe('string');
      expect(key.length).toBeGreaterThan(5);
    });
  });

  describe('checkMockHealth', () => {
    it('returns structured result for unreachable port', async () => {
      const result = await checkMockHealth(59999, 500);
      expect(result.healthy).toBe(false);
      expect(result.url).toBe('http://localhost:59999/health');
    });
  });
});

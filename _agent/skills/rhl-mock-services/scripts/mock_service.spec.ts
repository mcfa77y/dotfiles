import { describe, expect, it } from 'bun:test';
import { checkMockHealth, registerMemfaultScenario, resetScenarios } from './mock_service_ctl.ts';
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

  describe('resetScenarios', () => {
    it('handles unreachable mock services gracefully', async () => {
      const result = await resetScenarios({ port: 59999, prTag: 'test-pr' });
      expect(result.cleared).toBe(false);
      expect(result.statusCode).toBe(0);
      expect(result.error).toBeDefined();
    });
  });

  describe('registerMemfaultScenario', () => {
    it('handles unreachable mock services gracefully', async () => {
      const result = await registerMemfaultScenario({
        port: 59999,
        prTag: 'test-pr',
        deviceSerial: 'qa-test-serial',
        cohortSlug: 'qa-cohort-test',
      });
      expect(result.registered).toBe(false);
      expect(result.statusCode).toBe(0);
      expect(result.error).toBeDefined();
    });
  });
});

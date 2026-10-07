import { describe, expect, it } from 'bun:test';
import {
  type CatalogModel,
  extractConfigModelReferences,
  filterCatalog,
  formatCatalogTable,
  validateConfigReferences,
} from './refresh-model-config.ts';

const mockCatalog: CatalogModel[] = [
  {
    id: 'google/gemini-3.8-flash',
    contextWindow: 128000,
    maxTokens: 65536,
    thinking: ['low', 'medium', 'high'],
    input: ['text', 'image'],
    reasoning: true,
  },
  {
    id: 'google/gemini-3.7-flash',
    contextWindow: 128000,
    maxTokens: 65536,
    thinking: ['minimal', 'low', 'medium', 'high'],
    input: ['text', 'image'],
    reasoning: true,
  },
  {
    id: 'anthropic/claude-opus-5',
    contextWindow: 200000,
    maxTokens: 32000,
    thinking: ['low', 'medium', 'high'],
    input: ['text', 'image'],
    reasoning: true,
  },
];

describe('refresh-model-config', () => {
  describe('filterCatalog', () => {
    it('returns all models when no family prefix is given', () => {
      expect(filterCatalog(mockCatalog)).toHaveLength(3);
    });

    it('filters models matching family prefix', () => {
      const filtered = filterCatalog(mockCatalog, 'google/');
      expect(filtered).toHaveLength(2);
      expect(filtered.every((m) => m.id.startsWith('google/'))).toBe(true);
    });
  });

  describe('extractConfigModelReferences', () => {
    it('extracts unique model IDs with thinking levels', () => {
      const config = `
modelRoles:
  default: empo-ai/google/gemini-3.8-flash:high
  task: empo-ai/google/gemini-3.8-flash:high
  smol: empo-ai/google/gemini-3.7-flash:low
retry:
  fallbackChains:
    default:
      - empo-ai/google/gemini-3.8-flash:medium
`;
      const refs = extractConfigModelReferences(config, 'empo-ai');
      expect(refs).toEqual([
        {
          raw: 'empo-ai/google/gemini-3.8-flash:high',
          modelId: 'google/gemini-3.8-flash',
          thinkingLevel: 'high',
        },
        {
          raw: 'empo-ai/google/gemini-3.7-flash:low',
          modelId: 'google/gemini-3.7-flash',
          thinkingLevel: 'low',
        },
        {
          raw: 'empo-ai/google/gemini-3.8-flash:medium',
          modelId: 'google/gemini-3.8-flash',
          thinkingLevel: 'medium',
        },
      ]);
    });
  });

  describe('validateConfigReferences', () => {
    it('validates references when all models and thinking levels match', () => {
      const refs = [
        {
          raw: 'empo-ai/google/gemini-3.8-flash:high',
          modelId: 'google/gemini-3.8-flash',
          thinkingLevel: 'high',
        },
      ];
      const result = validateConfigReferences(refs, mockCatalog, 'google/');
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.warnings).toHaveLength(0);
    });

    it('flags missing models as errors', () => {
      const refs = [
        {
          raw: 'empo-ai/google/gemini-nonexistent:high',
          modelId: 'google/gemini-nonexistent',
          thinkingLevel: 'high',
        },
      ];
      const result = validateConfigReferences(refs, mockCatalog);
      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('[MISSING]');
    });

    it('warns when thinking level is not supported by model', () => {
      const refs = [
        {
          raw: 'empo-ai/google/gemini-3.8-flash:minimal',
          modelId: 'google/gemini-3.8-flash',
          thinkingLevel: 'minimal',
        },
      ];
      const result = validateConfigReferences(refs, mockCatalog);
      expect(result.valid).toBe(true);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]).toContain('[THINK LEVEL WARNING]');
    });

    it('warns on family mismatch when filter is set', () => {
      const refs = [
        {
          raw: 'empo-ai/anthropic/claude-opus-5:high',
          modelId: 'anthropic/claude-opus-5',
          thinkingLevel: 'high',
        },
      ];
      const result = validateConfigReferences(refs, mockCatalog, 'google/');
      expect(result.valid).toBe(true);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]).toContain('[FAMILY MISMATCH]');
    });
  });

  describe('formatCatalogTable', () => {
    it('formats models into aligned text table', () => {
      const table = formatCatalogTable([mockCatalog[0]]);
      expect(table).toContain('google/gemini-3.8-flash');
      expect(table).toContain('ctx=128000');
      expect(table).toContain('think=["low","medium","high"]');
    });
  });
});

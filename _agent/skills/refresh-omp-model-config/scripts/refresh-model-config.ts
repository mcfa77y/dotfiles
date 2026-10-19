#!/usr/bin/env bun
/**
 * refresh-model-config.ts
 *
 * Query live model catalog from `omp models <provider>`, filter by family,
 * and validate or audit model references in `agent/config.yml.<provider>`.
 */

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Command } from 'commander';

export interface CatalogModel {
  id: string;
  contextWindow?: number;
  maxTokens?: number;
  thinking?: string[] | null;
  input?: string[];
  reasoning?: boolean;
}

export interface ConfigModelRef {
  raw: string;
  modelId: string;
  thinkingLevel?: string;
}

export interface ValidationResult {
  valid: boolean;
  checkedCount: number;
  errors: string[];
  warnings: string[];
}

/**
 * Filter models by family prefix (e.g. 'google/').
 */
export function filterCatalog(models: CatalogModel[], family?: string): CatalogModel[] {
  if (!family) return models;
  return models.filter((m) => m.id.startsWith(family));
}

/**
 * Extract model references from config content for a given provider.
 * Matches patterns like `empo-ai/google/gemini-3.8-flash:high` or `devin/swe-1-7:medium`.
 */
export function extractConfigModelReferences(
  configContent: string,
  provider: string,
): ConfigModelRef[] {
  const modelRegex = new RegExp(
    `${provider}/([a-zA-Z0-9._-]+(?:/[a-zA-Z0-9._-]+)*)(?::([a-z]+))?`,
    'g',
  );
  const matches = Array.from(configContent.matchAll(modelRegex));
  const seen = new Set<string>();
  const results: ConfigModelRef[] = [];

  for (const match of matches) {
    const raw = match[0];
    const modelId = match[1];
    const thinkingLevel = match[2];

    if (seen.has(raw)) continue;
    seen.add(raw);

    results.push({
      raw,
      modelId,
      thinkingLevel,
    });
  }

  return results;
}

/**
 * Validate extracted model references against live catalog models.
 */
export function validateConfigReferences(
  references: ConfigModelRef[],
  catalogModels: CatalogModel[],
  familyFilter?: string,
): ValidationResult {
  const modelById = new Map(catalogModels.map((m) => [m.id, m]));
  const errors: string[] = [];
  const warnings: string[] = [];

  for (const ref of references) {
    const model = modelById.get(ref.modelId);
    if (!model) {
      errors.push(`[MISSING] Model not found in catalog: ${ref.raw} (id: ${ref.modelId})`);
      continue;
    }

    if (familyFilter && !ref.modelId.startsWith(familyFilter)) {
      warnings.push(
        `[FAMILY MISMATCH] Model ${ref.raw} does not match requested family '${familyFilter}'`,
      );
    }

    if (ref.thinkingLevel) {
      const allowedLevels = model.thinking || [];
      if (allowedLevels.length > 0 && !allowedLevels.includes(ref.thinkingLevel)) {
        warnings.push(
          `[THINK LEVEL WARNING] Model ${ref.raw} specifies :${ref.thinkingLevel}, but model only supports: ${allowedLevels.join(', ')}`,
        );
      }
    }
  }

  return {
    valid: errors.length === 0,
    checkedCount: references.length,
    errors,
    warnings,
  };
}

/**
 * Format catalog models into a human-readable table string.
 */
export function formatCatalogTable(models: CatalogModel[]): string {
  const lines: string[] = [];
  for (const m of models) {
    const think = m.thinking ? JSON.stringify(m.thinking) : 'null';
    const inputs = (m.input || []).join(',');
    lines.push(
      `${m.id.padEnd(38)} ctx=${String(m.contextWindow ?? '').padEnd(8)} max=${String(m.maxTokens ?? '').padEnd(6)} think=${think.padEnd(32)} inputs=${inputs}`,
    );
  }
  return lines.join('\n');
}

/**
 * Fetch live catalog using `omp models <provider> --json`.
 */
export async function fetchCatalog(providerName: string): Promise<CatalogModel[]> {
  const proc = Bun.spawn(['omp', 'models', providerName, '--json'], {
    stderr: 'ignore',
  });
  const output = await new Response(proc.stdout).text();
  await proc.exited;

  try {
    const data = JSON.parse(output);
    return data.models || [];
  } catch (e) {
    throw new Error(`Failed to parse omp models output for provider '${providerName}': ${e}`);
  }
}

export async function runCli(): Promise<void> {
  const program = new Command()
    .name('refresh-model-config')
    .description('Audit, catalog, and validate models in Oh My Pi provider config.')
    .option('-p, --provider <name>', 'Provider name (e.g. empo-ai, devin)', 'empo-ai')
    .option('-f, --family <prefix>', 'Family prefix filter (e.g. google/)')
    .option('-c, --config <path>', 'Path to config file (default: agent/config.yml.<provider>)')
    .option('--catalog', 'Display formatted live model catalog', false)
    .option('--validate', 'Validate model references in config against live catalog', false)
    .addHelpText(
      'after',
      `
Examples:
  $ bun run scripts/refresh-model-config.ts --catalog --family google/
  $ bun run scripts/refresh-model-config.ts --validate --config agent/config.yml.empo-ai
  $ bun run scripts/refresh-model-config.ts -p devin --catalog
`,
    );

  program.parse();
  const options = program.opts();

  const provider = options.provider as string;
  const family = options.family as string | undefined;
  const configPath = resolve(options.config || `agent/config.yml.${provider}`);

  console.log(`📡 Fetching live catalog for provider '${provider}'...`);
  const allModels = await fetchCatalog(provider);
  const filteredModels = filterCatalog(allModels, family);

  if (options.catalog || (!options.validate && !options.config)) {
    console.log(
      `\n=== Available models for provider '${provider}' (Family: '${family || 'all'}') ===\n`,
    );
    console.log(formatCatalogTable(filteredModels));
    console.log(`\nTotal models: ${filteredModels.length}`);
  }

  if (options.validate || options.config) {
    if (!existsSync(configPath)) {
      console.error(`\n❌ Config file not found: ${configPath}`);
      process.exit(1);
    }

    console.log(`\n🔍 Validating config: ${configPath}`);
    const content = readFileSync(configPath, 'utf-8');
    const refs = extractConfigModelReferences(content, provider);
    const result = validateConfigReferences(refs, allModels, family);

    if (result.warnings.length > 0) {
      console.log('\n⚠️  Warnings:');
      for (const w of result.warnings) {
        console.warn(`  ${w}`);
      }
    }

    if (!result.valid) {
      console.error('\n❌ Errors found:');
      for (const err of result.errors) {
        console.error(`  ${err}`);
      }
      process.exit(1);
    }

    console.log(
      `\n✅ All ${result.checkedCount} model references in ${configPath} are valid in live catalog!`,
    );
  }
}

if (import.meta.main) {
  runCli().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

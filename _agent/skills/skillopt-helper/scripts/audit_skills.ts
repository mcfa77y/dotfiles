#!/usr/bin/env bun
/**
 * audit_skills.ts
 *
 * Discovers and audits agent skill documents, reporting line, word,
 * character counts, script presence, and test coverage.
 */

import { existsSync, readdirSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { Command } from 'commander';

export interface SkillAuditMetrics {
  name: string;
  path: string;
  lines: number;
  words: number;
  chars: number;
  hasScripts: boolean;
  scriptCount: number;
  hasTests: boolean;
}

export async function auditSingleSkill(skillDir: string): Promise<SkillAuditMetrics | null> {
  const skillFile = join(skillDir, 'SKILL.md');
  if (!existsSync(skillFile)) {
    return null;
  }

  const name = skillDir.split('/').pop() || 'unknown';
  const file = Bun.file(skillFile);
  const text = await file.text();

  const lines = text.length === 0 ? 0 : text.split('\n').length;
  const words = text.trim().length === 0 ? 0 : text.trim().split(/\s+/).length;
  const chars = text.length;

  const scriptsDir = join(skillDir, 'scripts');
  let hasScripts = false;
  let scriptCount = 0;
  let hasTests = false;

  if (existsSync(scriptsDir) && statSync(scriptsDir).isDirectory()) {
    try {
      const entries = readdirSync(scriptsDir);
      scriptCount = entries.filter((e) => !e.startsWith('.')).length;
      hasScripts = scriptCount > 0;
      hasTests = entries.some((e) => e.endsWith('.spec.ts') || e.endsWith('.test.ts'));
    } catch {
      // Ignore directory read errors
    }
  }

  return {
    name,
    path: skillFile,
    lines,
    words,
    chars,
    hasScripts,
    scriptCount,
    hasTests,
  };
}

export async function collectSkillsFromDirs(
  directories: string[],
  filterPattern?: string,
): Promise<SkillAuditMetrics[]> {
  const skillsMap = new Map<string, SkillAuditMetrics>();

  for (const rawDir of directories) {
    const dir = rawDir.startsWith('~/') ? join(homedir(), rawDir.slice(2)) : resolve(rawDir);
    if (!existsSync(dir) || !statSync(dir).isDirectory()) {
      continue;
    }

    const entries = readdirSync(dir);
    for (const entry of entries) {
      if (entry.startsWith('.')) continue;

      if (filterPattern) {
        const regex = new RegExp(filterPattern, 'i');
        if (!regex.test(entry)) continue;
      }

      const fullSkillDir = join(dir, entry);
      if (!statSync(fullSkillDir).isDirectory()) continue;

      // Avoid duplicates if already discovered from another root
      if (skillsMap.has(entry)) continue;

      const metrics = await auditSingleSkill(fullSkillDir);
      if (metrics) {
        skillsMap.set(entry, metrics);
      }
    }
  }

  return Array.from(skillsMap.values()).sort((a, b) => a.name.localeCompare(b.name));
}

export function formatAuditTable(skills: SkillAuditMetrics[]): string {
  if (skills.length === 0) {
    return 'No skills matched the criteria.';
  }

  const lines: string[] = [];
  lines.push('='.repeat(88));
  lines.push(`Discovered and Audited ${skills.length} Skills`);
  lines.push('='.repeat(88));
  lines.push(`Skill Name                      | Lines |  Words |  Chars | Scripts | Tests`);
  lines.push('-'.repeat(88));

  for (const s of skills) {
    const nameCol = s.name.padEnd(31);
    const lineCol = String(s.lines).padStart(5);
    const wordCol = String(s.words).padStart(6);
    const charCol = String(s.chars).padStart(6);
    const scriptCol = (s.hasScripts ? `Yes (${s.scriptCount})` : 'No').padStart(7);
    const testCol = (s.hasTests ? 'Yes' : 'No').padStart(5);
    lines.push(`${nameCol} | ${lineCol} | ${wordCol} | ${charCol} | ${scriptCol} | ${testCol}`);
  }
  lines.push('='.repeat(88));
  return lines.join('\n');
}

export async function runCli(): Promise<void> {
  const program = new Command()
    .name('audit_skills')
    .description('Audit agent skills, measuring length, script presence, and test coverage.')
    .option('-d, --dirs <dirs...>', 'Root directories containing skill folders', [
      '~/.omp/agent/skills',
      '~/dotfiles/_agent/skills',
    ])
    .option('-f, --filter <pattern>', 'Filter skills by regex or substring')
    .option('--min-words <count>', 'Filter skills having at least N words', (v) =>
      Number.parseInt(v, 10),
    )
    .option('--has-scripts', 'Only show skills with companion scripts')
    .option('--no-scripts', 'Only show skills without companion scripts')
    .option('--json', 'Output results as formatted JSON')
    .addHelpText(
      'after',
      `
Examples:
  $ bun run scripts/audit_skills.ts
  $ bun run scripts/audit_skills.ts --filter "rhl-.*"
  $ bun run scripts/audit_skills.ts --has-scripts --json
`,
    );

  program.parse();
  const opts = program.opts();

  let skills = await collectSkillsFromDirs(opts.dirs, opts.filter);

  if (opts.minWords !== undefined && !Number.isNaN(opts.minWords)) {
    skills = skills.filter((s) => s.words >= opts.minWords);
  }
  if (opts.hasScripts) {
    skills = skills.filter((s) => s.hasScripts);
  } else if (opts.scripts === false) {
    skills = skills.filter((s) => !s.hasScripts);
  }

  if (opts.json) {
    console.log(JSON.stringify(skills, null, 2));
  } else {
    console.log(formatAuditTable(skills));
  }
}

if (import.meta.main) {
  runCli().catch((err) => {
    console.error('Error auditing skills:', err);
    process.exit(1);
  });
}

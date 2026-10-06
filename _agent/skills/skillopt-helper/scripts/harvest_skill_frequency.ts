#!/usr/bin/env bun
/**
 * harvest_skill_frequency.ts
 *
 * Scans agent session transcripts (~/.omp/agent/sessions), identifies skill
 * invocations, and ranks skills by invocation frequency to prioritize SkillOpt candidates.
 */

import { existsSync, readdirSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { Command } from 'commander';

export interface SkillFrequencyEntry {
  skill: string;
  count: number;
}

export function extractSkillsFromLine(line: string, knownSkills: Set<string>): string[] {
  const found: string[] = [];
  const lower = line.toLowerCase();
  for (const s of knownSkills) {
    if (
      line.includes(`/${s}`) ||
      line.includes(`"${s}"`) ||
      line.includes(`'${s}'`) ||
      line.includes(`\`${s}\``) ||
      line.includes(`skill://${s}`) ||
      lower.includes(`use ${s}`) ||
      lower.includes(`${s} skill`)
    ) {
      found.push(s);
    }
  }
  return found;
}

export function discoverKnownSkills(roots: string[]): Set<string> {
  const skills = new Set<string>();
  for (const raw of roots) {
    const dir = raw.startsWith('~/') ? join(homedir(), raw.slice(2)) : resolve(raw);
    if (!existsSync(dir) || !statSync(dir).isDirectory()) continue;
    try {
      const entries = readdirSync(dir);
      for (const entry of entries) {
        if (entry.startsWith('.')) continue;
        const full = join(dir, entry);
        if (statSync(full).isDirectory() && existsSync(join(full, 'SKILL.md'))) {
          skills.add(entry);
        }
      }
    } catch {
      // Ignore read errors
    }
  }
  return skills;
}

export function findSessionJsonlFiles(sessionsRoot: string, projectFilter?: string): string[] {
  const root = sessionsRoot.startsWith('~/')
    ? join(homedir(), sessionsRoot.slice(2))
    : resolve(sessionsRoot);
  if (!existsSync(root) || !statSync(root).isDirectory()) {
    return [];
  }

  const files: string[] = [];
  try {
    const subdirs = readdirSync(root);
    for (const subdir of subdirs) {
      if (projectFilter && !subdir.toLowerCase().includes(projectFilter.toLowerCase())) {
        continue;
      }
      const fullSubdir = join(root, subdir);
      if (!statSync(fullSubdir).isDirectory()) continue;

      const sessionFiles = readdirSync(fullSubdir);
      for (const file of sessionFiles) {
        if (file.endsWith('.jsonl')) {
          files.push(join(fullSubdir, file));
        }
      }
    }
  } catch {
    // Ignore read errors
  }
  return files;
}

export async function computeSkillFrequencies(
  sessionFiles: string[],
  knownSkills: Set<string>,
): Promise<Map<string, number>> {
  const counts = new Map<string, number>();

  for (const file of sessionFiles) {
    try {
      const text = await Bun.file(file).text();
      const lines = text.split('\n');
      for (const line of lines) {
        const matches = extractSkillsFromLine(line, knownSkills);
        for (const skill of matches) {
          counts.set(skill, (counts.get(skill) || 0) + 1);
        }
      }
    } catch {
      // Ignore individual file reading failures
    }
  }

  return counts;
}

export function formatFrequencyTable(
  entries: SkillFrequencyEntry[],
  totalSessions: number,
): string {
  if (entries.length === 0) {
    return 'No skill invocations discovered in matching sessions.';
  }

  const lines: string[] = [];
  lines.push('='.repeat(64));
  lines.push(`Skill Invocations across ${totalSessions} Harvested Sessions`);
  lines.push('='.repeat(64));
  lines.push(`Rank | Skill Name                      | Invocations`);
  lines.push('-'.repeat(64));

  entries.forEach((e, i) => {
    const rankCol = String(i + 1).padStart(4);
    const nameCol = e.skill.padEnd(31);
    const countCol = String(e.count).padStart(11);
    lines.push(`${rankCol} | ${nameCol} | ${countCol}`);
  });
  lines.push('='.repeat(64));
  return lines.join('\n');
}

export async function runCli(): Promise<void> {
  const program = new Command()
    .name('harvest_skill_frequency')
    .description(
      'Analyze past agent session logs to rank skill usage and prioritize SkillOpt targets.',
    )
    .option('-s, --sessions-dir <path>', 'Sessions root directory', '~/.omp/agent/sessions')
    .option('-k, --skills-roots <dirs...>', 'Skill directories to discover valid skill names', [
      '~/.omp/agent/skills',
      '~/dotfiles/_agent/skills',
    ])
    .option('-p, --project <substring>', 'Filter sessions by project path substring')
    .option(
      '-l, --limit <number>',
      'Number of top skills to display',
      (v) => Number.parseInt(v, 10),
      20,
    )
    .option('--non-rhl', 'Only rank non-RHL skills')
    .option('--json', 'Output results as formatted JSON')
    .addHelpText(
      'after',
      `
Examples:
  $ bun run scripts/harvest_skill_frequency.ts
  $ bun run scripts/harvest_skill_frequency.ts --non-rhl --limit 10
  $ bun run scripts/harvest_skill_frequency.ts --project remote-health-link --json
`,
    );

  program.parse();
  const opts = program.opts();

  const knownSkills = discoverKnownSkills(opts.skillsRoots);
  const sessionFiles = findSessionJsonlFiles(opts.sessionsDir, opts.project);

  const countsMap = await computeSkillFrequencies(sessionFiles, knownSkills);

  let entries: SkillFrequencyEntry[] = Array.from(countsMap.entries()).map(([skill, count]) => ({
    skill,
    count,
  }));

  if (opts.nonRhl) {
    entries = entries.filter((e) => !e.skill.startsWith('rhl-'));
  }

  entries.sort((a, b) => b.count - a.count);

  if (opts.limit && opts.limit > 0) {
    entries = entries.slice(0, opts.limit);
  }

  if (opts.json) {
    console.log(
      JSON.stringify(
        {
          totalSessionsFound: sessionFiles.length,
          topSkills: entries,
        },
        null,
        2,
      ),
    );
  } else {
    console.log(formatFrequencyTable(entries, sessionFiles.length));
  }
}

if (import.meta.main) {
  runCli().catch((err) => {
    console.error('Error harvesting skill frequencies:', err);
    process.exit(1);
  });
}

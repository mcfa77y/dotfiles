#!/usr/bin/env bun
/**
 * generate_skill_tasks.ts
 *
 * Scaffolds deterministic SkillOpt benchmark suites (skillopt_sleep.tasks.v1)
 * directly from SKILL.md rule constraints and historical agent session prompts.
 */

import { existsSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { Command } from 'commander';

export interface JudgeCheck {
  op: 'contains' | 'not_contains' | 'regex';
  arg: string;
}

export interface SkillTaskRecord {
  id: string;
  project: string;
  intent: string;
  context_excerpt: string;
  system: string;
  attempted_solution: string;
  outcome: string;
  reference_kind: string;
  reference: string;
  judge: {
    checks: JudgeCheck[];
  };
  tags: string[];
  source_sessions: string[];
  split: 'train' | 'val';
  origin: 'harvested' | 'synthetic';
  derived_from: string;
  skill_hint: string;
}

export interface BenchmarkTaskSuite {
  format: 'skillopt_sleep.tasks.v1';
  project: string;
  transcript_source: string;
  n_sessions: number;
  target_skill_path: string;
  reviewed: boolean;
  tasks: SkillTaskRecord[];
}

export async function extractSkillRules(
  skillPath: string,
): Promise<{ description: string; checks: JudgeCheck[] }> {
  if (!existsSync(skillPath)) {
    return { description: '', checks: [] };
  }

  const rawText = await Bun.file(skillPath).text();
  let description = '';
  const descMatch = rawText.match(/^description:\s*(.+)$/m);
  if (descMatch?.[1]) {
    description = descMatch[1].trim();
  }

  const checks: JudgeCheck[] = [];
  const textClean = rawText.replaceAll('**', '');

  // Negative checks: bullet items under 'Do not stage / NEVER / exclude / Avoid'
  const bulletBlockRegex =
    /(?:do not|never|exclude|avoid)\s+[^\n]*:\s*\n((?:\s*-\s*`[^`]+`\s*\n?)+)/gi;
  for (const blockMatch of textClean.matchAll(bulletBlockRegex)) {
    const block = blockMatch[1] || '';
    const itemRegex = /`([^`]+)`/g;
    for (const itemMatch of block.matchAll(itemRegex)) {
      const item = itemMatch[1];
      if (item && !checks.some((c) => c.arg === item)) {
        checks.push({ op: 'not_contains', arg: item });
      }
    }
  }

  // Positive checks: common tooling commands backticked in the skill
  const codeRegex = /`([a-z0-9_-]+ [a-z0-9_ -]+)`/g;
  for (const codeMatch of rawText.matchAll(codeRegex)) {
    const code = codeMatch[1];
    if (
      code &&
      ['git ', 'bun ', 'uv ', 'wt ', 'gh '].some((k) => code.startsWith(k)) &&
      !checks.some((c) => c.arg === code)
    ) {
      checks.push({ op: 'contains', arg: code });
    }
  }

  // Explicit MUST clauses
  const mustRegex = /\bMUST\s+(?:use\s+|run\s+|include\s+|have\s+)?([`'"A-Za-z0-9_-]{3,30})/g;
  for (const m of rawText.matchAll(mustRegex)) {
    const val = (m[1] || '').replaceAll(/[`'"]/g, '').trim();
    if (val.length >= 3 && val !== val.toUpperCase() && !checks.some((c) => c.arg === val)) {
      checks.push({ op: 'contains', arg: val });
    }
  }

  // Explicit NEVER clauses
  const neverRegex = /\bNEVER\s+(?:use\s+|run\s+|include\s+|do\s+)?([`'"A-Za-z0-9_-]{3,30})/g;
  for (const m of rawText.matchAll(neverRegex)) {
    const val = (m[1] || '').replaceAll(/[`'"]/g, '').trim();
    if (val.length >= 3 && val !== val.toUpperCase() && !checks.some((c) => c.arg === val)) {
      checks.push({ op: 'not_contains', arg: val });
    }
  }

  return { description, checks };
}

export async function harvestSkillPrompts(
  skillName: string,
  sessionsDir: string,
  limit = 10,
): Promise<string[]> {
  if (!existsSync(sessionsDir)) {
    return [];
  }

  const prompts: string[] = [];
  const entries: string[] = [];

  function collectJsonl(dir: string): void {
    try {
      const files = readdirSync(dir, { withFileTypes: true });
      for (const f of files) {
        const full = join(dir, f.name);
        if (f.isDirectory()) {
          collectJsonl(full);
        } else if (f.isFile() && f.name.endsWith('.jsonl')) {
          entries.push(full);
        }
      }
    } catch {
      // Ignore unreadable dirs
    }
  }

  collectJsonl(sessionsDir);

  const targetSkillUri = `skill://${skillName}`;

  for (const path of entries) {
    try {
      const text = await Bun.file(path).text();
      if (!text.includes(targetSkillUri)) {
        continue;
      }

      const lines = text.split('\n');
      for (const line of lines) {
        if (!line.includes('"role":"user"') && !line.includes('"role": "user"')) {
          continue;
        }
        try {
          const record = JSON.parse(line);
          const msg = record?.message;
          if (msg?.role !== 'user') continue;

          let userText = '';
          if (typeof msg.content === 'string') {
            userText = msg.content;
          } else if (Array.isArray(msg.content)) {
            userText = msg.content
              .filter(
                (b: Record<string, unknown>) => b?.type === 'text' && typeof b.text === 'string',
              )
              .map((b: { text: string }) => b.text)
              .join('\n');
          }

          const clean = userText.trim();
          if (
            clean.length > 15 &&
            !clean.startsWith('/') &&
            !['y', 'yes', 'ok', 'proceed'].includes(clean.toLowerCase()) &&
            !prompts.includes(clean)
          ) {
            prompts.push(clean);
            if (prompts.length >= limit) {
              return prompts;
            }
          }
        } catch {
          // Skip invalid lines
        }
      }
    } catch {
      // Skip unreadable files
    }
  }

  return prompts;
}

export async function buildBenchmarkTasks(options: {
  skillName: string;
  skillPath: string;
  projectDir: string;
  sessionsDir?: string;
  maxTasks?: number;
}): Promise<BenchmarkTaskSuite> {
  const { skillName, skillPath, projectDir, sessionsDir, maxTasks = 4 } = options;
  const { description, checks } = await extractSkillRules(skillPath);

  const prompts = sessionsDir ? await harvestSkillPrompts(skillName, sessionsDir, maxTasks) : [];

  const fallbackIntents = [
    `Execute ${skillName} workflow for current task: ${description || 'adhere to skill guidelines'}.`,
    `Apply ${skillName} instructions to validate and process repository changes.`,
    `Run standard ${skillName} pipeline ensuring all rules, exclusions, and constraints pass.`,
    `Verify code and configuration formatting according to ${skillName}.`,
  ];

  const tasks: SkillTaskRecord[] = [];
  for (let i = 0; i < maxTasks; i++) {
    const hasPrompt = i < prompts.length && prompts[i];
    const intent = hasPrompt
      ? (prompts[i] as string)
      : fallbackIntents[i % fallbackIntents.length]!;
    const origin: 'harvested' | 'synthetic' = hasPrompt ? 'harvested' : 'synthetic';
    const split: 'train' | 'val' = i % 2 === 0 ? 'train' : 'val';
    const taskId = `${skillName.replaceAll('-', '_')}_task_${String(i + 1).padStart(2, '0')}`;

    tasks.push({
      id: taskId,
      project: projectDir,
      intent,
      context_excerpt: `Context for ${skillName}: ${description.slice(0, 120)}...`,
      system: '',
      attempted_solution: '',
      outcome: '',
      reference_kind: 'rules',
      reference: '',
      judge: {
        checks: checks.slice(0, 5),
      },
      tags: [skillName, origin],
      source_sessions: [],
      split,
      origin,
      derived_from: skillName,
      skill_hint: skillName,
    });
  }

  return {
    format: 'skillopt_sleep.tasks.v1',
    project: projectDir,
    transcript_source: 'guided_mining',
    n_sessions: tasks.length,
    target_skill_path: skillPath,
    reviewed: true,
    tasks,
  };
}

async function main(): Promise<void> {
  const defaultSkillsRoot = resolve(homedir(), 'dotfiles/_agent/skills');
  const defaultSessionsDir = resolve(homedir(), '.omp/agent/sessions');
  const defaultProject = '/Users/joe/Projects/empo_health/remote-health-link';
  const scriptsDir = import.meta.dir;

  const program = new Command()
    .name('generate_skill_tasks')
    .description('Scaffold SkillOpt benchmark tasks directly from SKILL.md and past transcripts')
    .requiredOption('--skill <name>', 'Target skill name (e.g. rhl-commit-push)')
    .option('--skill-path <path>', 'Explicit path to SKILL.md')
    .option('--output <path>', 'Destination JSON path')
    .option('--max-tasks <number>', 'Number of benchmark tasks to generate', '4')
    .option('--project <path>', 'Target project directory', defaultProject)
    .option('--sessions-dir <path>', 'OMP sessions directory', defaultSessionsDir)
    .action(async (opts) => {
      const skillName = opts.skill as string;
      const skillPath = opts.skillPath
        ? resolve(opts.skillPath)
        : join(defaultSkillsRoot, skillName, 'SKILL.md');

      if (!existsSync(skillPath)) {
        console.error(`Error: Skill file not found at ${skillPath}`);
        process.exit(1);
      }

      const outputPath = opts.output
        ? resolve(opts.output)
        : join(scriptsDir, `${skillName.replaceAll('-', '_')}_eval_tasks.json`);

      const maxTasks = Number.parseInt(opts.maxTasks, 10) || 4;

      const suite = await buildBenchmarkTasks({
        skillName,
        skillPath,
        projectDir: opts.project,
        sessionsDir: opts.sessionsDir,
        maxTasks,
      });

      await Bun.write(outputPath, `${JSON.stringify(suite, null, 2)}\n`);

      const checksPerTask = suite.tasks[0]?.judge.checks.length ?? 0;
      console.log(
        `Successfully generated ${suite.tasks.length} tasks (${checksPerTask} checks per task) -> ${outputPath}`,
      );
    });

  await program.parseAsync(process.argv);
}

if (import.meta.main) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

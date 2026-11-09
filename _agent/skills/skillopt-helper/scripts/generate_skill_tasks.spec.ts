import { describe, expect, it } from 'bun:test';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  buildBenchmarkTasks,
  extractSkillRules,
  harvestSkillPrompts,
} from './generate_skill_tasks';

describe('generate_skill_tasks', () => {
  it('extractSkillRules returns empty description and checks when file does not exist', async () => {
    const res = await extractSkillRules('/non/existent/path/SKILL.md');
    expect(res.description).toBe('');
    expect(res.checks).toEqual([]);
  });

  it('extractSkillRules extracts negative bullets, backticked commands, MUST, and NEVER rules', async () => {
    const testDir = join(tmpdir(), `test-extract-rules-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
    const skillPath = join(testDir, 'SKILL.md');

    const skillContent = `---
name: mock-git-skill
description: Automates git branching and pushing with conventions.
---
# Mock Git Skill

1. **Safety guards**: Do not stage or commit:
   - \`secrets.env\`
   - \`node_modules/\`

2. **Run command**:
   - MUST use \`git push --force-with-lease\`
   - NEVER use \`git push -f\`

3. Standard push: \`git push\`
`;
    writeFileSync(skillPath, skillContent);

    try {
      const res = await extractSkillRules(skillPath);
      expect(res.description).toBe('Automates git branching and pushing with conventions.');

      const opArgs = res.checks.map((c) => ({ op: c.op, arg: c.arg }));
      expect(opArgs).toContainEqual({ op: 'not_contains', arg: 'secrets.env' });
      expect(opArgs).toContainEqual({ op: 'not_contains', arg: 'node_modules/' });
      expect(opArgs).toContainEqual({ op: 'contains', arg: 'git push' });
    } finally {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('buildBenchmarkTasks constructs a compliant skillopt_sleep.tasks.v1 suite', async () => {
    const testDir = join(tmpdir(), `test-suite-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
    const skillPath = join(testDir, 'SKILL.md');

    writeFileSync(
      skillPath,
      '---\nname: sample-tool\ndescription: Does sample work.\n---\n# Sample\nMUST use `bun run test`\n',
    );

    try {
      const suite = await buildBenchmarkTasks({
        skillName: 'sample-tool',
        skillPath,
        projectDir: '/tmp/proj',
        maxTasks: 4,
      });

      expect(suite.format).toBe('skillopt_sleep.tasks.v1');
      expect(suite.reviewed).toBeTrue();
      expect(suite.tasks.length).toBe(4);
      expect(suite.tasks[0]?.id).toBe('sample_tool_task_01');
      expect(suite.tasks[0]?.split).toBe('train');
      expect(suite.tasks[1]?.split).toBe('val');
      expect(suite.tasks[0]?.derived_from).toBe('sample-tool');
      expect(suite.tasks[0]?.skill_hint).toBe('sample-tool');
    } finally {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('harvestSkillPrompts returns empty array for nonexistent directory', async () => {
    const prompts = await harvestSkillPrompts('sample-skill', '/non/existent/dir');
    expect(prompts).toEqual([]);
  });
});

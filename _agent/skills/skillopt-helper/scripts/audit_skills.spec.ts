import { describe, expect, it } from 'bun:test';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { auditSingleSkill, collectSkillsFromDirs, formatAuditTable } from './audit_skills';

describe('audit_skills', () => {
  it('returns null when SKILL.md is missing', async () => {
    const testDir = join(tmpdir(), `test-skill-empty-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
    try {
      const res = await auditSingleSkill(testDir);
      expect(res).toBeNull();
    } finally {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('accurately audits a skill directory with companion scripts and tests', async () => {
    const testDir = join(tmpdir(), `test-skill-${Date.now()}`);
    const scriptsDir = join(testDir, 'scripts');
    mkdirSync(scriptsDir, { recursive: true });

    const skillContent =
      '---\nname: sample-skill\n---\n# Sample Skill\nThis is a test line.\nAnother line.';
    writeFileSync(join(testDir, 'SKILL.md'), skillContent);
    writeFileSync(join(scriptsDir, 'runner.ts'), "console.log('hi');");
    writeFileSync(join(scriptsDir, 'runner.spec.ts'), "test('ok', () => {});");

    try {
      const res = await auditSingleSkill(testDir);
      expect(res).not.toBeNull();
      expect(res?.name).toBe(testDir.split('/').pop()!);
      expect(res?.lines).toBe(6);
      expect(res?.words).toBe(14);
      expect(res?.hasScripts).toBeTrue();
      expect(res?.scriptCount).toBe(2);
      expect(res?.hasTests).toBeTrue();
    } finally {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('filters skills and avoids duplicate entries across roots', async () => {
    const rootA = join(tmpdir(), `rootA-${Date.now()}`);
    const rootB = join(tmpdir(), `rootB-${Date.now()}`);

    const skillADir = join(rootA, 'skill-alpha');
    const skillBDir = join(rootA, 'skill-beta');
    const skillADupDir = join(rootB, 'skill-alpha');

    mkdirSync(skillADir, { recursive: true });
    mkdirSync(skillBDir, { recursive: true });
    mkdirSync(skillADupDir, { recursive: true });

    writeFileSync(join(skillADir, 'SKILL.md'), '# Skill Alpha\nContent');
    writeFileSync(join(skillBDir, 'SKILL.md'), '# Skill Beta\nContent');
    writeFileSync(join(skillADupDir, 'SKILL.md'), '# Skill Alpha Duplicate\nContent');

    try {
      const all = await collectSkillsFromDirs([rootA, rootB]);
      expect(all.length).toBe(2);
      expect(all.map((s) => s.name)).toEqual(['skill-alpha', 'skill-beta']);

      const filtered = await collectSkillsFromDirs([rootA, rootB], 'alpha');
      expect(filtered.length).toBe(1);
      expect(filtered[0].name).toBe('skill-alpha');
    } finally {
      rmSync(rootA, { recursive: true, force: true });
      rmSync(rootB, { recursive: true, force: true });
    }
  });

  it('formats audit table cleanly for empty and populated results', () => {
    const emptyOutput = formatAuditTable([]);
    expect(emptyOutput).toBe('No skills matched the criteria.');

    const populatedOutput = formatAuditTable([
      {
        name: 'test-tool',
        path: '/path/to/SKILL.md',
        lines: 10,
        words: 50,
        chars: 300,
        hasScripts: true,
        scriptCount: 3,
        hasTests: true,
      },
    ]);
    expect(populatedOutput).toContain('Discovered and Audited 1 Skills');
    expect(populatedOutput).toContain('test-tool');
    expect(populatedOutput).toContain('Yes (3)');
    expect(populatedOutput).toContain('Yes');
  });
});

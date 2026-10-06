import { describe, expect, it } from 'bun:test';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  computeSkillFrequencies,
  discoverKnownSkills,
  extractSkillsFromLine,
  findSessionJsonlFiles,
  formatFrequencyTable,
} from './harvest_skill_frequency';

describe('harvest_skill_frequency', () => {
  it('extracts known skills matching various invocation forms', () => {
    const known = new Set(['grilling', 'unslop', 'promote-script', 'worktrunk']);

    expect(extractSkillsFromLine('Nothing here', known)).toEqual([]);

    expect(extractSkillsFromLine('User says: please use grilling for this', known)).toEqual([
      'grilling',
    ]);

    expect(
      extractSkillsFromLine('Matching skill -> MUST read `skill://unslop` first.', known),
    ).toEqual(['unslop']);

    expect(
      extractSkillsFromLine('Invoking "/worktrunk" and "promote-script"', known).sort(),
    ).toEqual(['promote-script', 'worktrunk']);
  });

  it('discovers valid skills with SKILL.md and ignores empty folders', () => {
    const root = join(tmpdir(), `test-skills-root-${Date.now()}`);
    const validSkillDir = join(root, 'valid-skill');
    const emptySkillDir = join(root, 'empty-dir');

    mkdirSync(validSkillDir, { recursive: true });
    mkdirSync(emptySkillDir, { recursive: true });

    writeFileSync(join(validSkillDir, 'SKILL.md'), '# Valid Skill');

    try {
      const skills = discoverKnownSkills([root]);
      expect(skills.has('valid-skill')).toBeTrue();
      expect(skills.has('empty-dir')).toBeFalse();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('finds session jsonl files and respects project filter', () => {
    const root = join(tmpdir(), `test-sessions-${Date.now()}`);
    const projADir = join(root, 'session-project-alpha');
    const projBDir = join(root, 'session-project-beta');

    mkdirSync(projADir, { recursive: true });
    mkdirSync(projBDir, { recursive: true });

    writeFileSync(join(projADir, 'session1.jsonl'), '{"msg": "1"}\n');
    writeFileSync(join(projADir, 'other.txt'), 'ignored');
    writeFileSync(join(projBDir, 'session2.jsonl'), '{"msg": "2"}\n');

    try {
      const allFiles = findSessionJsonlFiles(root);
      expect(allFiles.length).toBe(2);

      const alphaOnly = findSessionJsonlFiles(root, 'alpha');
      expect(alphaOnly.length).toBe(1);
      expect(alphaOnly[0]).toContain('session1.jsonl');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('computes skill frequencies across session files', async () => {
    const root = join(tmpdir(), `test-freq-${Date.now()}`);
    mkdirSync(root, { recursive: true });

    const file1 = join(root, '1.jsonl');
    const file2 = join(root, '2.jsonl');

    writeFileSync(
      file1,
      '{"text": "please use grilling skill"}\n{"text": "read skill://unslop"}\n',
    );
    writeFileSync(file2, '{"text": "also use grilling skill again"}\n');

    const known = new Set(['grilling', 'unslop']);

    try {
      const freq = await computeSkillFrequencies([file1, file2], known);
      expect(freq.get('grilling')).toBe(2);
      expect(freq.get('unslop')).toBe(1);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('formats frequency table cleanly', () => {
    const emptyOutput = formatFrequencyTable([], 0);
    expect(emptyOutput).toBe('No skill invocations discovered in matching sessions.');

    const populatedOutput = formatFrequencyTable(
      [
        { skill: 'grilling', count: 42 },
        { skill: 'unslop', count: 18 },
      ],
      10,
    );
    expect(populatedOutput).toContain('Skill Invocations across 10 Harvested Sessions');
    expect(populatedOutput).toContain('grilling');
    expect(populatedOutput).toContain('42');
    expect(populatedOutput).toContain('unslop');
    expect(populatedOutput).toContain('18');
  });
});

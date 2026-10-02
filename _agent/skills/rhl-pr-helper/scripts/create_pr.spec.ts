import { describe, expect, it } from 'bun:test';
import { DEFAULT_REVIEWERS, INFRA_REVIEWER } from './create_pr.ts';
import { validateCommitMessage } from './lint_pr.ts';

describe('create_pr', () => {
  it('default reviewers includes baseline team members', () => {
    expect(DEFAULT_REVIEWERS).toContain('pm-pp');
    expect(DEFAULT_REVIEWERS).toContain('simon57b');
    expect(DEFAULT_REVIEWERS).toContain('singhmadhurima123');
    expect(DEFAULT_REVIEWERS).toContain('jofay-empo');
    expect(INFRA_REVIEWER).toBe('edahlseng');
  });

  it('validates a formatted PR message before calling gh CLI', () => {
    const validMessage = [
      'fix(qa): fix month navigation in weight graph E2E test (RHL-4465)',
      '',
      'Detailed Description',
      '--------------------',
      '',
      '### Problem',
      'Date math caused month navigation shifts.',
      '',
      '### Solution',
      'Anchor in LA noon.',
      '',
      'Relevant Linear Tickets',
      '-----------------------',
      '',
      'This change contributes to RHL-4465.',
      '',
      'Reviews and Merging',
      '-------------------',
    ].join('\n');

    const res = validateCommitMessage(validMessage);
    expect(res.valid).toBe(true);
    expect(res.errors).toHaveLength(0);
  });

  it('rejects an invalid PR message when title exceeds 72 characters', () => {
    const invalidMessage = [
      'fix(qa): fix month navigation in weight graph E2E test and screening calendar shift (RHL-4465)',
      '',
      'Detailed Description',
      '--------------------',
      '',
      'Relevant Linear Tickets',
      '-----------------------',
      '',
      'This change contributes to RHL-4465.',
      '',
      'Reviews and Merging',
      '-------------------',
    ].join('\n');

    const res = validateCommitMessage(invalidMessage);
    expect(res.valid).toBe(false);
    expect(res.errors.some((e) => e.includes('72 characters'))).toBe(true);
  });
});

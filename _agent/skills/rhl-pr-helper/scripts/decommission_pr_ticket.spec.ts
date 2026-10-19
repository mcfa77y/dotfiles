import { describe, expect, it } from 'bun:test';
import { buildDecommissionComment, createDecommissionPlan } from './decommission_pr_ticket';

describe('decommission_pr_ticket', () => {
  it('formats comment with replacement PR URLs', () => {
    const comment = buildDecommissionComment({
      ticket: 'RHL-4323',
      replacementPrs: ['3115', 'https://github.com/EmpoHealth/core/pull/3121'],
    });

    expect(comment).toContain('this work is done across prs');
    expect(comment).toContain('https://github.com/EmpoHealth/core/pull/3115');
    expect(comment).toContain('https://github.com/EmpoHealth/core/pull/3121');
  });

  it('uses custom message when provided', () => {
    const comment = buildDecommissionComment({
      ticket: 'RHL-4323',
      commentMessage: 'Custom reason for cancellation',
    });

    expect(comment).toBe('Custom reason for cancellation');
  });

  it('creates complete decommission plan with uppercase ticket and defaults', () => {
    const plan = createDecommissionPlan({
      ticket: 'rhl-4323',
      prNumber: 2724,
      branch: 'rhl-4323-optimize',
      replacementPrs: ['3115'],
    });

    expect(plan.ticket).toBe('RHL-4323');
    expect(plan.targetState).toBe('Canceled');
    expect(plan.prToClose).toBe(2724);
    expect(plan.branchToDelete).toBe('rhl-4323-optimize');
    expect(plan.deleteRemote).toBe(true);
  });
});

import { describe, expect, it } from 'bun:test';
import { buildRebasePlan, getCommitsToReplay } from './rebase_stack_onto';

describe('rebase_stack_onto', () => {
  it('parses commits to replay correctly from git log', async () => {
    // Current repo has commits between HEAD~2 and HEAD
    const commits = await getCommitsToReplay('HEAD~2', 'HEAD', process.cwd());
    expect(commits.length).toBe(2);
  });

  it('builds a valid rebase plan with custom oldBase and newBase', async () => {
    const plan = await buildRebasePlan(
      {
        branch: 'main',
        oldBase: 'HEAD~1',
        newBase: 'main',
      },
      process.cwd(),
    );

    expect(plan.currentBranch).toBe('main');
    expect(plan.newBase).toBe('main');
    expect(plan.oldBase).toBe('HEAD~1');
    expect(plan.commitsToReplay.length).toBe(1);
  });
});

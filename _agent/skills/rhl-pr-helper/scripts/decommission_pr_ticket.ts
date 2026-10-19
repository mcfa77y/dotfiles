#!/usr/bin/env bun
/**
 * decommission_pr_ticket.ts
 *
 * Automates decommissioning of obsolete, superseded, or duplicate PRs:
 * - Posts explanatory comment to Linear ticket linking target PRs
 * - Sets Linear ticket status to "Canceled" or "Done"
 * - Closes GitHub PR (if still open)
 * - Prunes local worktree and deletes local & remote tracking branch
 */

import { $ } from 'bun';
import { Command } from 'commander';

export interface DecommissionOptions {
  ticket: string;
  replacementPrs?: string[];
  commentMessage?: string;
  ticketState?: 'Canceled' | 'Done' | 'Duplicate';
  prNumber?: number;
  branch?: string;
  worktreePath?: string;
  deleteRemoteBranch?: boolean;
  dryRun?: boolean;
}

export interface DecommissionPlan {
  ticket: string;
  comment: string;
  targetState: string;
  prToClose?: number;
  branchToDelete?: string;
  worktreeToRemove?: string;
  deleteRemote: boolean;
}

export function buildDecommissionComment(options: DecommissionOptions): string {
  if (options.commentMessage) {
    return options.commentMessage;
  }

  if (options.replacementPrs && options.replacementPrs.length > 0) {
    const list = options.replacementPrs
      .map((pr) => {
        const url = pr.startsWith('http')
          ? pr
          : `https://github.com/EmpoHealth/core/pull/${pr.replace('#', '')}`;
        return `- ${url}`;
      })
      .join('\n');
    return `this work is done across prs\n${list}`;
  }

  return 'Closing and decommissioning obsolete branch and PR.';
}

export function createDecommissionPlan(options: DecommissionOptions): DecommissionPlan {
  const comment = buildDecommissionComment(options);
  const targetState = options.ticketState || 'Canceled';

  return {
    ticket: options.ticket.toUpperCase(),
    comment,
    targetState,
    prToClose: options.prNumber,
    branchToDelete: options.branch,
    worktreeToRemove: options.worktreePath,
    deleteRemote: options.deleteRemoteBranch ?? true,
  };
}

export async function executeDecommission(
  options: DecommissionOptions,
): Promise<{ success: boolean; message: string }> {
  const plan = createDecommissionPlan(options);

  console.log(`Decommission Plan:`);
  console.log(`  Linear Ticket:       ${plan.ticket}`);
  console.log(`  Linear State:        ${plan.targetState}`);
  console.log(
    `  Comment:\n${plan.comment
      .split('\n')
      .map((l) => `    ${l}`)
      .join('\n')}`,
  );
  if (plan.prToClose) console.log(`  GitHub PR to close:  #${plan.prToClose}`);
  if (plan.branchToDelete) console.log(`  Branch to delete:    ${plan.branchToDelete}`);
  if (plan.worktreeToRemove) console.log(`  Worktree to remove:  ${plan.worktreeToRemove}`);
  console.log(`  Delete Remote:       ${plan.deleteRemote}`);

  if (options.dryRun) {
    return {
      success: true,
      message: '[Dry Run] Decommission plan verified successfully.',
    };
  }

  try {
    // 1. Post Linear comment
    console.log(`Posting comment to Linear issue ${plan.ticket}...`);
    await $`linear issue comment ${plan.ticket} --body ${plan.comment}`.quiet();

    // 2. Update Linear state
    console.log(`Updating ${plan.ticket} status to ${plan.targetState}...`);
    await $`linear issue update ${plan.ticket} --state ${plan.targetState}`.quiet();

    // 3. Close GitHub PR if specified
    if (plan.prToClose) {
      console.log(`Closing GitHub PR #${plan.prToClose}...`);
      await $`gh pr close ${plan.prToClose} --comment "Closing in favor of replacement PRs documented in Linear ${plan.ticket}"`.quiet();
    }

    // 4. Remove worktree if specified
    if (plan.worktreeToRemove || plan.branchToDelete) {
      const target = plan.worktreeToRemove || plan.branchToDelete!;
      console.log(`Removing worktree ${target}...`);
      await $`wt remove ${target} -f -D --foreground`.quiet();
    }

    // 5. Delete remote branch if specified
    if (plan.branchToDelete && plan.deleteRemote) {
      console.log(`Deleting remote branch origin/${plan.branchToDelete}...`);
      await $`git push origin --delete ${plan.branchToDelete}`.quiet();
    }

    return {
      success: true,
      message: `Successfully decommissioned ${plan.ticket}.`,
    };
  } catch (err) {
    return {
      success: false,
      message: `Decommission failed: ${(err as Error).message}`,
    };
  }
}

if (import.meta.main) {
  const program = new Command()
    .name('decommission_pr_ticket')
    .description('Decommission obsolete PRs and Linear tickets with cross-references and cleanup')
    .requiredOption('-t, --ticket <ticket>', 'Linear ticket identifier (e.g. RHL-4323)')
    .option('-r, --replacement-prs <prs...>', 'Replacement PR numbers or URLs')
    .option('-m, --message <message>', 'Custom comment message for Linear ticket')
    .option(
      '-s, --state <state>',
      'Target Linear issue status (Canceled, Done, Duplicate)',
      'Canceled',
    )
    .option('--pr <number>', 'GitHub PR number to close', (v) => parseInt(v, 10))
    .option('-b, --branch <branch>', 'Branch name to delete locally and remotely')
    .option('-w, --worktree <path>', 'Worktree directory path to remove')
    .option('--no-remote', 'Do not delete remote branch on origin')
    .option('--dry-run', 'Preview decommission actions without executing', false)
    .action(async (opts) => {
      const result = await executeDecommission({
        ticket: opts.ticket,
        replacementPrs: opts.replacementPrs,
        commentMessage: opts.message,
        ticketState: opts.state,
        prNumber: opts.pr,
        branch: opts.branch,
        worktreePath: opts.worktree,
        deleteRemoteBranch: opts.remote,
        dryRun: opts.dryRun,
      });

      if (!result.success) {
        console.error(`Error: ${result.message}`);
        process.exit(1);
      }
      console.log(result.message);
    });

  await program.parseAsync(process.argv);
}

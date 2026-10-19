#!/usr/bin/env bun
/**
 * rebase_stack_onto.ts
 *
 * Automates re-anchoring stacked PR branches onto upstream target (e.g. main)
 * when intermediate ancestor commits (e.g. old merge commits, superseded tool bumps)
 * cause merge conflicts during standard rebase.
 */

import { $ } from 'bun';
import { Command } from 'commander';

export interface RebaseOntoOptions {
  newBase?: string;
  oldBase?: string;
  branch?: string;
  targetDir?: string;
  abortOnConflict?: boolean;
  dryRun?: boolean;
  push?: boolean;
}

export interface RebasePlan {
  currentBranch: string;
  newBase: string;
  oldBase: string;
  commitsToReplay: string[];
}

export async function detectBranch(cwd: string): Promise<string> {
  const branch = (await $`git branch --show-current`.cwd(cwd).quiet().text()).trim();
  if (!branch) {
    throw new Error('Could not detect current git branch (detached HEAD or not a git repository)');
  }
  return branch;
}

export async function findMergeBase(branch: string, base: string, cwd: string): Promise<string> {
  const result = (await $`git merge-base ${branch} ${base}`.cwd(cwd).quiet().text()).trim();
  if (!result) {
    throw new Error(`Could not find merge base between ${branch} and ${base}`);
  }
  return result;
}

export async function getCommitsToReplay(
  oldBase: string,
  branch: string,
  cwd: string,
): Promise<string[]> {
  try {
    const raw = (await $`git log --oneline ${oldBase}..${branch}`.cwd(cwd).quiet().text()).trim();
    if (!raw) return [];
    return raw
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

export async function buildRebasePlan(
  options: RebaseOntoOptions,
  cwd: string,
): Promise<RebasePlan> {
  const currentBranch = options.branch || (await detectBranch(cwd));
  const newBase = options.newBase || 'main';

  let oldBase = options.oldBase;
  if (!oldBase) {
    oldBase = await findMergeBase(`origin/${currentBranch}`, newBase, cwd).catch(async () => {
      return await findMergeBase(currentBranch, newBase, cwd);
    });
  }

  const commitsToReplay = await getCommitsToReplay(oldBase, currentBranch, cwd);

  return {
    currentBranch,
    newBase,
    oldBase,
    commitsToReplay,
  };
}

export async function executeRebaseOnto(
  options: RebaseOntoOptions,
): Promise<{ success: boolean; message: string }> {
  const cwd = options.targetDir || process.cwd();

  // Check if rebase is currently in progress
  const isRebasing = (await $`git status`.cwd(cwd).quiet().text()).includes('rebase in progress');
  if (isRebasing) {
    if (options.abortOnConflict) {
      if (!options.dryRun) {
        await $`git rebase --abort`.cwd(cwd).quiet();
      }
      console.log('Aborted prior in-progress rebase.');
    } else {
      return {
        success: false,
        message:
          'A git rebase is already in progress. Pass --abort-on-conflict or resolve manually.',
      };
    }
  }

  const plan = await buildRebasePlan(options, cwd);

  console.log(`Rebase Plan:`);
  console.log(`  Branch:        ${plan.currentBranch}`);
  console.log(`  Target Base:   ${plan.newBase}`);
  console.log(`  Old Base (Cut):${plan.oldBase}`);
  console.log(`  Commits (${plan.commitsToReplay.length}):`);
  for (const c of plan.commitsToReplay) {
    console.log(`    - ${c}`);
  }

  if (plan.commitsToReplay.length === 0) {
    return {
      success: true,
      message: `Branch ${plan.currentBranch} is already re-anchored on ${plan.newBase}. Nothing to replay.`,
    };
  }

  if (options.dryRun) {
    console.log(`\n[Dry Run] Would execute:`);
    console.log(`  git rebase --onto ${plan.newBase} ${plan.oldBase} ${plan.currentBranch}`);
    if (options.push) {
      console.log(`  git push --force-with-lease origin ${plan.currentBranch}`);
    }
    return {
      success: true,
      message: '[Dry Run] Completed rebase planning verification.',
    };
  }

  try {
    await $`git rebase --onto ${plan.newBase} ${plan.oldBase} ${plan.currentBranch}`.cwd(cwd);
    console.log(`Successfully rebased ${plan.currentBranch} onto ${plan.newBase}.`);

    if (options.push) {
      console.log(`Pushing ${plan.currentBranch} to origin with --force-with-lease...`);
      await $`git push --force-with-lease origin ${plan.currentBranch}`.cwd(cwd);
      console.log(`Pushed ${plan.currentBranch} with lease.`);
    }

    return {
      success: true,
      message: `Rebase onto ${plan.newBase} succeeded.`,
    };
  } catch (err) {
    return {
      success: false,
      message: `Rebase encountered conflicts or errors: ${(err as Error).message}`,
    };
  }
}

if (import.meta.main) {
  const program = new Command()
    .name('rebase_stack_onto')
    .description(
      'Rebase stacked branches cleanly by cutting away old divergent bases (git rebase --onto)',
    )
    .option('-b, --branch <branch>', 'Branch to rebase (defaults to current branch)')
    .option('-n, --new-base <base>', 'New base commit or branch to rebase onto', 'main')
    .option('-o, --old-base <base>', 'Old base commit from which to replay commits')
    .option('-d, --dir <dir>', 'Repository directory path')
    .option('--abort-on-conflict', 'Abort existing rebase in progress before starting', false)
    .option('-p, --push', 'Force-push with lease after successful rebase', false)
    .option('--dry-run', 'Preview rebase operations without executing', false)
    .action(async (opts) => {
      const result = await executeRebaseOnto({
        branch: opts.branch,
        newBase: opts.newBase,
        oldBase: opts.oldBase,
        targetDir: opts.dir,
        abortOnConflict: opts.abortOnConflict,
        push: opts.push,
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

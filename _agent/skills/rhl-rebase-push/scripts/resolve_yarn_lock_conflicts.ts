#!/usr/bin/env bun
/**
 * resolve_yarn_lock_conflicts.ts
 *
 * Automates resolution of yarn.lock merge/rebase conflicts across root and
 * sub-workspace Yarn projects in a monorepo.
 */

import { $ } from 'bun';
import { Command } from 'commander';

export interface ResolveOptions {
  autoContinue?: boolean;
  stashWip?: boolean;
  dryRun?: boolean;
  targetDir?: string;
}

export async function findConflictedLockfiles(targetDir: string): Promise<string[]> {
  try {
    const raw = (
      await $`git diff --name-only --diff-filter=U`.cwd(targetDir).quiet().text()
    ).trim();
    if (!raw) return [];
    return raw
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.endsWith('yarn.lock'));
  } catch {
    return [];
  }
}

export async function resolveLockfiles(opts: ResolveOptions): Promise<void> {
  const cwd = opts.targetDir || process.cwd();

  console.log(`\n=== Yarn Lockfile Conflict Resolver ===`);
  console.log(`Target directory: ${cwd}`);

  const conflicted = await findConflictedLockfiles(cwd);
  if (conflicted.length === 0) {
    console.log('✓ No unmerged yarn.lock files detected.');
    return;
  }

  console.log(`Found ${conflicted.length} conflicted yarn.lock file(s):`);
  for (const f of conflicted) {
    console.log(`  • ${f}`);
  }

  if (opts.dryRun) {
    console.log('\n[Dry-run] Would execute:');
    console.log('  1. yarn install (resolves conflict markers)');
    console.log('  2. git add <lockfiles>');
    if (opts.autoContinue) {
      console.log('  3. git rebase --continue');
    }
    return;
  }

  // Check if we need to stash WIP modifications
  let stashed = false;
  if (opts.stashWip) {
    const status = (await $`git status --porcelain`.cwd(cwd).quiet().text()).trim();
    const hasUnstagedNonLock = status
      .split('\n')
      .some((l) => !l.includes('yarn.lock') && (l.startsWith(' M') || l.startsWith('??')));

    if (hasUnstagedNonLock) {
      console.log('\nShelving unrelated working directory edits...');
      try {
        await $`git stash push -u -m "resolve-yarn-lock-conflicts-autostash"`.cwd(cwd);
        stashed = true;
      } catch (err: unknown) {
        console.warn('Warning: Could not stash working directory edits:', err);
      }
    }
  }

  try {
    console.log('\nRunning yarn install to resolve lockfile conflict markers...');
    await $`yarn install`.cwd(cwd);

    console.log('Staging resolved yarn.lock files...');
    for (const f of conflicted) {
      await $`git add ${f}`.cwd(cwd);
    }
    console.log('✓ Successfully staged resolved yarn.lock files.');

    if (opts.autoContinue) {
      console.log('\nAdvancing git rebase (--continue)...');
      await $`git rebase --continue`.cwd(cwd);
      console.log('✓ Git rebase continued successfully.');
    }
  } finally {
    if (stashed) {
      console.log('\nRestoring shelved working directory edits...');
      try {
        await $`git stash pop`.cwd(cwd);
      } catch (err: unknown) {
        console.warn('Warning: Could not pop git stash automatically:', err);
      }
    }
  }
}

export async function runCli(): Promise<void> {
  const program = new Command()
    .name('resolve_yarn_lock_conflicts')
    .description('Automate resolution of yarn.lock merge and rebase conflicts.')
    .argument('[workspace_dir]', 'Path to git workspace directory', process.cwd())
    .option('-c, --continue', 'Automatically run git rebase --continue after staging', false)
    .option('--no-stash-wip', 'Do not automatically stash/restore unrelated unstaged modifications')
    .option('-d, --dry-run', 'Preview resolution steps without modifying repository', false)
    .addHelpText(
      'after',
      `
Examples:
  $ bun run resolve_yarn_lock_conflicts.ts
  $ bun run resolve_yarn_lock_conflicts.ts --continue
  $ bun run resolve_yarn_lock_conflicts.ts --dry-run
`,
    );

  program.parse();

  const [workspaceDir] = program.args;
  const opts = program.opts<{ continue?: boolean; stashWip?: boolean; dryRun?: boolean }>();

  try {
    await resolveLockfiles({
      targetDir: workspaceDir || process.cwd(),
      autoContinue: opts.continue,
      stashWip: opts.stashWip,
      dryRun: opts.dryRun,
    });
  } catch (err: unknown) {
    console.error('Resolution failed:', err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

if (import.meta.main) {
  runCli().catch((err: unknown) => {
    console.error('Fatal error:', err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
}

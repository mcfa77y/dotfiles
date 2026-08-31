import { $ } from 'bun'

export async function isGitRepo(cwd: string): Promise<boolean> {
  try {
    const result = await $`git -C ${cwd} rev-parse --is-inside-work-tree`.quiet().nothrow()
    return result.exitCode === 0 && result.text().trim() === 'true'
  }
  catch {
    return false
  }
}

export async function getGitBranch(cwd: string): Promise<string | undefined> {
  try {
    if (!await isGitRepo(cwd)) {
      return undefined
    }

    const branchResult = await $`git -C ${cwd} rev-parse --abbrev-ref HEAD`.quiet().nothrow()
    if (branchResult.exitCode !== 0) {
      return undefined
    }

    let branch = branchResult.text().trim()
    if (branch === 'HEAD') {
      const shortResult = await $`git -C ${cwd} rev-parse --short HEAD`.quiet().nothrow()
      branch = shortResult.exitCode === 0 ? shortResult.text().trim() : 'detached'
    }

    return branch.length > 0 ? branch : undefined
  }
  catch {
    return undefined
  }
}

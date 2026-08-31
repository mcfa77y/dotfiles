import type { Command } from 'commander'
import type { WorkspaceNameOptions } from '../types'
import path from 'node:path'
import process from 'node:process'
import { cmux } from '../client'

export async function setWorkspaceName(options: WorkspaceNameOptions = {}): Promise<void> {
  const targetDir = path.resolve(options.targetDir || process.cwd())
  const dirName = path.basename(targetDir)
  const trimmedName = dirName.slice(0, 32)

  const workspace = options.workspace || await cmux.getCurrentWorkspace()
  if (!workspace) {
    throw new Error('Could not resolve current cmux workspace.')
  }

  await cmux.renameWorkspace(workspace, trimmedName)
}

export function registerWorkspaceNameCommand(program: Command): void {
  program
    .command('workspace-name [path]')
    .alias('set-workspace-name')
    .alias('cwrn')
    .alias('wsn')
    .description('Sets workspace name to directory name (defaults to $PWD), trimmed to max 32 characters')
    .option('-w, --workspace <id>', 'Target workspace ID/ref')
    .action(async (targetPath?: string, opts?: { workspace?: string }) => {
      try {
        await setWorkspaceName({
          targetDir: targetPath,
          workspace: opts?.workspace,
        })
      }
      catch (error) {
        console.error(`Error: ${error instanceof Error ? error.message : String(error)}`)
        process.exit(1)
      }
    })
}

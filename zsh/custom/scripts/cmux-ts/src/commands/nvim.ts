import type { Command } from 'commander'
import type { NvimRenameOptions } from '../types'
import path from 'node:path'
import process from 'node:process'
import { cmux } from '../client'

export async function nvimWithCmuxRename(options: NvimRenameOptions = {}): Promise<number> {
  const cwd = path.resolve(options.cwd || process.cwd())
  const surfaceId = options.surface || process.env.CMUX_SURFACE_ID || await cmux.getCurrentSurfaceId()

  let originalTitle: string | undefined

  if (surfaceId) {
    try {
      originalTitle = await cmux.getCurrentTitle()
      const folderName = path.basename(cwd)
      await cmux.renameTab({
        surface: surfaceId,
        title: `neovim ${folderName}`,
      })
    }
    catch {
      // Non-fatal if rename fails before launching
    }
  }

  let exitCode = 0
  try {
    const args = options.args || []
    const proc = Bun.spawn(['nvim', ...args], {
      cwd,
      stdio: ['inherit', 'inherit', 'inherit'],
    })
    exitCode = await proc.exited
  }
  finally {
    if (surfaceId) {
      try {
        if (originalTitle) {
          await cmux.renameTab({
            surface: surfaceId,
            title: originalTitle,
          })
        }
        else {
          await cmux.tabActionClearName({
            surface: surfaceId,
          })
        }
      }
      catch {
        // Non-fatal if restore fails
      }
    }
  }

  return exitCode
}

export function registerNvimCommand(program: Command): void {
  program
    .command('nvim [args...]')
    .alias('nv')
    .alias('nvim-rename')
    .description('Run Neovim with automatic cmux tab rename to "neovim <dir>" and restore on exit')
    .allowUnknownOption(true)
    .action(async (_args: string[] | undefined, command: Command) => {
      try {
        const rawArgs = command.args
        const exitCode = await nvimWithCmuxRename({
          args: rawArgs,
        })
        process.exit(exitCode)
      }
      catch (error) {
        console.error(`Error: ${error instanceof Error ? error.message : String(error)}`)
        process.exit(1)
      }
    })
}

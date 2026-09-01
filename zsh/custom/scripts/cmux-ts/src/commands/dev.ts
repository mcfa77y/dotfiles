import type { Command } from 'commander'
import type { LaunchDevOptions } from '../types'
import { existsSync, statSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { cmux } from '../client'
import { getGitBranch } from '../git'

export interface LaunchDevResult {
  workspaceRef: string
  leftSurface: string
  rightSurface?: string
  rightTerminalSurface?: string
}

export async function launchDevWorkspace(options: LaunchDevOptions = {}): Promise<LaunchDevResult> {
  const cwd = path.resolve(options.cwd || process.cwd())
  if (!existsSync(cwd) || !statSync(cwd).isDirectory()) {
    throw new Error(`Directory '${cwd}' does not exist.`)
  }

  const folderName = path.basename(cwd)
  const branch = await getGitBranch(cwd)

  let wsTitle: string
  let ompTitle: string
  let nvimTitle: string
  let terminalTitle: string

  if (branch) {
    wsTitle = branch
    ompTitle = `omp ${branch}`
    nvimTitle = `nvim ${branch}`
    terminalTitle = `terminal ${branch}`
  }
  else {
    wsTitle = folderName
    ompTitle = 'omp'
    nvimTitle = 'nvim'
    terminalTitle = `terminal ${folderName}`
  }

  const focus = options.focus ?? true
  const ompCmd = options.ompCommand || 'omp-empo'
  const nvimCmd = options.nvimCommand || 'nvim .'
  const terminalCmd = options.terminalCommand

  const res = await cmux.createWorkspace({
    name: wsTitle,
    cwd,
    focus,
  })

  const wsRef = res.workspace_ref || res.workspace_id
  const leftSurface = res.surface_ref || res.surface_id

  if (!wsRef || !leftSurface) {
    throw new Error('Failed to parse workspace/surface references from cmux output.')
  }

  // Setup left pane: rename tab & run omp command
  try {
    await cmux.renameTab({
      workspace: wsRef,
      surface: leftSurface,
      title: ompTitle,
    })
    await cmux.send({
      workspace: wsRef,
      surface: leftSurface,
      text: ompCmd,
    })
  }
  catch {
    // Non-fatal if rename/send fails
  }

  // Create right pane split (Tab 1: nvim, Tab 2: terminal)
  // let rightNvimSurface: string | undefined
  // let rightTerminalSurface: string | undefined
  //
  // try {
  //   const paneRes = await cmux.newPane({
  //     workspace: wsRef,
  //     type: 'terminal',
  //     direction: 'right',
  //     focus: false,
  //   })
  //   rightNvimSurface = paneRes.surface_ref || paneRes.surface_id
  //   const rightPane = paneRes.pane_ref || paneRes.pane_id
  //
  //   // Setup Tab 1 in right pane: nvim
  //   if (rightNvimSurface) {
  //     await cmux.renameTab({
  //       workspace: wsRef,
  //       surface: rightNvimSurface,
  //       title: nvimTitle,
  //     })
  //     await cmux.send({
  //       workspace: wsRef,
  //       surface: rightNvimSurface,
  //       text: nvimCmd,
  //     })
  //   }
  //
  //   // Setup Tab 2 in right pane: terminal (focused to be the visible tab in the right pane)
  //   if (rightPane) {
  //     const tab2Res = await cmux.createSurface({
  //       cwd,
  //       focus: true,
  //       workspace: wsRef,
  //       pane: rightPane,
  //     })
  //     rightTerminalSurface = tab2Res.surface_ref || tab2Res.surface_id
  //
  //     if (rightTerminalSurface) {
  //       await cmux.renameTab({
  //         workspace: wsRef,
  //         surface: rightTerminalSurface,
  //         title: terminalTitle,
  //       })
  //       if (terminalCmd) {
  //         await cmux.send({
  //           workspace: wsRef,
  //           surface: rightTerminalSurface,
  //           text: terminalCmd,
  //         })
  //       }
  //     }
  //   }
  // }
  // catch {
  //   // Non-fatal if right pane creation fails
  // }
  //
  // Ensure overall workspace focus is on the left pane (omp)
  try {
    const paneList = await cmux.listPanes({ workspace: wsRef })
    const leftPane = paneList.panes?.[0]?.ref
    if (leftPane) {
      await cmux.focusPane({ pane: leftPane, workspace: wsRef })
    }
  }
  catch {
    // Non-fatal fallback
  }

  return {
    workspaceRef: wsRef,
    leftSurface,
    // rightSurface: rightNvimSurface,
    // rightTerminalSurface,
  }
}

export function registerDevCommand(program: Command): void {
  program
    .command('dev [path]')
    .alias('cdev')
    .alias('workspace-dev')
    .description('Workspace development launcher with omp (left) and nvim + terminal tabs (right)')
    .option('-d, --cwd <path>', 'Working directory path')
    .option('--dir <path>', 'Working directory path (alias for --cwd)')
    .option('-f, --focus [boolean]', 'Focus the new workspace (default: true)')
    .option('--no-focus', 'Do not focus the new workspace')
    .option('--omp <command>', 'Command to run in left pane (default: omp-empo)', 'omp-empo')
    .option('--nvim <command>', 'Command to run in right pane tab 1 (default: nvim .)', 'nvim .')
    .option('--terminal <command>', 'Optional command to run in right pane tab 2 (terminal)')
    .action(async (targetPath?: string, opts?: {
      dir?: string
      cwd?: string
      focus?: boolean | string
      omp?: string
      nvim?: string
      terminal?: string
    }) => {
      try {
        const resolvedCwd = targetPath || opts?.dir || opts?.cwd || process.cwd()
        await launchDevWorkspace({
          cwd: resolvedCwd,
          focus: opts?.focus === undefined ? undefined : String(opts.focus).toLowerCase() !== 'false',
          ompCommand: opts?.omp,
          nvimCommand: opts?.nvim,
          terminalCommand: opts?.terminal,
        })
      }
      catch (error) {
        console.error(`Error: ${error instanceof Error ? error.message : String(error)}`)
        process.exit(1)
      }
    })
}

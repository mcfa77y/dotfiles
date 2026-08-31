import type { Command } from 'commander'
import type { CreateTabOptions } from '../types'
import path from 'node:path'
import process from 'node:process'
import { cmux } from '../client'

export async function createTab(options: CreateTabOptions): Promise<string> {
  if (!options.name || !options.command) {
    throw new Error('Both --name and --command are required.')
  }

  const cwd = path.resolve(options.cwd || process.cwd())
  const focus = Boolean(options.focus)

  const res = await cmux.createSurface({
    cwd,
    focus,
    workspace: options.workspace,
  })

  const surfaceRef = res.surface_ref || res.surface_id
  if (!surfaceRef) {
    throw new Error('Failed to parse surface reference from cmux output.')
  }

  await cmux.renameTab({
    surface: surfaceRef,
    workspace: options.workspace,
    title: options.name,
  })

  await cmux.send({
    surface: surfaceRef,
    workspace: options.workspace,
    text: options.command,
  })

  return surfaceRef
}

export function registerTabCommand(program: Command): void {
  program
    .command('tab')
    .alias('ct')
    .alias('new-tab')
    .description('Create a new surface/tab, rename it, and execute a command in it')
    .requiredOption('-n, --name <tab_name>', 'Name / title of the new tab')
    .requiredOption('-c, --command <command_to_run>', 'Command to execute in the new tab')
    .option('-f, --focus [boolean]', 'Switch focus to the new tab (default: false)')
    .option('--cwd <path>', 'Working directory for the tab (default: current directory)')
    .option('-w, --workspace <id>', 'Target workspace ID/ref')
    .action(async (opts: {
      name: string
      command: string
      focus?: boolean | string
      cwd?: string
      workspace?: string
    }) => {
      try {
        await createTab({
          name: opts.name,
          command: opts.command,
          focus: opts.focus === undefined ? false : (typeof opts.focus === 'boolean' ? opts.focus : String(opts.focus).toLowerCase() !== 'false'),
          cwd: opts.cwd,
          workspace: opts.workspace,
        })
      }
      catch (error) {
        console.error(`Error: ${error instanceof Error ? error.message : String(error)}`)
        process.exit(1)
      }
    })
}

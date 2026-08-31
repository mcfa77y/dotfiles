#!/usr/bin/env bun
import process from 'node:process'
import { Command } from 'commander'
import { registerCurrentTitleCommand } from './commands/current-title'
import { registerDevCommand } from './commands/dev'
import { registerNvimCommand } from './commands/nvim'
import { registerTabCommand } from './commands/tab'
import { registerWorkspaceNameCommand } from './commands/workspace-name'

export * from './client'
export * from './commands/current-title'
export * from './commands/dev'
export * from './commands/nvim'
export * from './commands/tab'
export * from './commands/workspace-name'
export * from './git'
export * from './types'

export function createProgram(): Command {
  const program = new Command()

  program
    .name('cmux-ts')
    .description('TypeScript CLI and SDK for cmux terminal automation')
    .version('0.1.0')

  registerWorkspaceNameCommand(program)
  registerTabCommand(program)
  registerCurrentTitleCommand(program)
  registerDevCommand(program)
  registerNvimCommand(program)

  return program
}

if (import.meta.main) {
  const program = createProgram()
  program.parse(process.argv)
}

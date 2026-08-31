import process from 'node:process'
import { describe, expect, test } from 'bun:test'
import { launchDevWorkspace } from '../src/commands/dev'
import { createTab } from '../src/commands/tab'
import { getGitBranch, isGitRepo } from '../src/git'
import { createProgram } from '../src/index'

describe('cmux-ts commander CLI program', () => {
  test('creates program with all required subcommands and aliases', () => {
    const program = createProgram()
    const commandNames = program.commands.map(cmd => cmd.name())
    const commandAliases = program.commands.flatMap(cmd => cmd.aliases())

    expect(commandNames).toContain('workspace-name')
    expect(commandNames).toContain('tab')
    expect(commandNames).toContain('current-title')
    expect(commandNames).toContain('dev')
    expect(commandNames).toContain('nvim')

    expect(commandAliases).toContain('cwrn')
    expect(commandAliases).toContain('ct')
    expect(commandAliases).toContain('cdev')
    expect(commandAliases).toContain('nv')
  })

  test('dev command has options for omp, nvim, and terminal', () => {
    const program = createProgram()
    const devCmd = program.commands.find(cmd => cmd.name() === 'dev')
    expect(devCmd).toBeDefined()
    const optionNames = devCmd?.options.map(opt => opt.long)
    expect(optionNames).toContain('--omp')
    expect(optionNames).toContain('--nvim')
    expect(optionNames).toContain('--terminal')
  })

  test('dev command accepts positional path with --focus true', () => {
    const program = createProgram()
    const parsed = program.parseOptions(['dev', '/some/path', '--omp', 'custom-omp', '--focus', 'true'])
    expect(parsed.operands).toEqual(['dev', '/some/path'])
  })

  test('dev command accepts positional path with --focus false', () => {
    const program = createProgram()
    const parsed = program.parseOptions(['dev', '/some/path', '--focus', 'false'])
    expect(parsed.operands).toEqual(['dev', '/some/path'])
  })
})

describe('git helpers', () => {
  test('detects git repository in dotfiles repo', async () => {
    const isGit = await isGitRepo(process.cwd())
    expect(isGit).toBe(true)

    const branch = await getGitBranch(process.cwd())
    expect(typeof branch).toBe('string')
    expect(branch?.length).toBeGreaterThan(0)
  })

  test('handles non-existent or non-git directory gracefully', async () => {
    const isGit = await isGitRepo('/tmp')
    if (!isGit) {
      const branch = await getGitBranch('/tmp')
      expect(branch).toBeUndefined()
    }
  })
})

describe('command validation', () => {
  test('createTab throws if name or command is missing', async () => {
    // @ts-expect-error testing invalid arguments
    expect(createTab({ name: '' })).rejects.toThrow('Both --name and --command are required.')
    // @ts-expect-error testing invalid arguments
    expect(createTab({ command: '' })).rejects.toThrow('Both --name and --command are required.')
  })

  test('launchDevWorkspace throws if directory does not exist', async () => {
    expect(launchDevWorkspace({ cwd: '/non-existent-path-12345' })).rejects.toThrow('Directory \'/non-existent-path-12345\' does not exist.')
  })
})

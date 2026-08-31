import type {
  CmuxCurrentWorkspaceResult,
  CmuxListPanesResult,
  CmuxNewPaneResult,
  CmuxNewSurfaceResult,
  CmuxTreeResult,
  CmuxWorkspaceCreateResult,
} from './types'
import process from 'node:process'
import { $ } from 'bun'

export class CmuxClient {
  async raw(args: string[]): Promise<string> {
    const result = await $`cmux ${args}`.quiet().nothrow()
    if (result.exitCode !== 0) {
      const err = result.stderr.toString().trim()
      throw new Error(err || `cmux command failed with exit code ${result.exitCode}`)
    }
    return result.text().trim()
  }

  async json<T>(args: string[]): Promise<T> {
    const output = await this.raw(['--json', ...args])
    try {
      return JSON.parse(output) as T
    }
    catch {
      throw new Error(`Failed to parse cmux JSON response: ${output}`)
    }
  }

  async getCurrentWorkspace(): Promise<string | undefined> {
    if (process.env.CMUX_WORKSPACE_ID) {
      return process.env.CMUX_WORKSPACE_ID
    }
    try {
      const res = await this.json<CmuxCurrentWorkspaceResult>(['current-workspace'])
      return res.workspace_ref || res.workspace_id || (res.workspace && (res.workspace.ref || res.workspace.id))
    }
    catch {
      try {
        const raw = await this.raw(['current-workspace'])
        return raw.length > 0 ? raw : undefined
      }
      catch {
        return undefined
      }
    }
  }

  async getCurrentSurfaceId(): Promise<string | undefined> {
    if (process.env.CMUX_SURFACE_ID) {
      return process.env.CMUX_SURFACE_ID
    }
    try {
      const tree = await this.getTree()
      if (tree.caller?.surface_ref) {
        return tree.caller.surface_ref as string
      }
      if (tree.active?.surface_ref) {
        return tree.active.surface_ref as string
      }
    }
    catch {
      // ignore
    }
    return undefined
  }

  async getCurrentTitle(): Promise<string | undefined> {
    try {
      const tree = await this.getTree()
      const callerSurfaceRef = tree.caller?.surface_ref || tree.active?.surface_ref

      if (tree.windows) {
        for (const win of tree.windows) {
          for (const ws of win.workspaces || []) {
            for (const pane of ws.panes || []) {
              for (const surface of pane.surfaces || []) {
                if (surface.here || (callerSurfaceRef && surface.ref === callerSurfaceRef)) {
                  return surface.title
                }
              }
            }
          }
        }
      }
    }
    catch {
      // fallback to text parse
    }

    try {
      const treeText = await this.raw(['tree'])
      const match = treeText.split('\n').find(line => line.includes('◀ here'))
      if (match) {
        const titleMatch = match.match(/"([^"]+)"/)
        if (titleMatch && titleMatch[1]) {
          return titleMatch[1]
        }
      }
    }
    catch {
      // ignore
    }

    return undefined
  }

  async renameWorkspace(workspace: string, title: string): Promise<void> {
    await this.raw(['workspace', 'rename', workspace, '--title', title])
  }

  async createSurface(options: { cwd?: string, focus?: boolean, workspace?: string, pane?: string }): Promise<CmuxNewSurfaceResult> {
    const args = ['new-surface', '--working-directory', options.cwd || process.cwd(), '--focus', options.focus ? 'true' : 'false']
    if (options.workspace) {
      args.push('--workspace', options.workspace)
    }
    if (options.pane) {
      args.push('--pane', options.pane)
    }
    return await this.json<CmuxNewSurfaceResult>(args)
  }

  async focusPane(options: { pane: string, workspace?: string }): Promise<void> {
    const args = ['focus-pane', '--pane', options.pane]
    if (options.workspace) {
      args.push('--workspace', options.workspace)
    }
    await this.raw(args)
  }

  async listPanes(options: { workspace?: string } = {}): Promise<CmuxListPanesResult> {
    const args = ['list-panes']
    if (options.workspace) {
      args.push('--workspace', options.workspace)
    }
    return await this.json<CmuxListPanesResult>(args)
  }

  async renameTab(options: { surface?: string, workspace?: string, title: string }): Promise<void> {
    const args = ['rename-tab']
    if (options.workspace) {
      args.push('--workspace', options.workspace)
    }
    if (options.surface) {
      args.push('--surface', options.surface)
    }
    args.push(options.title)
    await this.raw(args)
  }

  async tabActionClearName(options: { surface?: string, workspace?: string }): Promise<void> {
    const args = ['tab-action', '--action', 'clear-name']
    if (options.workspace) {
      args.push('--workspace', options.workspace)
    }
    if (options.surface) {
      args.push('--surface', options.surface)
    }
    await this.raw(args)
  }

  async send(options: { surface?: string, workspace?: string, text: string }): Promise<void> {
    const args = ['send']
    if (options.workspace) {
      args.push('--workspace', options.workspace)
    }
    if (options.surface) {
      args.push('--surface', options.surface)
    }
    const commandText = options.text.endsWith('\n') ? options.text : `${options.text}\n`
    args.push(commandText)
    await this.raw(args)
  }

  async createWorkspace(options: { name: string, cwd: string, focus?: boolean }): Promise<CmuxWorkspaceCreateResult> {
    const args = [
      'workspace',
      'create',
      '--name',
      options.name,
      '--cwd',
      options.cwd,
      '--focus',
      options.focus ? 'true' : 'false',
    ]
    return await this.json<CmuxWorkspaceCreateResult>(args)
  }

  async newPane(options: { workspace: string, type?: string, direction?: string, focus?: boolean }): Promise<CmuxNewPaneResult> {
    const args = [
      'new-pane',
      '--workspace',
      options.workspace,
      '--type',
      options.type || 'terminal',
      '--direction',
      options.direction || 'right',
      '--focus',
      options.focus ? 'true' : 'false',
    ]
    return await this.json<CmuxNewPaneResult>(args)
  }

  async getTree(): Promise<CmuxTreeResult> {
    return await this.json<CmuxTreeResult>(['tree'])
  }
}

export const cmux = new CmuxClient()

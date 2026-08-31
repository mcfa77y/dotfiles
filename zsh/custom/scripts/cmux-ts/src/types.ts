export interface WorkspaceNameOptions {
  targetDir?: string
  workspace?: string
}

export interface CreateTabOptions {
  name: string
  command: string
  focus?: boolean
  cwd?: string
  workspace?: string
}

export interface LaunchDevOptions {
  cwd?: string
  focus?: boolean
  ompCommand?: string
  nvimCommand?: string
  terminalCommand?: string
}
export interface NvimRenameOptions {
  args?: string[]
  surface?: string
  cwd?: string
}

export interface CmuxWorkspaceCreateResult {
  workspace_ref?: string
  workspace_id?: string
  surface_ref?: string
  surface_id?: string
  pane_ref?: string
  pane_id?: string
  [key: string]: unknown
}

export interface CmuxNewSurfaceResult {
  surface_ref?: string
  surface_id?: string
  tab_ref?: string
  pane_ref?: string
  workspace_ref?: string
  [key: string]: unknown
}

export interface CmuxNewPaneResult {
  surface_ref?: string
  surface_id?: string
  pane_ref?: string
  pane_id?: string
  workspace_ref?: string
  [key: string]: unknown
}
export interface CmuxListPanesResult {
  panes?: Array<{
    ref?: string
    id?: string
    index?: number
    focused?: boolean
    surface_refs?: string[]
    selected_surface_ref?: string
    [key: string]: unknown
  }>
  [key: string]: unknown
}

export interface CmuxCurrentWorkspaceResult {
  workspace_ref?: string
  workspace_id?: string
  workspace?: {
    title?: string
    custom_title?: string
    current_directory?: string
    id?: string
    ref?: string
    [key: string]: unknown
  }
  [key: string]: unknown
}

export interface CmuxSurfaceTreeItem {
  active?: boolean
  focused?: boolean
  here?: boolean
  ref?: string
  id?: string
  title?: string
  tty?: string
  type?: string
  selected?: boolean
  [key: string]: unknown
}

export interface CmuxPaneTreeItem {
  ref?: string
  id?: string
  active?: boolean
  focused?: boolean
  surfaces?: CmuxSurfaceTreeItem[]
  [key: string]: unknown
}

export interface CmuxWorkspaceTreeItem {
  ref?: string
  id?: string
  title?: string
  active?: boolean
  selected?: boolean
  panes?: CmuxPaneTreeItem[]
  [key: string]: unknown
}

export interface CmuxWindowTreeItem {
  ref?: string
  id?: string
  active?: boolean
  current?: boolean
  workspaces?: CmuxWorkspaceTreeItem[]
  [key: string]: unknown
}

export interface CmuxTreeResult {
  active?: {
    surface_ref?: string
    workspace_ref?: string
    pane_ref?: string
    [key: string]: unknown
  }
  caller?: {
    surface_ref?: string
    workspace_ref?: string
    pane_ref?: string
    [key: string]: unknown
  }
  windows?: CmuxWindowTreeItem[]
  [key: string]: unknown
}

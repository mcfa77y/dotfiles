# cmux-ts

TypeScript CLI and SDK for cmux terminal automation with Bun and Commander.

## Commands

- **`workspace-name [path]`** (aliases: `set-workspace-name`, `cwrn`, `wsn`): Sets the workspace title to the target directory name (defaults to `$PWD`), trimmed to 32 characters.
- **`tab`** (aliases: `ct`, `new-tab`): Creates a new surface/tab, renames it, and sends a command (`-n, --name`, `-c, --command`, `-f, --focus`, `--cwd`).
- **`current-title`** (aliases: `title`, `current-tab-title`): Prints the current surface tab title.
- **`dev [path]`** (aliases: `cdev`, `workspace-dev`): Launches a development workspace split with OpenCode/omp (left) and Neovim (right).
- **`nvim [args...]`** (aliases: `nv`, `nvim-rename`): Runs Neovim with automatic tab title renaming and restoration on exit.

## Usage

### Run via Bun

```bash
bun run start --help
bun run start dev ~/Projects/myrepo
bun run start tab --name "BE Server" --command "yarn dev"
bun run start workspace-name
bun run start current-title
```

### Build Standalone Binary

```bash
bun run build
./bin/cmux-ts --help
```

### Programmatic SDK

```ts
import {
  cmux,
  createTab,
  getCurrentSurfaceTitle,
  launchDevWorkspace,
  setWorkspaceName,
} from './src'

// Launch dev workspace
await launchDevWorkspace({ cwd: process.cwd() })

// Spawn a background tab
await createTab({
  name: 'FE Server',
  command: 'yarn start',
  focus: false,
})
```

### Linting & Type Checking

```bash
bun run lint
bun run lint:fix
bun run typecheck
```

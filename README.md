# Personal Dotfiles

Personal system configuration managed with [GNU Stow](https://www.gnu.org/software/stow/). Each top-level package mirrors paths relative to `$HOME`; Stow creates symlinks from the real home directory back into this repository.

## Requirements

- Git
- GNU Stow
- A POSIX shell

Install Stow:

```bash
# Ubuntu / Debian
sudo apt update
sudo apt install stow

# macOS
brew install stow

# Arch Linux
sudo pacman -S stow
```

## Clone

Clone into `~/dotfiles`. The Makefile and several shell configs assume this location.

```bash
git clone git@github.com:mcfa77y/dotfiles.git ~/dotfiles
cd ~/dotfiles
```

## Deploy on Linux

From Ubuntu or another Linux host:

```bash
cd ~/dotfiles
make stow
```

Linux deploys the common packages plus `gtk-2.0`.

Linux does not deploy these macOS-only packages:

- `iterm2`
- `karabiner`

If these packages were previously linked on Linux, remove their links:

```bash
cd ~/dotfiles
stow -v -D -t ~ iterm2 karabiner
make stow
```

## Deploy on macOS

From macOS:

```bash
cd ~/dotfiles
make stow
```

macOS deploys the common packages plus:

- `iterm2`
- `karabiner`

The Makefile detects macOS with `uname -s == Darwin`.

## Update existing symlinks

Refresh links after changing package contents:

```bash
cd ~/dotfiles
make restow
```

Remove managed links without deleting files in this repo:

```bash
cd ~/dotfiles
make unstow
```

Preview Stow changes before applying them:

```bash
cd ~/dotfiles
stow -n -v -S -t ~ --ignore='themes$' act atuin bash bat btop gh ghostty git glow lazygit neofetch nvim powerline ranger starship tabtab thefuck vim worktrunk yazi zsh gtk-2.0
```

## Package selection

`Makefile` defines platform groups:

- `COMMON_PACKAGES`: shared Linux/macOS packages.
- `LINUX_PACKAGES`: Linux-only packages.
- `MACOS_PACKAGES`: macOS-only packages.

`lazygit/.config/lazygit/themes` is ignored during Stow because it is an absolute macOS symlink in this repo.

## Local machine overrides

Keep machine-specific settings out of shared tracked files.

Git reads a local override file when present:

```gitconfig
[include]
  path = ~/.gitconfig.local
```

Example `~/.gitconfig.local`:

```gitconfig
[core]
  hooksPath = ~/Projects/empo_health/git-hooks
```

## Structure

Each package contains files exactly where they should appear under `$HOME`:

```text
~/dotfiles/
├── git/
│   ├── .gitconfig             -> ~/.gitconfig
│   └── .config/git/           -> ~/.config/git/
├── nvim/
│   └── .config/nvim/          -> ~/.config/nvim/
├── zsh/
│   ├── .zshrc                 -> ~/.zshrc
│   ├── .zprofile              -> ~/.zprofile
│   └── .zshenv                -> ~/.zshenv
└── Makefile
```

## Included packages

- `act` - GitHub Actions local runner configuration
- `atuin` - Shell history search configuration
- `bash` - Bash startup configuration
- `bat` - `bat` configuration
- `btop` - Resource monitor settings
- `gh` - GitHub CLI settings
- `ghostty` - Terminal configuration
- `git` - Global Git config and templates
- `glow` - Markdown viewer configuration
- `gtk-2.0` - GTK configuration for Linux
- `iterm2` - macOS terminal profiles
- `karabiner` - macOS keyboard mapping settings
- `lazygit` - Terminal Git UI configuration
- `neofetch` - System information display
- `nvim` - Neovim configuration
- `powerline` - Statusline configuration
- `ranger` - Console file manager configuration
- `starship` - Prompt configuration
- `tabtab` - CLI completions
- `thefuck` - Command correction configuration
- `vim` - Vim configuration
- `worktrunk` - Git worktree manager configuration
- `yazi` - Console file manager configuration
- `zsh` - Zsh configuration

## Notes

- Existing real files at target paths must be backed up or moved before Stow can link over them.
- The shell config uses guarded paths and `$HOME` so it can run on Ubuntu and macOS.
- Optional tools such as `starship`, `direnv`, `carapace`, `pyenv`, `brew`, clipboard tools, and notification tools are loaded only when installed.


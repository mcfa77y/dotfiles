# Personal Dotfiles

My personal system configurations and environment settings, clean-built and managed using **GNU Stow**.

## 🛠️ Management & Automation

This repository uses [GNU Stow](https://www.gnu.org/software/stow/) to automate creating symbolic links in the home directory (`~`) pointing directly into this repository.

To make managing these configurations effortless, a helper `Makefile` is provided in the root of this folder.

### **Available Commands**

* **Link All Configs:**
  ```bash
  make
  # or
  make stow
  ```
  Creates relative symbolic links in your home directory for all standard packages.

* **Refresh / Relink All Configs:**
  ```bash
  make restow
  ```
  Prunes broken symlinks and recreates all links (great for adding new configurations or updating file paths).

* **Unlink All Configs:**
  ```bash
  make unstow
  ```
  Deletes all symlinks safely without deleting the actual configuration files in this repository.

---

## 📂 Structure Overview

Each directory in this repository corresponds to a Stow "package". Inside each package, files are nested to exactly match where they belong relative to your home directory (`~`):

```text
~/dotfiles/
├── git/
│   ├── .gitconfig             -> Linked to ~/.gitconfig
│   └── .config/
│       └── git/               -> Linked to ~/.config/git/
├── nvim/
│   └── .config/
│       └── nvim/              -> Linked to ~/.config/nvim/
├── zsh/
│   ├── .zshrc                 -> Linked to ~/.zshrc
│   ├── .zprofile              -> Linked to ~/.zprofile
│   └── .zshenv                -> Linked to ~/.zshenv
└── Makefile
```

### **Included Packages**
* `act` - GitHub Actions local runner configuration (`~/.actrc`)
* `atuin` - Shell history search configuration
* `bash` - Bash profile settings
* `bat` - Syntax-highlighting for `cat`
* `btop` - Resource monitor settings
* `gh` - GitHub CLI settings
* `ghostty` - Terminal configuration
* `git` - Global Git config and templates
* `gtk-2.0` - GTK themes
* `iterm2` - macOS terminal profiles
* `karabiner` - Keyboard mapping settings
* `lazygit` - Terminal Git GUI configuration
* `neofetch` - System information display
* `nvim` - NeoVim settings
* `powerline` - Statusline configurations
* `ranger` - Console file manager configurations
* `starship` - Cross-shell prompt configurations
* `tabtab` - CLI completions
* `thefuck` - Console command corrector
* `vim` - Vim profile and history
* `vscode` - VS Code settings (`~/.vscode/settings.json`)
* `worktrunk` - Git worktree manager configurations
* `yazi` - Modern console file manager configurations
* `zsh` - Zsh configuration files

### **Backup-Only Folders (Not Stowed)**
* `gk` - GitKraken workspace configurations. Saved here for version control history, but excluded from auto-stow to avoid breaking active session state.
* `oh-my-zsh` - Oh My Zsh custom configurations.

---

## 🚀 Bootstrap on a New Machine

To set up your environment from scratch on a clean machine:

1. **Install GNU Stow:**
   * **macOS:** `brew install stow`
   * **Debian/Ubuntu:** `sudo apt install stow`
   * **Arch Linux:** `sudo pacman -S stow`

2. **Clone the repository:**
   ```bash
   git clone <your-repo-url> ~/dotfiles
   ```

3. **Deploy configurations:**
   ```bash
   cd ~/dotfiles
   make
   ```

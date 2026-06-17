# upgrade ls 2024-03-01
alias ls='eza --all --icons --group-directories-first'
alias l='eza --all --icons --group-directories-first'
alias lst='eza --group-directories-first --git-ignore --tree --icons --level 2'

# Editing oh my zsh
# alias code_ide='windsurf'
alias code_ide='agy-ide'
alias apply_theme="~/.bun/bin/bun run /Users/joe/Projects/js_for_fun/apply_vs_code_theme/index.ts"
alias ee='apply_theme; code_ide '
alias sz='source ~/.zshrc'
alias eomzplugins='code_ide ~/.zshrc'
alias eomzcustom='code_ide ~/.oh-my-zsh/custom/joe.zsh'
alias nomz='nvim ~/dotfiles/zsh/custom/joe.zsh'
alias nzsh='cd ~/; nvim ~/.zshrc'

alias pkn='pkill -9 node'
alias pkv='pkill -9 vite'

# fuzzy find directories 2023-12-30
alias fcd='cd "$(fd --type d --hidden --exclude .git --exclude node_modules | fzf | xargs -r dirname)"'

# fast jumps
alias ..='cd ..'
alias z-='cd -'
alias z2='cd ../../'
alias z3='cd ../../../'
export PROJECTS_DIR='/Users/joe/Projects'
alias zproj='cd $PROJECTS_DIR'
export JS_DIR='/Users/joe/Projects/js_for_fun'
alias zjs='cd $JS_DIR'
export PY_DIR='/Users/joe/Projects/python_for_fun'
alias zpy='cd $PY_DIR'
alias zdl='cd /Users/joe/Downloads'
alias zconfig='cd ~/.config'
alias zomz='cd ~/.oh-my-zsh'

# Tools initializations

# randomly_echo_banner - run disowned in background so it does not block terminal startup (0ms)
~/.bun/bin/bun run /Users/joe/Projects/js_for_fun/figletPreview/index.ts --text Fresh &|

# make a beep
alias beep=echo -e "\a"

# 2025-01-28
# Apply theme to lazy git
LAZY_GIT_CONFIG_DIR='/Users/joe/.config/lazygit'
export LG_CONFIG_FILE="$LAZY_GIT_CONFIG_DIR/config.yml"

# 2025-11-06
goto_parent_directory() {
  local target="${1:-my_target_folder}"
  local cur="$PWD"
  while [[ "$cur" != "/" && "$cur" != "" ]]; do
    local base
    base="$(basename "$cur")"
    if [[ "$base" == "$target" ]]; then
      cd "$cur" || return 1
      return 0
    fi
    cur="$(dirname "$cur")"
  done
  echo "Target folder '$target' not found" >&2
  return 1
}
alias zparent='goto_parent_directory'

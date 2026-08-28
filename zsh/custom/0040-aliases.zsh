# --- Homebrew ---
if command -v brew >/dev/null 2>&1; then
  alias bu='brew update && brew upgrade --yes && notify_done "done brew upgrade"'
fi

# --- Ollama ---
alias ask="ollama run gemma4:latest"


# --- Clipman ---
alias clipman='XAUTHORITY=$(systemctl --user show-environment | sed -n s/^XAUTHORITY=//p) GDK_BACKEND=x11 GSK_RENDERER=cairo /snap/bin/clipman'
# --- Nx ---
alias nxl='bun run "$JS_DIR/nx-utils/src/index.ts"'
alias nxu='bun run "$JS_DIR/nx-utils/src/utils.ts"'

# --- Circuit Python ---
alias cdc='cd /media/$USER/CIRCUITPY 2>/dev/null || cd /run/media/$USER/CIRCUITPY 2>/dev/null || cd /Volumes/CIRCUITPY'
alias ncirc='cdc; nv code.py'

# --- Fast Jumps & General (from joe.zsh) ---
if command -v eza >/dev/null 2>&1; then
  alias ls='eza --all --icons --group-directories-first'
  alias l='eza --all --icons --group-directories-first'
  alias lst='eza --group-directories-first --git-ignore --tree --icons --level 2'
else
  alias l='ls -la'
  alias lst='ls -la'
fi

alias cd='z'
alias ..='cd ..'
alias z-='cd -'
alias z2='cd ../../'
alias z3='cd ../../../'
alias zproj='cd $PROJECTS_DIR'
alias zjs='cd $JS_DIR'
alias zpy='cd $PY_DIR'
alias zdl='cd "$HOME/Downloads"'
alias zconfig='cd ~/.config'
alias fconfig='zconfig; nvim $(fzf_select); cd -'

alias apply_theme='bun run --cwd $JS_DIR/apply_vs_code_theme/ index.ts'
alias ee='apply_theme; $EDITOR'
alias beep='echo -e "\a"'
alias zparent='goto_parent_directory'

# --- Oh My Zsh (from omz.zsh) ---
alias sz='source ~/.zshrc'
alias eomzplugins='$EDITOR ~/.zshrc'
alias eomzcustom='$EDITOR $OMZ_CUSTOM_DIR/0040-aliases.zsh'
alias nomz='nvim $OMZ_CUSTOM_DIR/0040-aliases.zsh'
alias nzsh='nvim ~/.zshrc'
alias zomz='cd $OMZ_CUSTOM_DIR'
alias fomz='zomz; nvim $(fzf_multi_select); cd -; sz'

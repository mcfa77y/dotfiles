# Load datetime module for microsecond-precision timing
zmodload zsh/datetime

# Set to "true" to print high-resolution shell startup timing and bottleneck profiling (can also be set as an env var)
ZSH_DEBUG_PROFILE="${ZSH_DEBUG_PROFILE:-false}"

# Initialize timing variables
_shell_start_time=$EPOCHREALTIME
_last_lap_time=$_shell_start_time

log_time_lap() {
  [[ "$ZSH_DEBUG_PROFILE" != "true" ]] && return
  
  local section_name="$1"
  local current_time=$EPOCHREALTIME
  
  # Calculate elapsed times in milliseconds
  local lap_elapsed=$(printf "%.1f" $(( (current_time - _last_lap_time) * 1000 )))
  local total_elapsed=$(printf "%.1f" $(( (current_time - _shell_start_time) * 1000 )))
  
  # Update last lap time
  _last_lap_time=$current_time
  
  # Print high-signal lap information
  print -P "%F{242}⏱  %F{33}${section_name}%F{242}: %F{76}${lap_elapsed}ms%F{242} (total %F{220}${total_elapsed}ms%F{242})%f"
}

# Add custom completions directory to fpath (for cached uv and ngrok completions)
fpath=(~/.zsh/completions $fpath)

# Preferred editor for local and remote sessions
if [[ -n $SSH_CONNECTION ]]; then
  export EDITOR='vim'
else
  export EDITOR='nvim'
fi

# --- ZINIT PACKAGE MANAGER BOOTSTRAP & SETUP ---
# Set the directory where Zinit will be installed
ZINIT_HOME="${XDG_DATA_HOME:-${HOME}/.local/share}/zinit/zinit.git"

# Download Zinit if it's not already installed
if [[ ! -f $ZINIT_HOME/zinit.zsh ]]; then
    print -P "%F{33}▓▒░ %F{220}Installing %F{33}ZDHARMA-CONTINUUM%F{220} Zinit Plugin Manager...%f"
    mkdir -p "$(dirname $ZINIT_HOME)"
    git clone https://github.com/zdharma-continuum/zinit.git "$ZINIT_HOME"
fi

# Source Zinit
source "${ZINIT_HOME}/zinit.zsh"

# Enable Zinit completions
autoload -Uz _zinit
(( ${+_comps} )) && _comps[zinit]=_zinit

log_time_lap "Zinit Bootstrapped"

# --- LOAD PLUGINS & SNIPPETS ---
# Load essential community plugins
zinit light zsh-users/zsh-autosuggestions
zinit light zdharma-continuum/fast-syntax-highlighting
zinit light zsh-users/zsh-completions
zinit light marlonrichert/zsh-autocomplete

# Load Oh-My-Zsh library and plugin snippets
zinit snippet OMZ::lib/git.zsh
zinit snippet OMZ::plugins/git/git.plugin.zsh
zinit snippet OMZ::plugins/bgnotify/bgnotify.plugin.zsh
zinit snippet OMZ::plugins/vi-mode/vi-mode.plugin.zsh
zinit snippet OMZ::plugins/terraform/terraform.plugin.zsh
zinit snippet OMZ::plugins/direnv/direnv.plugin.zsh
zinit snippet OMZ::plugins/aws/aws.plugin.zsh

# Load local custom plugins
zinit light ~/dotfiles/zsh/custom/plugins/nx-completion

log_time_lap "Plugins Loaded"

# --- COMPLETION SYSTEM INITIALIZATION ---
# Initialize zsh completion system (required for carapace, bun, wt, etc.)
autoload -Uz compinit
compinit

# Replay intercepted compdefs
zinit cdreplay -q

log_time_lap "Completion System (compinit)"

# --- LOAD CUSTOM SCRIPTS (Hybrid Setup) ---
# Source all flat custom scripts under custom/*.zsh
for file in ~/dotfiles/zsh/custom/*.zsh; do
  if [[ -f "$file" ]]; then
    if [[ "$ZSH_DEBUG_PROFILE" == "true" ]]; then
      local script_start=$EPOCHREALTIME
      source "$file"
      local script_elapsed=$(printf "%.1f" $(( (EPOCHREALTIME - script_start) * 1000 )))
      # Alert if any custom script takes more than 10ms
      if (( script_elapsed > 10 )); then
        print -P "%F{242}  ↳ %F{203}${file:t}%F{242} took %F{203}${script_elapsed}ms%f"
      fi
    else
      source "$file"
    fi
  fi
done

log_time_lap "Custom Flat Scripts Sourced"

# --- OTHER UTILITIES & CONFIGS ---

# fzf - useful keybindings and fuzzy completion 2023-12-18
[ -f ~/.fzf.zsh ] && source ~/.fzf.zsh

# 2024-06-12 `jk` vim keybinding for zsh terminal https://unix.stackexchange.com/questions/697018/jj-vim-keybinding-for-zsh-terminal
bindkey -M viins jk vi-cmd-mode

# 2026-01-14 starship init - https://starship.rs
export STARSHIP_CONFIG=~/.config/starship/starship.toml
eval "$(starship init zsh)"

log_time_lap "Starship Prompt Initialized"

# Added by Windsurf
export PATH="/Users/joe/.codeium/windsurf/bin:$PATH"

# 2025-05-12 openjdk
export PATH="/opt/homebrew/opt/openjdk/bin:$PATH"

# 2025-06-30 carapace https://carapace-sh.github.io/carapace-bin/setup.htm
export CARAPACE_BRIDGES='zsh,bash,inshellisense' # optional
zstyle ':completion:*' format $'\e[2;37mCompleting %d\e[m'
source <(carapace _carapace zsh)
export PATH="/opt/homebrew/bin:$PATH"

log_time_lap "Carapace Sourced"

# High-performance, microsecond-accurate NVM Lazy-Loader
export NVM_DIR="$HOME/.nvm"
nvm() {
  unset -f nvm node npm yarn npx bun
  [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
  [ -s "$NVM_DIR/bash_completion" ] && \. "$NVM_DIR/bash_completion"
  nvm "$@"
}
node() { nvm >/dev/null; node "$@" }
npm() { nvm >/dev/null; npm "$@" }
yarn() { nvm >/dev/null; yarn "$@" }
npx() { nvm >/dev/null; npx "$@" }

log_time_lap "NVM Lazy-Loaded"

# bun completions
[ -s "/Users/joe/.bun/_bun" ] && source "/Users/joe/.bun/_bun"

# 2025-12-02 zoxide completions
# https://github.com/ajeetdsouza/zoxide
eval "$(zoxide init zsh)"

# Worktrunk shell integration
if command -v wt >/dev/null 2>&1; then
  eval "$(wt config shell init zsh)"
fi

# Added by Antigravity
export PATH="/Users/joe/.antigravity/antigravity/bin:$PATH"

# Added by Antigravity IDE
export PATH="/Users/joe/.antigravity-ide/antigravity-ide/bin:$PATH"

log_time_lap "Shell Startup Completed"

# https://github.com/junegunn/fzf#customizing-fuzzy-completion-for-bash-and-zsh

# export FZF_DEFAULT_COMMAND='fd --type f --strip-cwd-prefix'

# Tokyo Night Theme
# https://junegunn.github.io/fzf/color-themes/?s=q1YqUbJSCsnPrsxX8MtMzyhR0lEqSUpXslJSNjQwNDRMVqoFAA
export FZF_DEFAULT_OPTS=$'--color=fg:#c0caf5,bg:#1a1b26,hl:#2ac3de,fg+:#c0caf5,bg+:#283457
  --color=hl+:#2ac3de,info:#7aa2f7,prompt:#2ac3de,pointer:#ff007c
  --color=marker:#ff5da0,spinner:#ff007c,header:#ff9e64,query:#c0caf5
  --color=border:#27a1b9,separator:#ff9e64,gutter:#283457
  --walker-skip .git,node_modules,target'

# ctrl t
export FZF_CTRL_T_OPTS="
  --preview 'if [ -d {} ]; then eza --group-directories-first --git-ignore --tree --icons --level 2 --color=always {} | head -200; else bat --color=always --style=numbers,changes --decorations=always {}; fi'
  --bind 'ctrl-/:change-preview-window(down|hidden|)'"

## Use ~~ as the trigger sequence instead of the default **
export FZF_COMPLETION_TRIGGER='~~'

## Options to fzf command
export FZF_COMPLETION_OPTS='--border --info=inline'

## Options for path completion (e.g. vim **<TAB>)
export FZF_COMPLETION_PATH_OPTS='--walker file,dir,follow,hidden'

## Options for directory completion (e.g. cd **<TAB>)
export FZF_COMPLETION_DIR_OPTS='--walker dir,follow'

_lst() {
  eza --group-directories-first --git-ignore --tree --icons --level 2 --color=always "$1"
}
_bat_color() {
  bat --color=always --style=numbers,changes --decorations=always "$1"
}

## Advanced customization of fzf options via _fzf_comprun function
## - The first argument to the function is the name of the command.
## - You should make sure to pass the rest of the arguments ($@) to fzf.
_fzf_comprun() {
  local command=$1
  shift

  case "$command" in
  cd) fzf --preview 'eza --group-directories-first --git-ignore --tree --icons --level 2 --color=always {} | head -200' "$@" ;;
  export | unset) fzf --preview "eval 'echo \$'{}" "$@" ;;
  ssh) fzf --preview 'dig {}' "$@" ;;
  nvim) fzf --preview 'if [ -d {} ]; then eza --group-directories-first --git-ignore --tree --icons --level 2 --color=always {} | head -200; else bat --color=always --style=numbers,changes --decorations=always {}; fi' --header "Select file" "$@" ;;
  *) fzf --preview 'if [ -d {} ]; then eza --group-directories-first --git-ignore --tree --icons --level 2 --color=always {} | head -200; else bat --color=always --style=numbers,changes --decorations=always {}; fi' --header "Select file" "$@" ;;
  esac
}

# Use fd (https://github.com/sharkdp/fd) for listing path candidates.
# - The first argument to the function ($1) is the base path to start traversal
# - See the source code (completion.{bash,zsh}) for the details.
_fd_excludes() {
  local item
  for item in "$@"; do
    echo -n "--exclude=$item "
  done
}

_fzf_compgen_path() {
  fd --hidden --follow $(_fd_excludes .git node_modules target .cache) . "$1"
}

# Use fd to generate the list for directory completion
_fzf_compgen_dir() {
  fd --type d --hidden --follow $(_fd_excludes .git node_modules target .cache) . "$1"
}

fzf_multi_select() {
  fzf -m --preview 'if [ -d {} ]; then eza --group-directories-first --git-ignore --tree --icons --level 2 --color=always {} | head -200; else bat --color=always --style=numbers,changes --decorations=always {}; fi' --header "Select files (Tab to multi-select)"
}
fzf_select() {
  fzf --preview 'if [ -d {} ]; then eza --group-directories-first --git-ignore --tree --icons --level 2 --color=always {} | head -200; else bat --color=always --style=numbers,changes --decorations=always {}; fi' --header "Select file"
}

# fzf - useful keybindings and fuzzy completion
# cache_completion fzf fzf_init.zsh "cat /opt/homebrew/opt/fzf/shell/completion.zsh /opt/homebrew/opt/fzf/shell/key-bindings.zsh"
cache_completion fzf fzf_init.zsh "fzf --zsh"

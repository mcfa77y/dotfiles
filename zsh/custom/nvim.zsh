NVIM_CONFIG_DIR='/Users/joe/.config/nvim'
alias addLazyPackage='nvim_with_cmux_rename $NVIM_CONFIG_DIR/lua/user/init.lua'
alias nnvim='cd $NVIM_CONFIG_DIR; nvim_with_cmux_rename .'

nvim_with_cmux_rename() {
  local original_title=""
  if [[ -n "$CMUX_SURFACE_ID" ]]; then
    original_title=$(cmux-current-title)
    cmux rename-tab --surface "$CMUX_SURFACE_ID" "neovim $(basename "$PWD")" 2>/dev/null
  fi
  nvim "$@"
  local exit_code=$?
  if [[ -n "$CMUX_SURFACE_ID" ]]; then
    if [[ -n "$original_title" ]]; then
      cmux rename-tab --surface "$CMUX_SURFACE_ID" "$original_title" 2>/dev/null
    else
      cmux tab-action --action clear-name --surface "$CMUX_SURFACE_ID" 2>/dev/null
    fi
  fi
  return $exit_code
}

alias nv='nvim_with_cmux_rename'

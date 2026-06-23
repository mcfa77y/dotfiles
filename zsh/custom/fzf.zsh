fzf_multi_select() {
  fzf -m --preview "bat --color=always {}" --header "Select files (Tab to multi-select)"
}
fzf_select() {
  fzf --preview "bat --color=always {}" --header "Select file"
}

# fzf - useful keybindings and fuzzy completion
cache_completion fzf fzf_init.zsh "cat /opt/homebrew/opt/fzf/shell/completion.zsh /opt/homebrew/opt/fzf/shell/key-bindings.zsh"
[[ -f ~/.zsh/completions/fzf_init.zsh ]] && source ~/.zsh/completions/fzf_init.zsh

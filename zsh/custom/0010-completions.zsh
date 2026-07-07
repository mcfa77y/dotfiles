# Prepend homebrew bin path to run completion generators
export PATH="/opt/homebrew/bin:$PATH"

# bun completions
[ -s "/Users/joe/.bun/_bun" ] && source "/Users/joe/.bun/_bun"

# carapace variables and styles
export CARAPACE_BRIDGES='zsh,bash' # optional
zstyle ':completion:*' format '%F{242}[Carapace] %d%f'

# Cached completions in alphabetical order
cache_completion carapace carapace_init.zsh "carapace _carapace zsh"
cache_completion circup _circup "_CIRCUP_COMPLETE=zsh_source circup"
cache_completion cmux _cmux "cmux completion zsh"
cache_completion fzf fzf_init.zsh "fzf --zsh"
cache_completion linear linear_init.zsh "linear completions zsh"
cache_completion ngrok _ngrok "SHELL=/bin/zsh ngrok completion"
cache_completion uv _uv "uv generate-shell-completion zsh"
cache_completion uvx _uvx "uvx --generate-shell-completion zsh"
cache_completion wt wt_init.zsh "wt config shell init zsh"
cache_completion zoxide zoxide_init.zsh "zoxide init zsh"

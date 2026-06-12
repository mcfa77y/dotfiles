# 2025-06-30 carapace https://carapace-sh.github.io/carapace-bin/setup.htm
# Ensure Homebrew and carapace are in the PATH before calling cache_completion
export PATH="/opt/homebrew/bin:$PATH"

export CARAPACE_BRIDGES='zsh,bash,inshellisense' # optional
zstyle ':completion:*' format $'\e[2;37mCompleting %d\e[m'

cache_completion carapace carapace_init.zsh "carapace _carapace zsh"
[[ -f ~/.zsh/completions/carapace_init.zsh ]] && source ~/.zsh/completions/carapace_init.zsh

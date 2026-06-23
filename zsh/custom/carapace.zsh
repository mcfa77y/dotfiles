# 2025-06-30 carapace https://carapace-sh.github.io/carapace-bin/setup.htm
# Ensure Homebrew and carapace are in the PATH before calling cache_completion
export PATH="/opt/homebrew/bin:$PATH"

export CARAPACE_BRIDGES='zsh,bash' # optional
zstyle ':completion:*' format '%F{242}[Carapace] %d%f'

cache_completion carapace carapace_init.zsh "carapace _carapace zsh"

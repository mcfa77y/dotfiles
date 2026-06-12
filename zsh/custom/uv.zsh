# 2024-12-19 python package manager https://docs.astral.sh/uv/getting-started/installation/#upgrading-uv
# Cache UV completion inside ~/.zsh/completions (loaded instantly on startup)
if [[ ! -f ~/.zsh/completions/_uv ]]; then
  mkdir -p ~/.zsh/completions
  uv generate-shell-completion zsh > ~/.zsh/completions/_uv 2>/dev/null
fi
if [[ ! -f ~/.zsh/completions/_uvx ]]; then
  mkdir -p ~/.zsh/completions
  uvx --generate-shell-completion zsh > ~/.zsh/completions/_uvx 2>/dev/null
fi

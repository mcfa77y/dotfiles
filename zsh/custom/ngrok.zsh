# from brew upgrade 2034-10-31 happy halloween!
# Cache ngrok completion inside ~/.zsh/completions (loaded instantly on startup)
if command -v ngrok &>/dev/null; then
  if [[ ! -f ~/.zsh/completions/_ngrok ]]; then
    mkdir -p ~/.zsh/completions
    ngrok completion > ~/.zsh/completions/_ngrok 2>/dev/null
  fi
fi
alias ngrok_start='ngrok http --domain=saved-heron-driving.ngrok-free.app 3000'
alias ngrok_start2='ngrok http --domain=saved-heron-driving.ngrok-free.app https://localhost:3002'
alias ngrok_start3='ngrok http --domain=saved-heron-driving.ngrok-free.app http://localhost:3002'

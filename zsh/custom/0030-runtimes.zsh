# --- Bun ---
export BUN_INSTALL="$HOME/.bun"
export PATH="$BUN_INSTALL/bin:$PATH"

# --- Go ---
if command -v go >/dev/null 2>&1; then
  export GOROOT="$(go env GOROOT 2>/dev/null)"
elif [[ -d /opt/homebrew/opt/go/libexec ]]; then
  export GOROOT="/opt/homebrew/opt/go/libexec"
elif [[ -d /usr/local/opt/go/libexec ]]; then
  export GOROOT="/usr/local/opt/go/libexec"
fi

export GOPATH="$HOME/go"
if [[ -n "$GOROOT" ]]; then
  export PATH="$GOPATH/bin:$GOROOT/bin:$HOME/.local/bin:$PATH"
else
  export PATH="$GOPATH/bin:$HOME/.local/bin:$PATH"
fi

# --- Sonar ---
if [[ -d /opt/homebrew/Cellar/sonar-scanner/7.3.0.5189/libexec ]]; then
  export SONAR_HOME=/opt/homebrew/Cellar/sonar-scanner/7.3.0.5189/libexec
elif [[ -d /usr/share/sonar-scanner ]]; then
  export SONAR_HOME=/usr/share/sonar-scanner
fi
if [[ -n "$SONAR_HOME" ]]; then
  export SONAR="$SONAR_HOME/bin"
  export PATH="$SONAR:$PATH"
fi

# --- PNPM ---
export PNPM_HOME="${PNPM_HOME:-$HOME/.local/share/pnpm}"
case ":$PATH:" in
*":$PNPM_HOME:"*) ;;
*) export PATH="$PNPM_HOME:$PATH" ;;
esac

alias p='pnpm'
alias px='pnpm exec'
alias prec='pnpm --recrusive '
alias pa='pnpm add '
alias pad='pnpm add --save-dev '
alias pr='pnpm remove'

alias pd='p dev | pino-pretty'

# --- Python ---
export PYENV_ROOT="$HOME/.pyenv"
command -v pyenv >/dev/null || export PATH="$PYENV_ROOT/bin:$PATH"

# Lazy-load pyenv and pyenv-virtualenv
pyenv() {
  unset -f pyenv python pip
  eval "$(pyenv init - zsh --no-rehash)"
  eval "$(pyenv virtualenv-init - zsh)"
  pyenv "$@"
}
python() { pyenv >/dev/null; python "$@" }
pip() { pyenv >/dev/null; pip "$@" }

export PATH="$HOME/.local/bin:$PATH"

# --- Node/NVM/Yarn ---
# Synchronous NVM loader wrappers to prevent race conditions on shell startup/immediate command executions
_is_nvm_loaded() {
  (( $+functions[nvm] )) && [[ "$(whence -f nvm 2>/dev/null)" != *"unfunction nvm"* ]]
}

if ! _is_nvm_loaded; then
  _ensure_nvm() {
    local cmd="$1"
    if ! _is_nvm_loaded; then
      unfunction nvm 2>/dev/null
      local nvm_path="${NVM_DIR:-$HOME/.nvm}"
      if [[ -s "$nvm_path/nvm.sh" ]]; then
        source "$nvm_path/nvm.sh"
      elif [[ -s "$HOME/.nvm/nvm.sh" ]]; then
        export NVM_DIR="$HOME/.nvm"
        source "$NVM_DIR/nvm.sh"
      fi
    fi

    # If NVM is loaded but the command is still not in path, force load default version
    if ! (( $+commands[$cmd] )) && _is_nvm_loaded; then
      nvm use default &>/dev/null
    fi

    # Clean up wrappers once NVM is fully active and node is in path
    if (( $+commands[node] )) && _is_nvm_loaded; then
      unfunction node npm npx yarn 2>/dev/null
    fi
  }

  yarn() {
    if ! _is_nvm_loaded; then
      _ensure_nvm yarn
    else
      unfunction node npm npx yarn 2>/dev/null
    fi
    command yarn "$@"
  }

  npx() {
    if ! _is_nvm_loaded; then
      _ensure_nvm npx
    else
      unfunction node npm npx yarn 2>/dev/null
    fi
    command npx "$@"
  }

  npm() {
    if ! _is_nvm_loaded; then
      _ensure_nvm npm
    else
      unfunction node npm npx yarn 2>/dev/null
    fi
    command npm "$@"
  }

  node() {
    if ! _is_nvm_loaded; then
      _ensure_nvm node
    else
      unfunction node npm npx yarn 2>/dev/null
    fi
    command node "$@"
  }

  nvm() {
    unfunction nvm node npm npx yarn 2>/dev/null
    _ensure_nvm node
    nvm "$@"
  }
fi

# yarn aliases
alias yvscode='yarn plugin import typescript; yarn plugin import interactive-tools; yarn dlx @yarnpkg/sdks vscode'
alias yl='yarn lint'
alias yfl='yarn format; yarn lint'

alias ytw='yarn test --watch'

alias yversion='echo "node $(node -v)\nyarn $(yarn -v)"'

alias ynx='yarn nx'

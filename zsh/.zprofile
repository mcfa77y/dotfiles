# NOTE: Keep path/environment setup in .zprofile (sourced once by login shells).
# Guard machine-specific tools so this file works on both macOS and Ubuntu.

if [[ -x /opt/homebrew/bin/brew ]]; then
  eval "$(/opt/homebrew/bin/brew shellenv)"
elif [[ -x /usr/local/bin/brew ]]; then
  eval "$(/usr/local/bin/brew shellenv)"
fi

if command -v pyenv >/dev/null 2>&1; then
  eval "$(pyenv init --path --no-rehash)"
fi

export PATH="$HOME/.local/bin:$PATH"

# python enviornment manager - 2023-07-21
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

# Local binaries path - 2023-08-04
export PATH="/Users/joe/.local/bin:$PATH"

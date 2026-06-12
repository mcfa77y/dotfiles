# python enviornment manager - 2023-07-21
export PYENV_ROOT="$HOME/.pyenv"
command -v pyenv >/dev/null || export PATH="$PYENV_ROOT/bin:$PATH"

# Lazy-load pyenv and pyenv-virtualenv
pyenv() {
  unset -f pyenv python pip poetry
  eval "$(pyenv init - zsh)"
  eval "$(pyenv virtualenv-init - zsh)"
  pyenv "$@"
}
python() { pyenv >/dev/null; python "$@" }
pip() { pyenv >/dev/null; pip "$@" }

# python poetry - 2023-08-04
export PATH="/Users/joe/.local/bin:$PATH"

# poetry autocomplete 2023-12-18
fpath+=~/.zfunc
poetry() { pyenv >/dev/null; poetry "$@" }

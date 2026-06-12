# python enviornment manager - 2023-07-21
export PYENV_ROOT="$HOME/.pyenv"
command -v pyenv >/dev/null || export PATH="$PYENV_ROOT/bin:$PATH"
eval "$(pyenv init - zsh)"

# 2024-05-29 https://github.com/pyenv/pyenv-virtualenv
eval "$(pyenv virtualenv-init - zsh)"

# python poetry - 2023-08-04
export PATH="/Users/joe/.local/bin:$PATH"

# poetry autocomplete 2023-12-18
fpath+=~/.zfunc

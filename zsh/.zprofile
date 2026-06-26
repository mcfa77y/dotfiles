# NOTE: Keep these path/environment setups in .zprofile (sourced only once on login)!
# 1. Performance: Avoids running slower commands like 'brew shellenv' (20-50ms)
#    on every interactive shell startup (new tabs/splits) which source .zshrc instead.
# 2. IDE/Tooling: Ensures Homebrew and Pyenv PATH variables propagate to graphical 
#    applications (like VS Code or Cursor) which query login shells to build their environment.

eval "$(/opt/homebrew/bin/brew shellenv)"

# Set the PYENV_ROOT variable to point to the location of Pyenv
eval "$(pyenv init --path --no-rehash)"

# Added by Antigravity CLI installer
export PATH="/Users/joe/.local/bin:$PATH"

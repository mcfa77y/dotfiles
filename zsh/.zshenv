# NOTE: Keep only lightweight, static PATH/env setups in .zshenv (sourced for ALL zsh instances)!
# 1. Scope: Sourced for every single zsh process (interactive, non-interactive, scripts, and cron jobs).
# 2. Safety: Sourcing a static file like ~/.cargo/env is extremely fast (<1ms). Never put heavy 
#    initializations (like eval "$(some_command)") here, as they will degrade all subshells and git hooks.

. "$HOME/.cargo/env"

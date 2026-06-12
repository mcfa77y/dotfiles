# pnpm setup 2024-01-04
export PNPM_HOME="/Users/joe/Library/pnpm"
case ":$PATH:" in
*":$PNPM_HOME:"*) ;;
*) export PATH="$PNPM_HOME:$PATH" ;;
esac

# pnpm 2023-10-07
alias p='pnpm'
alias px='pnpm exec'
alias prec='pnpm --recrusive '
alias pa='pnpm add '
alias pad='pnpm add --save-dev '
alias pr='pnpm remove'

alias pd='p dev | pino-pretty'

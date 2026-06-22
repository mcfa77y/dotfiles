# atuin search history 2024-02-27
autoload -U add-zsh-hook

# Load datetime module for microsecond-precision timing of commands
zmodload zsh/datetime 2>/dev/null

# If zsh-autosuggestions is installed, configure it to use Atuin's search. If
# you'd like to override this, then add your config after the $(atuin init zsh)
# in your .zshrc
_zsh_autosuggest_strategy_atuin() {
	suggestion=$(atuin search --cmd-only --limit 1 --search-mode prefix -- "$1")
}

if [ -n "${ZSH_AUTOSUGGEST_STRATEGY:-}" ]; then
	ZSH_AUTOSUGGEST_STRATEGY=("atuin" "${ZSH_AUTOSUGGEST_STRATEGY[@]}")
else
	ZSH_AUTOSUGGEST_STRATEGY=("atuin")
fi

# Generate a unique session identifier for the current terminal session
export ATUIN_SESSION=$(atuin uuid)
ATUIN_HISTORY_ID=""

# Pre-exec hook: Runs right before a command starts executing
_atuin_preexec() {
	local id
	# Tell Atuin that a command has started and get its unique history ID
	id=$(atuin history start -- "$1")
	export ATUIN_HISTORY_ID="$id"
	__atuin_preexec_time=${EPOCHREALTIME-}
}

# Precmd hook: Runs after a command finishes, right before the prompt is redrawn
_atuin_precmd() {
	local EXIT="$?" __atuin_precmd_time=${EPOCHREALTIME-}

	# If we don't have a history ID (e.g. prompt drew without a command running), skip
	[[ -z "${ATUIN_HISTORY_ID:-}" ]] && return

	# Calculate execution duration in nanoseconds
	local duration=""
	if [[ -n $__atuin_preexec_time && -n $__atuin_precmd_time ]]; then
		printf -v duration %.0f $(((__atuin_precmd_time - __atuin_preexec_time) * 1000000000))
	fi

	# Send command completion info to Atuin in the background
	(ATUIN_LOG=error atuin history end --exit $EXIT ${duration:+--duration=$duration} -- $ATUIN_HISTORY_ID &) >/dev/null 2>&1
	export ATUIN_HISTORY_ID=""
}

# Main interactive search widget handler
_atuin_search() {
	emulate -L zsh
	zle -I

	# Swap stderr and stdout so Atuin's interactive TUI draws on stderr
	local output
	# shellcheck disable=SC2048
	output=$(ATUIN_SHELL_ZSH=t ATUIN_LOG=error atuin search $* -i -- $BUFFER 3>&1 1>&2 2>&3)

	zle reset-prompt

	if [[ -n $output ]]; then
		RBUFFER=""
		LBUFFER=$output

		# If the command starts with the accept prefix, execute it immediately
		if [[ $LBUFFER == __atuin_accept__:* ]]; then
			LBUFFER=${LBUFFER#__atuin_accept__:}
			zle accept-line
		fi
	fi
}

# Keymap-specific search widget wrappers
_atuin_search_vicmd() {
	_atuin_search --keymap-mode=vim-normal
}
_atuin_search_viins() {
	_atuin_search --keymap-mode=vim-insert
}

# Context-aware up-arrow search widget
_atuin_up_search() {
	# Only trigger Atuin search if the current buffer is a single line.
	# For multi-line commands, fallback to standard up-line movement.
	if [[ ! $BUFFER == *$'\n'* ]]; then
		_atuin_search --shell-up-key-binding "$@"
	else
		zle up-line
	fi
}

# Keymap-specific up-search widget wrappers
_atuin_up_search_vicmd() {
	_atuin_up_search --keymap-mode=vim-normal
}
_atuin_up_search_viins() {
	_atuin_up_search --keymap-mode=vim-insert
}

# Register preexec/precmd hooks with Zsh
add-zsh-hook preexec _atuin_preexec
add-zsh-hook precmd _atuin_precmd

# Register widgets with the Zsh Line Editor (ZLE)
zle -N atuin-search _atuin_search
zle -N atuin-search-vicmd _atuin_search_vicmd
zle -N atuin-search-viins _atuin_search_viins
zle -N atuin-up-search _atuin_up_search
zle -N atuin-up-search-vicmd _atuin_up_search_vicmd
zle -N atuin-up-search-viins _atuin_up_search_viins

# Compatibility widget names for "atuin <= 17.2.1" users
zle -N _atuin_search_widget _atuin_search
zle -N _atuin_up_search_widget _atuin_up_search

# Bind keys to widgets
# Emacs & Vi-insert mode Ctrl+R: Full interactive history search
bindkey -M emacs '^r' atuin-search
bindkey -M viins '^r' atuin-search-viins

# Vi-command mode '/': Search history
bindkey -M vicmd '/' atuin-search-vicmd

# Bind up arrow (different terminal codes) to context-aware up-search
bindkey -M emacs '^[[A' atuin-up-search
bindkey -M vicmd '^[[A' atuin-up-search-vicmd
bindkey -M viins '^[[A' atuin-up-search-viins
bindkey -M emacs '^[OA' atuin-up-search
bindkey -M vicmd '^[OA' atuin-up-search-vicmd
bindkey -M viins '^[OA' atuin-up-search-viins

# Bind 'k' in Vi-command mode to context-aware up-search
bindkey -M vicmd 'k' atuin-up-search-vicmd

# PACKAGE_MANAGER='pnpm'
PACKAGE_MANAGER='yarn'
export EMPO_DIR="/Users/joe/Projects/empo_health"
export RHL_DIR="$EMPO_DIR/remote-health-link"

alias empo_start_ticket='cd $RHL_DIR; gl; gcb $(pbpaste); gp --no-verify; gback; wtaa'

yss() {
  if [[ -n "$CMUX_SURFACE_ID" && "$(cmux-current-title)" != "BE Server" ]]; then
    cmux-tab --name "BE Server" --command "$PACKAGE_MANAGER run start:server"
  else
    $PACKAGE_MANAGER run start:server
  fi
}

ysa() {
  if [[ -n "$CMUX_SURFACE_ID" && "$(cmux-current-title)" != "FE Server" ]]; then
    cmux-tab --name "FE Server" --command "$PACKAGE_MANAGER run start:app"
  else
    $PACKAGE_MANAGER run start:app
  fi
}

ytsw() {
  if [[ -n "$CMUX_SURFACE_ID" && "$(cmux-current-title)" != "Server Watch" ]]; then
    cmux-tab --name "Server Watch" --command "$PACKAGE_MANAGER run test:server:watch"
  else
    $PACKAGE_MANAGER run test:server:watch
  fi
}


alias zroot="zparent workspaces; cd .."
alias zbe="cd workspaces/backend-api"
alias zber="zroot; cd workspaces/backend-api"
alias zfe="cd workspaces/frontend-app"
alias zfer="zroot; cd workspaces/frontend-app"
alias zqa="cd workspaces/qa"
alias zqar="zroot; cd workspaces/qa"
alias zrat="cd workspaces/helper-scripts/rhl-api-tools"
alias zratr="zroot; cd workspaces/helper-scripts/rhl-api-tools"

alias zempo='cd $EMPO_DIR'
alias zrhl='cd $RHL_DIR'
alias ezrhl='cd $RHL_DIR; ee .'

alias screenDevice='screen /dev/tty.usbserial-BG01GYOM 115200'

alias ggr='HERE=$(pwd); zroot; gg; cd $HERE'

# error utils
SERVER_DIR='workspaces/backend-api/apps/data-api/src'
LIBS_DIR='libs/server'

# 2025-11-21
# this creats a .env from infisical
alias create_dot_env='infisical --env staging --path /qa --projectId 54010264-2268-4c13-aeea-3f9ef30f7654 export > .env'

countCircular() {
  local target="$1"
  local log_file="errors.log"
  if [[ "$1" == "$SERVER_DIR" ]]; then
    log_file="errors-server.log"
  elif [[ "$1" == "$LIBS_DIR" ]]; then
    log_file="errors-lib.log"
  fi
  if [[ -n "$2" ]]; then
    target="$1/$2"
    log_file="errors-lib-$2.log"
  fi

  yarn eslint "$target" --fix >$log_file
  cat $log_file | sed -n "s/.*\(Circular dependency between.*\)/\1/p" | sort | uniq -c | sort --reverse
  echo "$log_file"
}

summaryX() {
  local target="$1"
  if [[ -n "$2" ]]; then
    target="$1/$2"
  fi
  yarn eslint "$target" -f summary
}

summarycountCircular() {
  local target=""
  if [[ -n "$2" ]]; then
    summaryX $1 $2
    countCircular $1 $2
  else
    summaryX $1
    countCircular $1
  fi
}

alias summaryServer='echo "\nsummaryServer"; summarycountCircular $SERVER_DIR'
alias summaryLibs='echo "\nsummaryLibs"; summarycountCircular $LIBS_DIR'

countReferencesX() {
  local target="$1"
  if [[ -n "$2" ]]; then
    target="$1/$2"
  fi

  local grep_pattern="@app/modules/"
  local sed_pattern="s/.*\(@empo\/server-[^\"')]*\).*/\1/p"
  if [[ -n "$3" ]]; then
    grep_pattern="@empo/server-$3"
  fi
  echo "\n--------------------------------"
  echo "target: $target"
  echo "--------------------------------"
  cd $target
  rg --no-line-number -g '*.ts' "$grep_pattern" >grep_pattern.log

  # Extract import path and filename, then print summary and file list
  cat grep_pattern.log |
    sed -n 's/^\(.*\):.*\(@empo\/server-[^\"'\'')]*\).*/\2 \1/p' |
    sed 's/[\"'\'')]*$//' |
    tee grep_pattern_paths_and_files.log

  # Print summary table
  awk '{print $1}' grep_pattern_paths_and_files.log | sort | uniq -c | sort -nr | awk 'BEGIN { printf "%-6s %s\n", "Count", "Import Path"; print "-----------------------------" } { printf "%-6s %s\n", $1, $2 }'

  # Print files for each import path
  awk '{print $1, $2}' grep_pattern_paths_and_files.log | sort | uniq | awk '{files[$1]=files[$1] $2 "\n"} END {for (path in files) {print "\n" path " found in:"; print files[path]}}'
  cd -
}

alias countReferencesServer='countReferencesX $SERVER_DIR'
alias countReferencesLibs='countReferencesX $LIBS_DIR'

# 2025-08-27 upload swaggar api to postman
alias postman_swaggar='cd ~/Projects/js_for_fun/postman-swaggar-tools; bun run src/index.ts | bunx pino-pretty; cd -'

# 2025-11-10 for github-act-cache-server
export ACT_CACHE_AUTH_KEY=foo

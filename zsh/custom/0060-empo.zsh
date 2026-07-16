# --- Base Configs ---
# PACKAGE_MANAGER='pnpm'
PACKAGE_MANAGER='yarn'
export EMPO_DIR="/Users/joe/Projects/empo_health"
export EMPO_WORKTREE_DIR="/Users/joe/Projects/empo_health/empo-worktrees"
export RHL_DIR="$EMPO_DIR/main"

alias empo_start_ticket='cd $RHL_DIR; gl; gcb $(pbpaste); gp --no-verify; gback; wtaa'

alias zroot="z \$(git_current_branch)"
alias zbe="zroot; z workspaces/backend-api/"
alias zfe="zroot; z workspaces/frontend-app/"
alias zqa="zroot; z workspaces/qa/"
alias zrat="zroot; z workspaces/helper-scripts/rhl-api-tools/"

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

countcircular() {
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

# --- AWS ---
# Function for fuzzy-selecting AWS profiles
aws_set_profile() {
  # 1. Parse the credentials file for any [bracketed] names
  # We ignore comments (#) and empty lines, then strip the brackets.
  local profile=$(grep '^\[.*\]' ~/.aws/config |
    tr -d '[]' |
    awk '{print $2}' |
    fzf --height 40% \
      --reverse \
      --prompt="🚀 Select AWS Profile: " \
      --border=rounded \
      --info=inline)

  # 2. If a selection was made, export it
  if [ -n "$profile" ]; then
    export AWS_PROFILE=$profile
    echo "✅ AWS_PROFILE set to: **$AWS_PROFILE**"

    # Update environment files
    if [[ "$profile" == *staging* || "$profile" == *base* ]]; then
      sed -i '' "s/^.*AWS_PROFILE=.*/AWS_PROFILE=$profile/" ~/.aws/.envrc.staging
      echo "📝 Updated ~/.aws/.envrc.staging"
    elif [[ "$profile" == *prod* || "$profile" == *production* ]]; then
      sed -i '' "s/^.*AWS_PROFILE=.*/AWS_PROFILE=$profile/" ~/.aws/.envrc.prod
      echo "📝 Updated ~/.aws/.envrc.prod"
    fi

    # Optional: Auto-login check (Uncomment if you want it to check SSO status)
    aws sts get-caller-identity --profile "$profile" >/dev/null 2>&1 || aws sso login --profile "$profile"
  else
    echo "No profile selected."
  fi
}

# --- CI/CD ---
RERUN_DIR='/Users/joe/Projects/js_for_fun/rerun-github-qa-tests'

alias rerun-cicd-url='bun run --cwd $RERUN_DIR monitor --url $(pbpaste)'
alias rerun-cicd='bun run --cwd $RERUN_DIR monitor'

# --- Terraform ---
alias zfetf="cd workspaces/frontend-app/infrastructure/stacks/staging"
alias zbetf="cd workspaces/backend-api/infrastructure/stacks/staging"
alias link_aws_envrc_prod="rm .envrc; ln -s ~/.aws/.envrc.prod .envrc; direnv allow"
alias link_aws_envrc_staging="rm .envrc; ln -s ~/.aws/.envrc.staging .envrc; direnv allow"

# Get the lock ID and ask for confirmation before unlocking
tf_unlock_last() {
  # 1. Capture the plan output (including stderr)
  # 2. Look for the line that has "ID:" with spaces before it
  # 3. Grab the actual hex string
  local LOCK_ID=$(tfp 2>&1 | grep -w "ID:" | awk '{print $NF}')

  if [ -z "$LOCK_ID" ]; then
    echo "❌ No State Lock ID found in the output."
    return 1
  fi

  echo "✅ Found Lock ID: $LOCK_ID"

  # Confirm before doing something destructive
  echo -n "Force unlock this ID? (y/n): "
  read -r choice
  if [[ "$choice" == "y" || "$choice" == "Y" ]]; then
    terraform force-unlock "$LOCK_ID"
  else
    echo "Unlock cancelled."
  fi
}

# This runs the subshell only when you call the function
tf_select_work_space() {
  tfws $(tfwl | fzf)
}

tf_unlock() {
  local DIRECTORY=$1
  local ENVIRONMENT=$2
  echo "$DIRECTORY"
  cd "$DIRECTORY"

  # link .envrc
  echo "Linking ~/.aws/.envrc.$ENVIRONMENT"
  if [ "$ENVIRONMENT" = "prod" ]; then
    link_aws_envrc_prod
    aws sso login --profile empo-production-admin
  else
    link_aws_envrc_staging
    aws sso login --profile empo-staging-admin
  fi

  echo "tf_unlock_post_aws"
  echo "tf_unlock_post_aws" | pbcopy
}

tf_unlock_post_aws() {
  direnv allow
  echo "Terraform init"
  tfi

  echo "Select terraform workspace"
  tf_select_work_space

  echo "Unlock state"
  tf_unlock_last

}

tf_unlock_be() {
  zbetf
  tf_unlock . "staging"
}

tf_unlock_fe() {
  zfetf
  tf_unlock . "staging"
}

# --- Testing ---
# 2026-06-01 empo scripts directory
export SCRIPTS_DIR='/Users/joe/Projects/empo_health/scripts'

# 2026-06-01
# Updates docker compose for e2e tests
local_e2e() {
  # Go to backend directory
  local HERE=$(pwd)
  zbe
  local BE_DIR=$(pwd)

  local SRC_URI="$SCRIPTS_DIR/testing-configs/docker-compose.yml"
  local DEST_URI="$BE_DIR/sources/e2e/test-data/docker-compose.yml"

  # Copy over docker-compose
  cp "$SRC_URI" "$DEST_URI"
  # ln -s "$SRC_URI" "$DEST_URI"
  echo "updated docker-compose"
  cd "$HERE" || exit
}

# 2026-06-01
# Update playwright config
local_playwright() {
  local HERE=$(pwd)
  zqa
  local QA_DIR=$(pwd)

  local SRC_URI="$SCRIPTS_DIR/testing-configs/playwright.config.ts"
  local DEST_URI="$QA_DIR/playwright.config.ts"

  cp "$SRC_URI" "$DEST_URI"
  # rm $DEST_URI
  # ln -s "$SRC_URI" "$DEST_URI"
  echo "updated playwright.config.ts"
  cd "$HERE" || exit
}

# 2026-03-04 yarn test finds test files in a directory,
yarn_test_find_run() {
  # fd ignores node_modules by default
  local tests=$(fd --glob '*.{test,spec}.ts' --exclude '*e2e.spec.ts' | fzf -m --preview "bat --color=always {}" --header "Select tests (Tab to multi-select)")
  if [ -n "$tests" ]; then
    # Use the ${(@f)variable} trick in ZSH to handle spaces in filenames correctly
    yarn test --watch ${(f)tests}
    echo "yarn test --watch ${(@f)tests}"
    echo -n "yarn test --watch ${(@f)tests}" | pbcopy
  fi
}
# 2026-03-10 yarn test for qa
yarn_test_qa_find_run() {
  # fd ignores node_modules by default
  local tests=$(fd --glob '*.{test,spec}.ts' --exclude '*e2e.spec.ts' | fzf -m --preview "bat --color=always {}" --header "Select tests (Tab to multi-select)")
  if [ -n "$tests" ]; then
    # Use the ${(@f)variable} trick in ZSH to handle spaces in filenames correctly
    yarn test ${(f)tests}
    echo "clipboard updated with: yarn test ${(@f)tests}"
    echo -n "yarn test ${(@f)tests}" | pbcopy
    say 'finished with queue ah tests'
  fi
}

# 2026-03-04 yarn test finds test files in a directory,
yarn_test_e2e_find_run() {
  local_e2e
  # fd ignores node_modules by default
  local tests=$(fd '\.e2e.spec\.ts$' | fzf -m --preview "bat --color=always {}" --header "Select tests (Tab to multi-select)")
  if [ -n "$tests" ]; then
    # Use the ${(@f)variable} trick in ZSH to handle spaces in filenames correctly
    yarn test:e2e --watch -- ${(f)tests}
    echo "yarn test:e2e --watch -- ${(@f)tests}"
    echo "yarn test:e2e --watch -- ${(@f)tests}" | pbcopy
  fi
}

# 2026-04-02 bun run demo
brd() {
  local demo_file=$(fd '\.ts$' | fzf -m --preview "bat --color=always {}" --header "Select demo (Tab to multi-select)")
  bun run ${(f)demo_file}
  echo "bun run ${(f)demo_file}"
  echo "bun run ${(f)demo_file}" | pbcopy
}

backend_start() {
  kill_by_port 3000
  zbe
  yarn start --debug --watch | npx pino-pretty --colorize --levelFirst --ignore pid,hostname --translateTime 'HH:MM:ss'
}
frontend_start() {
  kill_by_port 3002
  zfe
  yarn start
}
# 2026-06-09 start app and server local_playwright
local_start_app_and_server() {
  cmux-tab --name "BE Server" --command "frontend_start "
  cmux-tab --name "FE Server" --command "backend_start "
}

# 2026-06-10
infisical_update_vars() {
  # Call script top update .env vars with infisical
  local infisical_vars_dir="$SCRIPTS_DIR/infisical-update-env-vars"
  bun run --cwd $infisical_vars_dir start --env all
}

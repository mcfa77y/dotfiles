# 2026-06-01 empo scripts directory
export SCRIPTS_DIR='/Users/joe/Projects/empo_health/scripts'

# 2026-06-01
# Updates docker compose for e2e tests
local_e2e() {
  # Go to backend directory
  local HERE=$(pwd)
  zber
  local BE_DIR=$(pwd)

  local SRC_URI="$SCRIPTS_DIR/testing-configs/docker-compose.yml"
  local DEST_URI="$BE_DIR/sources/e2e/test-data/docker-compose.yml"

  # Copy over docker-compose
  # cp "$SRC_URI" "$DEST_URI"
  ln -s "$SRC_URI" "$DEST_URI"
  echo "linked docker-compose"
  cd "$HERE" || exit
}

# 2026-06-01
# Update playwright config
local_playwright() {
  local HERE=$(pwd)
  zqar
  local QA_DIR=$(pwd)

  local SRC_URI="$SCRIPTS_DIR/testing-configs/playwright.config.ts"
  local DEST_URI="$QA_DIR/playwright.config.ts"

  # cp "$SRC_URI" "$DEST_URI"
  ln -s "$SRC_URI" "$DEST_URI"
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
    say 'finish with qa tests'
  fi
}

# 2026-03-04 yarn test finds test files in a directory,
yarn_test_e2e_find_run() {
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
  local testName=$(ls src/demo)
  local tests=$(fd '\.demo\.ts$' | fzf -m --preview "bat --color=always {}" --header "Select demo (Tab to multi-select)")
  bun run ${(f)tests}
  echo "bun run ${(f)tests}"
  echo "bun run ${(f)tests}" | pbcopy
}

# 2026-06-09 start app and server local_playwright
local_start_app_and_server() {
  cmux-tab --name "BE Server" --command "zbe; yarn start"
  cmux-tab --name "FE Server" --command "zfe; yarn start"
}

# 2026-06-10
infisical_update_vars() {
  # Call script top update .env vars with infisical
  local infisical_vars_dir="$SCRIPTS_DIR/infisical-update-env-vars"
  bun run --cwd $infisical_vars_dir start --env all
}

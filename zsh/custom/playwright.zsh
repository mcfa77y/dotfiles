# E2E testing neatleaf 2023-11-07
export E2E_TEST_EMAIL=e2e-test-user+kiosk@neatleaf.com
export E2E_TEST_PASSWORD=#defaultPassword123
export PLAYWRIGHT_FULLY_PARALLEL=true
export PLAYWRIGHT_TIMEOUT="30_000"
# export PLAYWRIGHT_RETRIES=3
export PLAYWRIGHT_RETRIES=1
# export BASE_URL="https://dashboard.sqa.neatleaf.com"
export BASE_URL="http://localhost:3000"

# Playwright Trace Downloader (Beautiful TUI/CLI)
playwright-trace() {
  bun run --cwd /Users/joe/Projects/empo_health/scripts/playwright-trace-from-url src/index.ts "$@"
}

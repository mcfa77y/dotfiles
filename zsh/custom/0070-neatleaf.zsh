# --- Databases & Hasura ---
# Neatleaf database connections
export STAGE=dev
export ENV=$STAGE
export DEV_DB_CONNECTION_STRING='postgres://neatleafadmin:rbq5yj8Fk43VpBJRzWYr@dev-spyder-database-1.cluster-cuceok84usym.us-west-2.rds.amazonaws.com:45228/neatleafdb?sslmode=require'
export DEVSTABLE_DB_CONNECTION_STRING="postgres://neatleafadmin:Xa71jhQHnOWPtJakr5fK@devstable-spyder-database-1.cluster-c8xivktrz01g.us-west-2.rds.amazonaws.com:7257/neatleafdb?sslmode=require"
export SQA_DB_CONNECTION_STRING='postgres://neatleafadmin:ZhHUWEPdMcTcjstWeV9C@sqa-spyder-database-1.cluster-cdvfqjhqrvpe.us-west-2.rds.amazonaws.com:36346/neatleafdb?sslmode=require'
export STAGING_DB_CONNECTION_STRING='postgres://neatleafadmin:ckA1SEbRnwL34ZcwIYF1@staging-spyder-database-1.cluster-cd1d83vx111h.us-west-2.rds.amazonaws.com:30589/neatleafdb?sslmode=require'
export PROD_DB_CONNECTION_STRING='postgres://neatleafadmin:58YKfD2cpzDlwmc9o9RN@prod-spyder-database-1.cluster-cpsrtgfd8hkd.us-west-2.rds.amazonaws.com:39678/neatleafdb?sslmode=require'
export SANDBOX_DB_CONNECTION_STRING='postgres://neatleafadmin:eqzkQRzwWCol0mCi8pRN@sandbox-spyder-database-1.cluster-c2s1uvl1anrl.us-west-2.rds.amazonaws.com:45228/neatleafdb?sslmode=require'
export RELATIONAL_DATABASE_ENDPOINT=$DEV_DB_CONNECTION_STRING

export DEV_HASURA_ADMIN_SECRET='89WvFEt$p&LSgzE@XbGfE68!FJvzQD95'
export DEV_HASURA_ADMIN_URL=https://dashboard-hasura.dev.neatleaf.com/v1/graphql
export DEVSTABLE_HASURA_ADMIN_SECRET='5>%wTI!7zhkUyG0fK!'\'':&`t-~'\''#7.wX;'
export DEVSTABLE_HASURA_ADMIN_URL=https://dashboard-hasura.devstable.neatleaf.com/v1/graphql
export SQA_HASURA_ADMIN_SECRET="e1Uw+s=MOOB]TtI!K.whPz;''0@&4.-1"
export SQA_HASURA_ADMIN_URL=https://dashboard-hasura.sqa.neatleaf.com/v1/graphql
export STAGING_HASURA_ADMIN_SECRET='6&S}obSwnR,xqa*\,_`HRitX5wVwfR.I'
export STAGING_HASURA_ADMIN_URL=https://dashboard-hasura.staging.neatleaf.com/v1/graphql
export PROD_HASURA_ADMIN_SECRET='w-eR9FUrm+35gU?D1Z,x`:88gz1eU#l/'
export PROD_HASURA_ADMIN_URL=https://dashboard-hasura.neatleaf.com/v1/graphql
export SANDBOX_HASURA_ADMIN_SECRET='BZxm$8TfinMuM^^nixqr4R^@C^^35fTc'
export SANDBOX_HASURA_ADMIN_URL=https://dashboard-hasura.sandbox.neatleaf.com/v1/graphql

export VITE_HASURA_GRAPHQL_ADMIN_SECRET=$DEVSTABLE_HASURA_ADMIN_SECRET
export VITE_HASURA_GRAPHQL_URL=$DEVSTABLE_HASURA_ADMIN_URL

# export DB_CONNECTION_STRING=$DEV_DB_CONNECTION_STRING
export DB_CONNECTION_STRING=$SANDBOX_DB_CONNECTION_STRING
export DATABASE_CONNECTION_URL=$DEV_DB_CONNECTION_STRING
# export DATABASE_CONNECTION_URL=$SANDBOX_DB_CONNECTION_STRING

# --- Testing & Playwright ---
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

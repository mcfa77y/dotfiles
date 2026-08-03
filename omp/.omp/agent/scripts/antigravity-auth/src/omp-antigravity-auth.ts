#!/usr/bin/env bun
/**
 * Antigravity OAuth token generator for omp using google-auth-library.
 */

import { PROJECT_ID } from './config'
import { getAntigravityAuthToken } from './google-auth'
import { logger } from './logger'
import { loadOrRefreshAuthToken } from './token-cache'
async function main(): Promise<void> {
  try {
    logger.debug(`Starting antigravity auth for project: ${PROJECT_ID}`)
    const cache = await loadOrRefreshAuthToken(getAntigravityAuthToken)

    logger.debug('Writing token cache to stdout')
    // Must remain raw console.log on stdout
    console.log(JSON.stringify(cache))
  }
  catch (e) {
    logger.error({ err: e }, 'Fatal error during token generation')
    process.exit(1)
  }
}

main()

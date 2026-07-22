#!/usr/bin/env bun
/**
 * Antigravity OAuth token generator for omp using google-auth-library.
 */

import { GoogleAuth } from 'google-auth-library'
import pino from 'pino'

// It is critical to log to stderr (destination 2) rather than stdout
// so that omp can correctly parse the JSON token output on stdout.
const logger = pino({
  level: 'info',
  transport: {
    target: 'pino-pretty',
    options: {
      colorize: true,
      destination: 2,
    },
  },
})

const HARDCODED_PROJECT_ID = 'empo-health-antigravity'

async function getAntigravityAuthToken(): Promise<string> {
  logger.debug('Initializing GoogleAuth with cloud-platform scopes')
  const auth = new GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/cloud-platform'],
    projectId: HARDCODED_PROJECT_ID,
    clientOptions: {
      quotaProjectId: HARDCODED_PROJECT_ID,
    },
  })

  logger.debug('Fetching auth client')
  const client = await auth.getClient()
  
  logger.debug('Requesting access token')
  const tokenResponse = await client.getAccessToken()

  if (!tokenResponse.token) {
    logger.error('Failed to retrieve OAuth access token')
    throw new Error('Failed to retrieve OAuth access token.')
  }

  logger.debug('Successfully retrieved access token')
  return tokenResponse.token
}

async function main(): Promise<void> {
  try {
    logger.debug(`Starting antigravity auth for project: ${HARDCODED_PROJECT_ID}`)
    const token = await getAntigravityAuthToken()
    
    const cache = {
      apiEndpoint: 'http://127.0.0.1:8080',
      token,
      enterpriseUrl: 'http://127.0.0.1:8080',
      projectId: HARDCODED_PROJECT_ID,
      expiresAt: Date.now() + 3600000,
      email: 'joe@empohealth.com',
    }
    
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

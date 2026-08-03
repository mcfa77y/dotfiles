import dayjs from 'dayjs'
import { GoogleAuth } from 'google-auth-library'
import { CACHE_SKEW_MS, PROJECT_ID } from './config'
import { logger } from './logger'

export interface OAuthClient {
  credentials: { expiry_date?: number }
  getAccessToken: () => Promise<{ token?: string | null }>
  refreshAccessToken?: () => Promise<unknown>
}

export type AuthClientFactory = () => Promise<OAuthClient>

export async function getAntigravityAuthToken(getClient: AuthClientFactory = async () => {
  logger.debug('Initializing GoogleAuth client')
  const auth = new GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/cloud-platform'],
    projectId: PROJECT_ID,
    clientOptions: {
      quotaProjectId: PROJECT_ID,
    },
  })
  const client = await auth.getClient() as OAuthClient & { eagerRefreshThresholdMillis?: number }
  client.eagerRefreshThresholdMillis = CACHE_SKEW_MS
  return client
}): Promise<{ token: string, expiresAt: number }> {
  const client = await getClient()

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    logger.debug({ attempt }, 'Fetching OAuth access token')
    const tokenResponse = await client.getAccessToken()
    const token = tokenResponse.token
    const expiresAt = client.credentials.expiry_date

    if (token && expiresAt && dayjs(expiresAt).isAfter(dayjs())) {
      logger.debug({ attempt, expiresAt: dayjs(expiresAt).toISOString() }, 'OAuth token is valid')
      return { token, expiresAt }
    }

    if (attempt === 1) {
      logger.debug({ attempt }, 'Refreshing expired OAuth token')
      await client.refreshAccessToken?.()
    }
  }

  throw new Error('Failed to retrieve a non-expired OAuth access token.')
}

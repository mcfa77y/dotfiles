import { describe, expect, test } from 'bun:test'
import { getAntigravityAuthToken } from './google-auth'

describe('getAntigravityAuthToken', () => {
  test('returns a valid token and expiry', async () => {
    const expiresAt = Date.now() + 60 * 60 * 1000
    const result = await getAntigravityAuthToken(async () => ({
      credentials: { expiry_date: expiresAt },
      getAccessToken: async () => ({ token: 'fresh-token' }),
    }))

    expect(result).toEqual({ token: 'fresh-token', expiresAt })
  })

  test('refreshes once when the first token is expired', async () => {
    let calls = 0
    let refreshes = 0
    const credentials = { expiry_date: Date.now() - 1 }
    const result = await getAntigravityAuthToken(async () => ({
      credentials,
      getAccessToken: async () => {
        calls += 1
        return { token: calls === 1 ? 'expired-token' : 'fresh-token' }
      },
      refreshAccessToken: async () => {
        refreshes += 1
        credentials.expiry_date = Date.now() + 60 * 60 * 1000
      },
    }))

    expect(result.token).toBe('fresh-token')
    expect(refreshes).toBe(1)
  })

  test('rejects when OAuth never returns a valid token', async () => {
    await expect(getAntigravityAuthToken(async () => ({
      credentials: { expiry_date: Date.now() - 1 },
      getAccessToken: async () => ({ token: 'expired-token' }),
    }))).rejects.toThrow('non-expired OAuth access token')
  })
})

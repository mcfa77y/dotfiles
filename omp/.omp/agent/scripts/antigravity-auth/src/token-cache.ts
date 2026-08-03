import dayjs from 'dayjs'
import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { logger } from './logger'
import {
  API_ENDPOINT,
  CACHE_PATH,
  CACHE_SKEW_MS,
  EMAIL,
  LOCK_PATH,
  LOCK_RETRY_MS,
  LOCK_TIMEOUT_MS,
  PROJECT_ID,
} from './config'

export interface CachedAuthToken {
  apiEndpoint: string
  token: string
  enterpriseUrl: string
  projectId: string
  expiresAt: number
  email: string
}

export interface TokenCacheOptions {
  cachePath?: string
  lockPath?: string
}

function isUsableToken(value: unknown): value is CachedAuthToken {
  if (!value || typeof value !== 'object')
    return false
  const cache = value as Partial<CachedAuthToken>
  return Boolean(
    cache.token
    && typeof cache.token === 'string'
    && typeof cache.expiresAt === 'number'
    && dayjs(cache.expiresAt).isAfter(dayjs().add(CACHE_SKEW_MS, 'millisecond')),
  )
}

export async function loadOrRefreshAuthToken(
  refresh: () => Promise<{ token: string, expiresAt: number }>,
  options: TokenCacheOptions = {},
): Promise<CachedAuthToken> {
  const cachePath = options.cachePath ?? CACHE_PATH
  const lockPath = options.lockPath ?? (options.cachePath ? `${cachePath}.lock` : LOCK_PATH)
  const readCachedToken = async (): Promise<CachedAuthToken | undefined> => {
    try {
      const cached = JSON.parse(await readFile(cachePath, 'utf8')) as unknown
      return isUsableToken(cached) ? cached : undefined
    }
    catch {
      return undefined
    }
  }
  const acquireRefreshLock = async (): Promise<() => Promise<void>> => {
    const startedAt = dayjs()
    await mkdir(join(homedir(), '.cache'), { recursive: true })
    while (true) {
      try {
        await mkdir(lockPath)
        return async () => rm(lockPath, { recursive: true, force: true })
      }
      catch (error) {
        if (!(error instanceof Error && 'code' in error && error.code === 'EEXIST')) throw error
        try {
          const lockAge = dayjs().diff(dayjs((await stat(lockPath)).mtimeMs), 'millisecond')
          if (lockAge > LOCK_TIMEOUT_MS) {
            logger.debug({ lockPath }, 'Removing stale OAuth refresh lock')
            await rm(lockPath, { recursive: true, force: true })
          }
        }
        catch {
          // The lock owner may have released it between stat and rm.
        }
        if (dayjs().diff(startedAt, 'millisecond') >= LOCK_TIMEOUT_MS) {
          throw new Error('Timed out waiting for the Antigravity OAuth refresh lock.')
        }
        await Bun.sleep(LOCK_RETRY_MS)
      }
    }
  }

  logger.debug({ cachePath }, 'Checking cached OAuth token')
  const cached = await readCachedToken()
  if (cached)
    return cached

  logger.debug({ lockPath }, 'Acquiring OAuth refresh lock')
  const releaseLock = await acquireRefreshLock()
  try {
    logger.debug('Rechecking cache after acquiring OAuth refresh lock')
    const refreshedByPeer = await readCachedToken()
    if (refreshedByPeer)
      return refreshedByPeer

    logger.debug('Refreshing OAuth token under lock')
    const authToken = await refresh()
    const cache: CachedAuthToken = {
      apiEndpoint: API_ENDPOINT,
      token: authToken.token,
      enterpriseUrl: API_ENDPOINT,
      projectId: PROJECT_ID,
      expiresAt: authToken.expiresAt,
      email: EMAIL,
    }
    const temporaryPath = `${cachePath}.${process.pid}.tmp`
    await writeFile(temporaryPath, JSON.stringify(cache, null, 2), { mode: 0o600 })
    await rename(temporaryPath, cachePath)
    logger.debug({ cachePath }, 'Cached OAuth token written')
    return cache
  }
  finally {
    await releaseLock()
  }
}

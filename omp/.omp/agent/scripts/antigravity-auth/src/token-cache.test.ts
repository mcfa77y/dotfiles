import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, test } from 'bun:test'
import { loadOrRefreshAuthToken } from './token-cache'

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map(directory => rm(directory, { recursive: true, force: true })))
})

async function createCachePaths(): Promise<{ cachePath: string, lockPath: string }> {
  const directory = await mkdtemp(join(tmpdir(), 'omp-antigravity-auth-'))
  temporaryDirectories.push(directory)
  return { cachePath: join(directory, 'token.json'), lockPath: join(directory, 'token.lock') }
}

describe('loadOrRefreshAuthToken', () => {
  test('refreshes once and reuses a valid cache', async () => {
    const paths = await createCachePaths()
    let refreshCount = 0
    const refresh = async () => {
      refreshCount += 1
      return { token: 'token-1', expiresAt: Date.now() + 60 * 60 * 1000 }
    }

    const first = await loadOrRefreshAuthToken(refresh, paths)
    const second = await loadOrRefreshAuthToken(refresh, paths)

    expect(first.token).toBe('token-1')
    expect(second.token).toBe('token-1')
    expect(refreshCount).toBe(1)
  })

  test('coordinates concurrent refreshes through the shared lock', async () => {
    const paths = await createCachePaths()
    let refreshCount = 0
    const refresh = async () => {
      refreshCount += 1
      return { token: 'token-2', expiresAt: Date.now() + 60 * 60 * 1000 }
    }

    const results = await Promise.all(
      Array.from({ length: 8 }, () => loadOrRefreshAuthToken(refresh, paths)),
    )

    expect(new Set(results.map(result => result.token))).toEqual(new Set(['token-2']))
    expect(refreshCount).toBe(1)
  })

  test('replaces an expired cache', async () => {
    const paths = await createCachePaths()
    await Bun.write(paths.cachePath, JSON.stringify({ token: 'expired', expiresAt: Date.now() - 1 }))

    const result = await loadOrRefreshAuthToken(
      async () => ({ token: 'fresh', expiresAt: Date.now() + 60 * 60 * 1000 }),
      paths,
    )

    expect(result.token).toBe('fresh')
  })
})

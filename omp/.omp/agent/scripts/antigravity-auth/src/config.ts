import { homedir } from 'node:os'
import { join } from 'node:path'

export const PROJECT_ID = 'empo-health-antigravity'
export const API_ENDPOINT = 'http://127.0.0.1:8080'
export const EMAIL = 'joe@empohealth.com'
export const CACHE_PATH = join(homedir(), '.cache', 'omp-antigravity-auth.json')
export const LOCK_PATH = `${CACHE_PATH}.lock`
export const CACHE_SKEW_MS = 5 * 60 * 1000
export const LOCK_TIMEOUT_MS = 30 * 1000
export const LOCK_RETRY_MS = 100

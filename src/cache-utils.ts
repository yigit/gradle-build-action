import * as core from '@actions/core'
import * as cache from '@actions/cache'
import * as github from '@actions/github'
import * as crypto from 'crypto'

export function isCacheReadEnabled(cacheName: string): boolean {
    const configValue = getCacheEnabledValue(cacheName)
    return configValue === 'true' || configValue === 'read-only'
}

export function isCacheSaveEnabled(cacheName: string): boolean {
    const configValue = getCacheEnabledValue(cacheName)
    return configValue === 'true'
}

function getCacheEnabledValue(cacheName: string): string {
    const configValue = core
        .getInput(`${cacheName}-cache-enabled`)
        .toLowerCase()

    if (['true', 'false', 'read-only'].includes(configValue)) {
        return configValue
    }
    throw new Error(
        `Invalid cache-enabled parameter '${configValue}'. Valid values are ['true', 'false', 'read-only']`
    )
}

function generateCacheKey(cacheName: string): CacheKey {
    // Prefix can be used to force change all cache keys
    const cacheKeyPrefix = process.env['CACHE_KEY_PREFIX'] || ''

    // At the most general level, share caches for all executions on the same OS
    const runnerOs = process.env['RUNNER_OS'] || ''
    const cacheKeyForOs = `${cacheKeyPrefix}${cacheName}|${runnerOs}`

    // Prefer caches that run this job
    const cacheKeyForJob = `${cacheKeyForOs}|${github.context.job}`

    // Prefer (even more) jobs that run this job with the same context (matrix)
    const cacheKeyForJobContext = `${cacheKeyForJob}[${determineJobContext()}]`

    // Exact match on Git SHA
    const cacheKey = `${cacheKeyForJobContext}-${github.context.sha}`

    return new CacheKey(cacheKey, [
        cacheKeyForJobContext,
        cacheKeyForJob,
        cacheKeyForOs
    ])
}

function determineJobContext(): string {
    const workflowJobContext = core.getInput('workflow-job-context')
    // TODO: Remove this debug logging
    core.info(`Creating cache key with job context: ${workflowJobContext}`)
    return hashStrings([workflowJobContext])
}

export function hashStrings(values: string[]): string {
    const hash = crypto.createHash('md5')
    for (const value of values) {
        hash.update(value)
    }
    return hash.digest('hex')
}

class CacheKey {
    key: string
    restoreKeys: string[]

    constructor(key: string, restoreKeys: string[]) {
        this.key = key
        this.restoreKeys = restoreKeys
    }
}

export abstract class AbstractCache {
    private cacheName: string
    private cacheDescription: string
    private cacheKeyStateKey: string
    private cacheResultStateKey: string

    constructor(cacheName: string, cacheDescription: string) {
        this.cacheName = cacheName
        this.cacheDescription = cacheDescription
        this.cacheKeyStateKey = `CACHE_KEY_${cacheName}`
        this.cacheResultStateKey = `CACHE_RESULT_${cacheName}`
    }

    async restore(): Promise<void> {
        if (this.cacheOutputExists()) {
            core.info(
                `${this.cacheDescription} already exists. Not restoring from cache.`
            )
            return
        }

        const cacheKey = generateCacheKey(this.cacheName)

        core.saveState(this.cacheKeyStateKey, cacheKey.key)

        const cacheResult = await cache.restoreCache(
            this.getCachePath(),
            cacheKey.key,
            cacheKey.restoreKeys
        )

        if (!cacheResult) {
            core.info(
                `${this.cacheDescription} cache not found. Will start with empty.`
            )
            return
        }

        core.saveState(this.cacheResultStateKey, cacheResult)

        core.info(
            `${this.cacheDescription} restored from cache key: ${cacheResult}`
        )
        return
    }

    async save(): Promise<void> {
        if (!this.cacheOutputExists()) {
            core.debug(`No ${this.cacheDescription} to cache.`)
            return
        }

        const cacheKey = core.getState(this.cacheKeyStateKey)
        const cacheResult = core.getState(this.cacheResultStateKey)

        if (!cacheKey) {
            core.info(
                `${this.cacheDescription} existed prior to cache restore. Not saving.`
            )
            return
        }

        if (cacheResult && cacheKey === cacheResult) {
            core.info(
                `Cache hit occurred on the cache key ${cacheKey}, not saving cache.`
            )
            return
        }

        core.info(
            `Caching ${this.cacheDescription} with cache key: ${cacheKey}`
        )
        try {
            await cache.saveCache(this.getCachePath(), cacheKey)
        } catch (error) {
            // Fail on validation errors or non-errors (the latter to keep Typescript happy)
            if (
                error instanceof cache.ValidationError ||
                !(error instanceof Error)
            ) {
                throw error
            }
            core.warning(error.message)
        }

        return
    }

    protected abstract cacheOutputExists(): boolean
    protected abstract getCachePath(): string[]
}

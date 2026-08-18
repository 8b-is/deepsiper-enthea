import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import pg from 'pg'
import { LOADER_SMOKE_TEST_TIMEOUT_MS, runLoaderSmoke } from '@deepseek-ai/dsh-loader-smoke'

// The ROYAL-WHALE wiring step: the real Postgres sidecar (session-persistence
// backend + crabcc durable cache) exercised through one headless composition.
// Requires a reachable local Postgres; self-skips when none is configured, so
// CI without a bus stays green.
const PG_URL = process.env.ROYAL_WHALE_PG_URL ?? 'postgres://dsh:dsh@localhost:15432/dsh_bus'

const driver = fileURLToPath(new URL(
  '../../../../examples/headless-agent/tests/fixtures/royal-whale-driver.ts',
  import.meta.url,
))
const configPath = fileURLToPath(new URL(
  '../../../../examples/headless-agent/tests/fixtures/royal-whale.cordis.yml',
  import.meta.url,
))
const repoTsconfig = fileURLToPath(new URL('../../../../tsconfig.json', import.meta.url))

async function busReachable(): Promise<boolean> {
  const pool = new pg.Pool({ connectionString: PG_URL, connectionTimeoutMillis: 2000 })
  try {
    await pool.query('SELECT 1')
    return true
  } catch {
    return false
  } finally {
    await pool.end().catch(() => {})
  }
}

const BUS_AVAILABLE = await busReachable()

describe('ROYAL-WHALE: real Postgres sidecar wiring', () => {
  it('persists sessions and serves crabcc lookups from the durable cache',
    { timeout: LOADER_SMOKE_TEST_TIMEOUT_MS, skip: !BUS_AVAILABLE },
    async () => {
      const { stdout, stderr } = await runLoaderSmoke({
        label: 'royal-whale real-bus smoke',
        tempDirPrefix: 'royal-whale-e2e-',
        binScript: driver,
        libBinScript: driver,
        configPath,
        tsconfigPath: repoTsconfig,
        env: { ROYAL_WHALE_PG_URL: PG_URL },
      })
      expect(stdout).toContain('ROYAL-WHALE OK')
      expect(stderr).not.toContain('ROYAL-WHALE FAIL')
      expect(stderr).not.toContain('UNHANDLED')
    })
})

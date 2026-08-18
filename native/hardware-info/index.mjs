import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

const SUPPORTED = (process.platform === 'darwin' && process.arch === 'arm64')
  || process.platform === 'linux'

let native = null
if (SUPPORTED) {
  try {
    native = require('./lib/index.node')
  } catch {
    native = null
  }
}

/**
 * Whether this host can report hardware introspection.
 * @returns 'supported' when the native addon loaded, 'unsupported' otherwise.
 */
export function probe() {
  return native === null ? 'unsupported' : 'supported'
}

/**
 * One synchronous hardware snapshot: system identity, CPU, and memory.
 *
 * Fields that the platform cannot report (for example vendor identifiers in
 * virtualized environments) are omitted rather than emitted as empty strings.
 * @returns the snapshot, or null when the addon is unsupported on this host.
 */
export function hardwareInfo() {
  if (native === null) return null
  return native.hardwareInfo()
}
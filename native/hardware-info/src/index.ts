/**
 * Type-safe ESM wrapper over the compiled Neon cdylib. Loading is lazy and
 * fail-closed: a missing or unsupported binary degrades to `probe() ===
 * 'unsupported'` and `hardwareInfo() === null` instead of throwing at import.
 * @module @deepseek-ai/node-addon-hardware-info
 */

import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

/** System identity fields; the addon omits fields the platform cannot report. */
export interface SystemInfo {
  /** Operating system name, e.g. "Darwin" or "Linux". */
  name?: string
  /** Human-readable OS version, e.g. "macOS 26.4.1 Tahoe". */
  osVersion?: string
  /** Kernel version, e.g. "25.4.0". */
  kernelVersion?: string
  /** Host name, e.g. "dev-main.local". */
  hostName?: string
  /** CPU architecture string, e.g. "arm64" or "x86_64". */
  cpuArch?: string
}

/** CPU identity and utilization snapshot for the first logical core. */
export interface CpuInfo {
  /** Processor brand string, e.g. "Apple M1 Pro". */
  brand?: string
  /** sysinfo model identifier; not universally meaningful on macOS. */
  name?: string
  /** Processor vendor id, e.g. "Apple" or "GenuineIntel". */
  vendorId?: string
  /** Count of logical cores as reported by sysinfo. */
  logicalCores: number
  /** Count of physical cores; may equal logicalCores on macOS. */
  physicalCores: number
  /** Current operating frequency in MHz of the first logical core; 0 when unavailable. */
  frequencyMhz: number
}

/** Memory totals in bytes as reported by sysinfo. */
export interface MemoryInfo {
  /** Total physical memory in bytes. */
  totalBytes: number
  /** Memory currently available to processes in bytes. */
  availableBytes: number
}

/** The synchronous hardware snapshot returned by {@link hardwareInfo}. */
export interface HardwareInfo {
  system: SystemInfo
  cpu: CpuInfo
  memory: MemoryInfo
}

/** Typed surface of the compiled Neon cdylib. */
interface NativeAddon {
  probe(): 'supported' | 'unsupported'
  hardwareInfo(): HardwareInfo | null
}

const require = createRequire(import.meta.url)
const nativePath = fileURLToPath(new URL('../lib/index.node', import.meta.url))

let native: NativeAddon | undefined
try {
  native = require(nativePath) as NativeAddon
} catch {
  // The cdylib is absent on unsupported hosts or before a build; the probe gates the API.
  native = undefined
}

/**
 * Whether the native addon loaded on this host.
 * @returns `'supported'` when the addon loaded, `'unsupported'` otherwise.
 */
export function probe(): 'supported' | 'unsupported' {
  return native === undefined ? 'unsupported' : 'supported'
}

/**
 * One synchronous snapshot of system, CPU, and memory state.
 * @returns the snapshot, or `null` when the addon is unsupported on this host.
 */
export function hardwareInfo(): HardwareInfo | null {
  return native === undefined ? null : native.hardwareInfo()
}

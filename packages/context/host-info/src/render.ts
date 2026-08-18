/**
 * Model-facing host hardware block rendering from an addon snapshot.
 * @module @deepseek-ai/dsh-host-info/render
 */

import type { HardwareInfo } from '@deepseek-ai/node-addon-hardware-info'

/** Compact byte count: one decimal GiB, whole MiB, raw bytes below MiB. */
export function formatBytes(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GiB`
  if (bytes >= 1024 ** 2) return `${Math.round(bytes / 1024 ** 2)} MiB`
  return `${Math.round(bytes)} B`
}

/** Comma-join a line's present fields, dropping absent or empty entries. */
function present(...fields: Array<string | undefined>): string[] {
  return fields.filter((field): field is string => field !== undefined && field.length > 0)
}

/** Render the system line, or `undefined` when no field is reportable. */
export function renderSystemLine(system: HardwareInfo['system']): string | undefined {
  const named = system.name === undefined
    ? system.osVersion
    : system.osVersion === undefined ? system.name : `${system.name} (${system.osVersion})`
  const fields = present(
    named,
    system.kernelVersion === undefined ? undefined : `kernel ${system.kernelVersion}`,
    system.cpuArch,
  )
  return fields.length === 0 ? undefined : `- System: ${fields.join(', ')}`
}

/** Render the CPU line, or `undefined` when no field is reportable. */
export function renderCpuLine(cpu: HardwareInfo['cpu']): string | undefined {
  const cores = `${cpu.logicalCores} logical / ${cpu.physicalCores} physical cores`
  const speed = cpu.frequencyMhz > 0 ? `${cores} @ ${Math.round(cpu.frequencyMhz)} MHz` : cores
  const fields = present(cpu.brand, speed)
  /* v8 ignore next 2 -- the required core counts always render at least one field */
  return fields.length === 0 ? undefined : `- CPU: ${fields.join(', ')}`
}

/** Render the memory line, or `undefined` when no memory is reportable. */
export function renderMemoryLine(memory: HardwareInfo['memory']): string | undefined {
  if (memory.totalBytes <= 0) return undefined
  return `- Memory: ${formatBytes(memory.totalBytes)} total, ${formatBytes(memory.availableBytes)} available`
}

/**
 * Render the whole host hardware block, or `''` when the host is unsupported
 * or nothing is reportable. Empty output contributes nothing to the prompt.
 * @param info - the addon snapshot, or `null` on unsupported hosts.
 * @returns the block text, or `''`.
 */
export function renderHostInfo(info: HardwareInfo | null): string {
  if (info === null) return ''
  const lines = [
    renderSystemLine(info.system),
    renderCpuLine(info.cpu),
    renderMemoryLine(info.memory),
  ].filter((line): line is string => line !== undefined)
  /* v8 ignore next 2 -- a non-null snapshot always reports a CPU line, so no block can be empty */
  return lines.length === 0 ? '' : `Host hardware:\n${lines.join('\n')}`
}

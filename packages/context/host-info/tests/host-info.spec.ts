import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import { probe } from '@deepseek-ai/node-addon-hardware-info'
import * as HostInfo from '@deepseek-ai/dsh-host-info'
import { renderHostInfo } from '@deepseek-ai/dsh-host-info/src/render.ts'

const { CONTEXT_NAME, CONTEXT_ORDER, name: pluginName } = HostInfo

const INFO = {
  system: { name: 'Darwin', osVersion: 'macOS 26.4.1 Tahoe', kernelVersion: '25.4.0', hostName: 'dev-main.local', cpuArch: 'arm64' },
  cpu: { brand: 'Apple M1 Pro', name: '1', vendorId: 'Apple', logicalCores: 8, physicalCores: 8, frequencyMhz: 3228 },
  memory: { totalBytes: 17_179_869_184, availableBytes: 8_036_958_208 },
}

describe('host-info render', () => {
  it('renders the pinned block from a full snapshot', () => {
    expect(renderHostInfo(INFO)).toBe(
      'Host hardware:\n'
      + '- System: Darwin (macOS 26.4.1 Tahoe), kernel 25.4.0, arm64\n'
      + '- CPU: Apple M1 Pro, 8 logical / 8 physical cores @ 3228 MHz\n'
      + '- Memory: 16.0 GiB total, 7.5 GiB available',
    )
  })

  it('renders nothing for an unsupported host and only present lines otherwise', () => {
    expect(renderHostInfo(null)).toBe('')
    expect(renderHostInfo({
      system: {},
      cpu: { logicalCores: 1, physicalCores: 1, frequencyMhz: 0 },
      memory: { totalBytes: 0, availableBytes: 0 },
    })).toBe('Host hardware:\n- CPU: 1 logical / 1 physical cores')
  })

  it('drops absent and non-positive fields per line', () => {
    expect(renderHostInfo({
      system: { cpuArch: 'x86_64' },
      cpu: { logicalCores: 4, physicalCores: 2, frequencyMhz: 0 },
      memory: { totalBytes: 8 * 1024 ** 3, availableBytes: 2 * 1024 ** 2 },
    })).toBe(
      'Host hardware:\n'
      + '- System: x86_64\n'
      + '- CPU: 4 logical / 2 physical cores\n'
      + '- Memory: 8.0 GiB total, 2 MiB available',
    )
  })

  it('formats small byte counts at whole units and raw bytes', () => {
    const memory = { totalBytes: 1024 * 1024, availableBytes: 512 }
    expect(renderHostInfo({
      system: { name: 'Linux' },
      cpu: { logicalCores: 1, physicalCores: 1, frequencyMhz: 0 },
      memory,
    })).toBe(
      'Host hardware:\n'
      + '- System: Linux\n'
      + '- CPU: 1 logical / 1 physical cores\n'
      + '- Memory: 1 MiB total, 512 B available',
    )
  })
})

describe('host-info plugin', () => {
  it('registers the host hardware context in the mounting scope', async () => {
    const ctx = new Context()
    await ctx.plugin(SystemPrompt, { includeHarnessIdentity: false, persona: '' })
    await ctx.plugin(HostInfo)
    const assembly = await ctx.systemPrompt.assemble()
    const context = assembly.contexts.find(entry => entry.name === CONTEXT_NAME)
    expect(context).toBeDefined()
    expect(assembly.contexts.findIndex(entry => entry.name === CONTEXT_NAME)).toBe(0)
    if (probe() === 'supported') {
      expect(context?.text).toMatch(
        /^Host hardware:\n- System: [^\n]+\n- CPU: [^\n]+\n- Memory: [^\n]+ total, [^\n]+ available$/,
      )
    } else {
      expect(context?.text).toBe('')
    }
  })

  it('exports the stable plugin identity and ordered slot', () => {
    expect(pluginName).toBe('host-info')
    expect(CONTEXT_NAME).toBe('host:info')
    expect(CONTEXT_ORDER).toBe(5)
  })
})

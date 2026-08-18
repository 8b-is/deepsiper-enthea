import { test } from 'node:test'
import assert from 'node:assert/strict'

import { hardwareInfo, probe } from '../index.mjs'

const SUPPORTED = (process.platform === 'darwin' && process.arch === 'arm64')
  || process.platform === 'linux'

test('probe reports the host capability', () => {
  assert.equal(probe(), SUPPORTED ? 'supported' : 'unsupported')
})

test('hardwareInfo returns null on unsupported hosts', { skip: SUPPORTED }, () => {
  assert.equal(hardwareInfo(), null)
})

test('hardwareInfo reports a live hardware snapshot', { skip: !SUPPORTED }, () => {
  const info = hardwareInfo()
  assert.ok(info !== null)

  assert.equal(typeof info.system.name, 'string')
  assert.ok(info.system.name.length > 0)
  assert.equal(typeof info.system.cpuArch, 'string')
  assert.ok(info.system.cpuArch.length > 0)

  assert.ok(info.cpu.logicalCores >= 1)
  assert.ok(info.cpu.physicalCores >= 1)
  assert.ok(info.cpu.physicalCores <= info.cpu.logicalCores)
  assert.ok(info.cpu.frequencyMhz > 0)

  assert.ok(info.memory.totalBytes > 0)
  assert.ok(info.memory.availableBytes > 0)
  assert.ok(info.memory.availableBytes <= info.memory.totalBytes)
})
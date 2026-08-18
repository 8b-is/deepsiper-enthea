#!/usr/bin/env node
/** Test driver that sends one turn through one Headless Loader composition. */

import { boot, resolveConfigPath } from '@deepseek-ai/dsh-app-boot'
import { runFixtureTurn } from '@deepseek-ai/dsh-loader-smoke'

const configPath = process.argv[2]
if (configPath === undefined) throw new Error('host-info driver requires a config path')

const ctx = await boot('host-info-e2e', resolveConfigPath(configPath, undefined))
try {
  await runFixtureTurn(ctx, { task: 'first' })
} finally {
  await ctx.fiber.dispose()
}

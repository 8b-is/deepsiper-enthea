/**
 * Web application entry for Deepsiper Enthea.
 * Boots the interactive landing page and evaluation dashboard when standalone,
 * or boots the full client shell when window.__DSH_BOOT__ is injected by `dsh web`.
 */
import React from 'react'
import { createRoot } from 'react-dom/client'
import { AppWebEntry } from '@deepseek-ai/dsh-client-web'
import { App } from './App'

const el = document.getElementById('root')
if (el === null) throw new Error('web app: missing #root')

const hasBootManifest = typeof window !== 'undefined'
  && (window as unknown as { __DSH_BOOT__?: unknown }).__DSH_BOOT__ !== undefined

if (hasBootManifest) {
  void new AppWebEntry(el).run()
} else {
  const root = createRoot(el)
  root.render(React.createElement(App))
}

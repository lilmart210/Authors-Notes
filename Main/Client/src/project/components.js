// Optional programs the app downloads on first use (Pandoc, the AI engine), and
// the progress of every download (models too). The Rust side pins each version
// and checks its hash; see src-tauri/src/components.rs.

import { createSignal } from 'solid-js'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'

export const COMPONENT_NAMES = { pandoc: 'Pandoc', engine: 'AI engine' }

// download id → { received, total } while it runs
const [DOWNLOADS, SET_DOWNLOADS] = createSignal({})
export const Downloads = DOWNLOADS

listen('download-progress', (event) => {
  const { id, received, total } = event.payload
  SET_DOWNLOADS((all) => ({ ...all, [id]: { received, total } }))
}).catch(() => {})

export function endDownload(id) {
  SET_DOWNLOADS((all) => {
    const next = { ...all }
    delete next[id]
    return next
  })
}

export const downloadPercent = (id) => {
  const progress = DOWNLOADS()[id]
  return progress && progress.total ? Math.min(100, (progress.received / progress.total) * 100) : 0
}

// { installed, version, bytes }
export const componentStatus = (name) => invoke('component_status', { name })

const installing = new Map() // name → promise, so two callers share one download

async function install(name) {
  if ((await componentStatus(name)).installed) return
  SET_DOWNLOADS((all) => ({ ...all, [name]: all[name] || { received: 0, total: 0 } }))
  try {
    await invoke('component_install', { name })
  } finally {
    endDownload(name)
  }
}

// Make sure a component is installed, downloading it if needed.
export function ensureComponent(name) {
  if (!installing.has(name)) installing.set(name, install(name).finally(() => installing.delete(name)))
  return installing.get(name)
}

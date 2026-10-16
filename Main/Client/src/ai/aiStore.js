// Local AI, app-wide (one set of models serves every book): the models folder,
// which models are downloaded, which one does each job, and talking to a running
// model. Model servers are started by the Rust side (src-tauri/src/llm.rs).

import { createSignal } from 'solid-js'
import { invoke, Channel } from '@tauri-apps/api/core'
import { open } from '@tauri-apps/plugin-dialog'
import { AI_MODELS, AI_TASKS } from './catalog.js'
import { ensureComponent, endDownload } from '../project/components.js'
import { showToast } from '../components/Toast.jsx'

// Context sizes: autocomplete only needs the last few paragraphs.
const CONTEXT = { complete: 2048, assist: 8192 }
const BLANK_TASKS = Object.fromEntries(AI_TASKS.map(([task]) => [task, '']))

const [SETTINGS, SET_SETTINGS] = createSignal({ modelsDir: '', tasks: { ...BLANK_TASKS } })
const [LOCAL_MODELS, SET_LOCAL_MODELS] = createSignal([]) // [{ file, path, bytes }]
const [FOLDER_ERROR, SET_FOLDER_ERROR] = createSignal('')
export const Settings = SETTINGS
export const LocalModels = LOCAL_MODELS
export const FolderError = FOLDER_ERROR

let loading = null

// Read the settings and the models folder once (later calls reuse the first).
export function loadAi() {
  loading ||= (async () => {
    const saved = await invoke('settings_get')
    const modelsDir = saved.modelsDir || (await invoke('models_default_dir'))
    SET_SETTINGS({ ...saved, modelsDir, tasks: { ...BLANK_TASKS, ...(saved.tasks || {}) } })
    await refreshModels()
  })().catch((err) => {
    loading = null
    throw err
  })
  return loading
}

export async function refreshModels() {
  try {
    SET_LOCAL_MODELS(await invoke('models_list', { dir: SETTINGS().modelsDir }))
    SET_FOLDER_ERROR('')
  } catch (err) {
    SET_LOCAL_MODELS([])
    SET_FOLDER_ERROR(String(err?.message || err))
  }
}

function saveSettings(next) {
  SET_SETTINGS(next)
  return invoke('settings_set', { settings: next })
}

export const isDownloaded = (file) => LOCAL_MODELS().some((model) => model.file === file)
export const bytesInFolder = () => LOCAL_MODELS().reduce((sum, model) => sum + model.bytes, 0)

// Models in the folder that aren't in the catalog (copied there by hand).
export const otherModels = () => LOCAL_MODELS().filter((local) => !AI_MODELS.some((model) => model.file === local.file))

export async function chooseModelsDir() {
  const dir = await open({ directory: true, defaultPath: SETTINGS().modelsDir || undefined })
  if (!dir || dir === SETTINGS().modelsDir) return
  await saveSettings({ ...SETTINGS(), modelsDir: dir })
  await refreshModels()
}

export function setTask(task, file) {
  return saveSettings({ ...SETTINGS(), tasks: { ...SETTINGS().tasks, [task]: file } })
}

// Download a catalog model into the models folder (and the engine, the first time).
export async function downloadModel(model) {
  const engine = ensureComponent('engine').catch((err) => {
    showToast(`Couldn't download the AI engine: ${err?.message || err}`)
  })
  try {
    await invoke('model_download', {
      dir: SETTINGS().modelsDir, id: model.id, url: model.url, file: model.file, sha256: model.sha256, bytes: model.bytes,
    })
  } catch (err) {
    if (String(err) !== 'cancelled') showToast(`${model.name}: ${err?.message || err}`)
    return
  } finally {
    endDownload(model.id)
  }
  await refreshModels()
  const tasks = { ...SETTINGS().tasks }
  for (const [task] of AI_TASKS) if (!tasks[task] || !isDownloaded(tasks[task])) tasks[task] = model.file
  await saveSettings({ ...SETTINGS(), tasks })
  await engine
  showToast(`${model.name} downloaded`)
}

export const cancelDownload = (id) => invoke('download_cancel', { id })

export async function removeModel(file) {
  const local = LOCAL_MODELS().find((model) => model.file === file)
  if (local) await invoke('llm_stop', { model: local.path }).catch(() => {})
  await invoke('models_remove', { dir: SETTINGS().modelsDir, file })
  await refreshModels()
  const tasks = { ...SETTINGS().tasks }
  const fallback = LOCAL_MODELS()[0]?.file || ''
  for (const [task] of AI_TASKS) if (tasks[task] === file) tasks[task] = fallback
  await saveSettings({ ...SETTINGS(), tasks })
}

// ------------------------------------------------------------------ talking to a model
// The downloaded model assigned to a job, or null when the job is off.
export function modelFor(task) {
  const file = SETTINGS().tasks[task]
  return (file && LOCAL_MODELS().find((model) => model.file === file)) || null
}

let requestCount = 0

// POST to the job's model server; `onEvent` gets each streamed event (or the one
// reply). Starts the engine and the model on first use. Abort with `signal`.
export async function requestModel(task, path, body, onEvent, { signal } = {}) {
  await loadAi()
  const model = modelFor(task)
  if (!model) throw new Error('No model is set for this')
  await ensureComponent('engine')
  const port = await invoke('llm_start', { model: model.path, ctx: CONTEXT[task] })
  if (signal?.aborted) return
  const requestId = `r${Date.now()}-${++requestCount}`
  const channel = new Channel()
  channel.onmessage = onEvent
  const stop = () => invoke('llm_cancel', { requestId }).catch(() => {})
  signal?.addEventListener('abort', stop, { once: true })
  try {
    await invoke('llm_request', { requestId, port, path, body, onEvent: channel })
  } finally {
    signal?.removeEventListener('abort', stop)
  }
}

// Start loading a job's model ahead of the first request (no-op when it's off).
export function warmUp(task) {
  const model = modelFor(task)
  if (!model) return
  ensureComponent('engine').then(() => invoke('llm_start', { model: model.path, ctx: CONTEXT[task] })).catch(() => {})
}

// Continue the prose from `before`: a few words, to the end of the sentence at most.
export async function suggestContinuation(before, { signal } = {}) {
  let text = ''
  const body = { prompt: before, n_predict: 24, temperature: 0.5, top_p: 0.9, stop: ['\n'], cache_prompt: true, stream: false }
  await requestModel('complete', '/completion', body, (reply) => { text = reply?.content || '' }, { signal })
  return text
}

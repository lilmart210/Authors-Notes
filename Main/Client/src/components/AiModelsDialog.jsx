import { For, Show, createSignal, onCleanup, onMount } from 'solid-js'
import { AI_MODELS, AI_TAGS, AI_TASKS, modelForFile } from '../ai/catalog.js'
import {
  Settings, LocalModels, FolderError, loadAi, refreshModels, chooseModelsDir, setTask, downloadModel, cancelDownload,
  removeModel, isDownloaded, bytesInFolder, otherModels,
} from '../ai/aiStore.js'
import { Downloads, downloadPercent } from '../project/components.js'
import { CheckIcon, DownloadIcon, XIcon } from './icons.jsx'
import { showToast } from './Toast.jsx'
import './BookPages.css'
import './Drafts.css'
import './AiModelsDialog.css'

const FILTERS = [['', 'All'], ['installed', 'Downloaded'], ['tools', 'Tool calling'], ['cpu', 'Runs on CPU'], ['long', 'Long context']]

const formatGb = (bytes) => `${(Math.round(bytes / 1e8) / 10).toFixed(1)} GB`
const displayName = (file) => modelForFile(file)?.name || file.replace(/\.gguf$/i, '')

// Tools → AI models: what each job uses, where models live, and the catalog.
// Nothing ships installed; any downloaded model can do any job.
export default function AiModelsDialog(props) {
  // 2. Signals
  const [Query, SetQuery] = createSignal('')
  const [Filter, SetFilter] = createSignal('')

  // 3. onMount
  onMount(() => {
    loadAi().then(refreshModels).catch((err) => showToast(String(err?.message || err)))
    window.addEventListener('keydown', handleKeyDown)
  })
  onCleanup(() => window.removeEventListener('keydown', handleKeyDown))

  // 5. Handlers
  function handleKeyDown(event) {
    if (event.key === 'Escape') props.onClose()
  }
  async function handleRemove(file) {
    try {
      await removeModel(file)
    } catch (err) {
      showToast(String(err?.message || err))
    }
  }
  async function handleChangeFolder() {
    try {
      await chooseModelsDir()
    } catch (err) {
      showToast(String(err?.message || err))
    }
  }

  // 6. JSX-helper builders
  const usedLabel = () => (bytesInFolder() ? `${formatGb(bytesInFolder())} in the models folder` : 'Nothing downloaded')
  const downloaded = () => LocalModels()
  const matchesQuery = (text) => !Query() || text.toLowerCase().includes(Query().trim().toLowerCase())
  const catalogRows = () => AI_MODELS.filter((model) => matchesQuery(`${model.name} ${model.about}`)
    && (!Filter() || (Filter() === 'installed' ? isDownloaded(model.file) : model.tags.includes(Filter()))))
  const otherRows = () => (Filter() && Filter() !== 'installed' ? [] : otherModels().filter((model) => matchesQuery(model.file)))
  const assistWarning = () => {
    const model = modelForFile(Settings().tasks.assist)
    return Boolean(model && !model.tags.includes('tools'))
  }

  const ModelAction = (actionProps) => (
    <Show
      when={!isDownloaded(actionProps.model.file)}
      fallback={<button class="btn sm danger" onClick={() => handleRemove(actionProps.model.file)}>Remove</button>}
    >
      <Show
        when={Downloads()[actionProps.model.id]}
        fallback={<button class="pubbtn" onClick={() => downloadModel(actionProps.model)}><DownloadIcon size={12} /> Download</button>}
      >
        <div class="aiprog">
          <div class="bar"><i style={{ width: `${downloadPercent(actionProps.model.id)}%` }} /></div>
          <span class="counts">{Math.floor(downloadPercent(actionProps.model.id))}%</span>
          <button class="aistop" title="Stop the download" onClick={() => cancelDownload(actionProps.model.id)}><XIcon size={13} /></button>
        </div>
      </Show>
    </Show>
  )

  // 7. JSX
  return (
    <div class="modal-overlay" onClick={() => props.onClose()}>
      <div class="modal aimodal" role="dialog" aria-label="AI models" onClick={(e) => e.stopPropagation()}>
        <div class="modal-head">AI models <span class="counts aiused">{usedLabel()}</span></div>
        <div class="aitop">
          <div class="flabel">Use for</div>
          <div>
            <For each={AI_TASKS}>
              {([task, label, what]) => (
                <div class="aitask">
                  <div>
                    <div class="ainame">{label}</div>
                    <div class="aigood">{what}</div>
                    <Show when={task === 'assist' && assistWarning()}>
                      <div class="aiwarn">This model can chat and rewrite, but can’t add World entries or fill data banks.</div>
                    </Show>
                  </div>
                  <select class="fbox" value={Settings().tasks[task] || ''} disabled={!downloaded().length} onChange={(e) => setTask(task, e.currentTarget.value)}>
                    <option value="">{downloaded().length ? 'Off' : 'Download a model first'}</option>
                    <For each={downloaded()}>{(model) => <option value={model.file}>{displayName(model.file)}</option>}</For>
                  </select>
                </div>
              )}
            </For>
          </div>
          <div class="flabel">Models folder</div>
          <div class="aifolder">
            <span class="aipath mono" title={Settings().modelsDir}>{Settings().modelsDir}</span>
            <button class="btn sm" onClick={handleChangeFolder}>Change…</button>
          </div>
          <Show when={FolderError()}><div class="aiwarn">{FolderError()}</div></Show>
        </div>
        <div class="aifilter">
          <input class="fbox aiq" placeholder="Search models" aria-label="Search models" value={Query()} onInput={(e) => SetQuery(e.currentTarget.value)} />
          <div class="chips">
            <For each={FILTERS}>
              {([value, label]) => <button class="chip toggle" classList={{ on: Filter() === value }} onClick={() => SetFilter(value)}>{label}</button>}
            </For>
          </div>
          <span class="example">example list</span>
        </div>
        <div class="ailist">
          <Show when={catalogRows().length || otherRows().length} fallback={<div class="dock-empty">No models match.</div>}>
            <For each={catalogRows()}>
              {(model) => (
                <div class="airow">
                  <div class="aiinfo">
                    <div class="ainame">
                      {model.name}
                      <span class="aisize" classList={{ ok: isDownloaded(model.file) }}>{model.gb} GB<Show when={isDownloaded(model.file)}> <CheckIcon size={13} /></Show></span>
                    </div>
                    <div class="aigood">{model.about}</div>
                    <Show when={model.tags.length}>
                      <div class="aitags">
                        <For each={model.tags}>{(tag) => <span class={`aitag ${tag}`} title={AI_TAGS[tag][1]}>{AI_TAGS[tag][0]}</span>}</For>
                      </div>
                    </Show>
                  </div>
                  <div class="aiact"><ModelAction model={model} /></div>
                </div>
              )}
            </For>
            <For each={otherRows()}>
              {(model) => (
                <div class="airow">
                  <div class="aiinfo">
                    <div class="ainame">{displayName(model.file)}<span class="aisize ok">{formatGb(model.bytes)} <CheckIcon size={13} /></span></div>
                  </div>
                  <div class="aiact"><button class="btn sm danger" onClick={() => handleRemove(model.file)}>Remove</button></div>
                </div>
              )}
            </For>
          </Show>
        </div>
        <div class="modal-foot">
          <span class="counts left">{AI_MODELS.length} models · any downloaded model can do autocomplete or assistant</span>
          <button class="modal-cancel" onClick={() => props.onClose()}>Close</button>
        </div>
      </div>
    </div>
  )
}

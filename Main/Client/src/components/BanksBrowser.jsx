import { For, Show } from 'solid-js'
import { useProject } from '../project/ProjectContext.jsx'
import { PlusIcon } from './icons.jsx'
import './BanksBrowser.css'

export default function BanksBrowser() {
  const { Banks, CurrentDoc, CreateBank, ImportBank, OpenBank } = useProject()

  return (
    <div class="bk">
      <div class="bk-head">
        <span class="bk-title">Data Banks</span>
        <button class="bk-new" title="New bank" onClick={() => CreateBank()}>
          <PlusIcon size={15} />
        </button>
      </div>
      <div class="bk-actions">
        <button class="bk-import" onClick={ImportBank}>Import CSV…</button>
      </div>
      <div class="bk-list">
        <Show when={Banks().length} fallback={<div class="bk-empty">No banks yet. Use ＋ or import a CSV.</div>}>
          <For each={Banks()}>
            {(bank) => (
              <div
                class="bk-row"
                classList={{ sel: CurrentDoc.kind === 'bank' && CurrentDoc.id === bank.file }}
                onClick={() => OpenBank(bank)}
              >
                <span class="bk-name">{bank.name}</span>
                <span class="bk-count">{bank.entries.length}</span>
              </div>
            )}
          </For>
        </Show>
      </div>
    </div>
  )
}

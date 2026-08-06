import { For, Show, createSignal } from 'solid-js'
import { useProject } from '../project/ProjectContext.jsx'
import './SearchPanel.css'

export default function SearchPanel() {
  const { SearchProject } = useProject()
  const [Query, SetQuery] = createSignal('')

  const results = () => SearchProject(Query())

  return (
    <div class="spn">
      <div class="spn-head">
        <input
          class="spn-in"
          placeholder="Search project…"
          value={Query()}
          onInput={(e) => SetQuery(e.currentTarget.value)}
        />
      </div>
      <div class="spn-body">
        <Show when={Query().trim()} fallback={<div class="spn-empty">Search chapters, characters, and banks.</div>}>
          <Show when={results().direct.length}>
            <div class="spn-tier">Direct matches</div>
            <For each={results().direct}>
              {(r) => (
                <div class="spn-item" onClick={r.open}>
                  <span class="spn-k">{r.kind}</span>
                  <span class="spn-m">{r.label}</span>
                </div>
              )}
            </For>
          </Show>
          <Show when={results().content.length}>
            <div class="spn-tier">In content</div>
            <For each={results().content}>
              {(r) => (
                <div class="spn-item" onClick={r.open}>
                  <span class="spn-k">{r.kind}</span>
                  <span class="spn-col">
                    <span class="spn-m">{r.label}</span>
                    <span class="spn-snip">{r.sub}</span>
                  </span>
                </div>
              )}
            </For>
          </Show>
          <Show when={!results().direct.length && !results().content.length}>
            <div class="spn-empty">No matches.</div>
          </Show>
        </Show>
      </div>
    </div>
  )
}

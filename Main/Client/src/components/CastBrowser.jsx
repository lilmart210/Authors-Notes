import { For, Show, createSignal } from 'solid-js'
import { useProject } from '../project/ProjectContext.jsx'
import { avatarColor, avatarInitial } from './avatar.js'
import { PlusIcon, UsersIcon } from './icons.jsx'
import BibleTree from './BibleTree.jsx'
import './CastBrowser.css'

export default function CastBrowser() {
  const { Entities, CurrentDoc, CreateEntity, OpenEntity } = useProject()

  // 2. Signals
  const [Query, SetQuery] = createSignal('')

  // 6. JSX-helper builders
  const aliasForms = (entity) => (entity.meta.aliases || []).map((a) => (typeof a === 'object' ? a.form : a))
  const matches = () => {
    const q = Query().trim().toLowerCase()
    if (!q) return []
    return Entities().filter((e) => [e.meta.name, ...aliasForms(e)].join(' ').toLowerCase().includes(q))
  }
  const subline = (entity) => {
    const aliases = entity.meta.aliases || []
    if (aliases.length) return `${entity.meta.type || 'Entity'} · +${aliases.length} alias${aliases.length === 1 ? '' : 'es'}`
    return entity.meta.type || 'Entity'
  }

  return (
    <div class="cb">
      <div class="cb-head">
        <span class="cb-title">Cast</span>
        <button class="cb-new" title="New character" onClick={() => CreateEntity('New character', 'Character')}>
          <PlusIcon size={15} />
        </button>
        <button class="cb-new" title="New collection" onClick={() => CreateEntity('New collection', 'group')}>
          <UsersIcon size={15} />
        </button>
      </div>

      <div class="cb-search">
        <input placeholder="Filter entities…" value={Query()} onInput={(e) => SetQuery(e.currentTarget.value)} />
      </div>

      <div class="cb-list">
        <Show when={Query().trim()} fallback={<div class="tree"><BibleTree depth={1} /></div>}>
          <For each={matches()} fallback={<div class="cb-empty">No matches.</div>}>
            {(entity) => (
              <div class="cb-row" classList={{ sel: CurrentDoc.id === entity.meta.id }} onClick={() => OpenEntity(entity)}>
                <span class="cb-av" style={{ background: avatarColor(entity.meta.id) }}>{avatarInitial(entity.meta.name)}</span>
                <div class="cb-who">
                  <div class="cb-name">{entity.meta.name}</div>
                  <div class="cb-sub">{subline(entity)}</div>
                </div>
              </div>
            )}
          </For>
        </Show>
      </div>
    </div>
  )
}

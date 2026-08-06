import { For, Show, createSignal } from 'solid-js'
import { useProject } from '../project/ProjectContext.jsx'
import { avatarColor, avatarInitial } from './avatar.js'
import Editor from './Editor.jsx'
import EntitySelect from './EntitySelect.jsx'
import './GroupPage.css'

const COLS = 3
const COL_W = 180
const ROW_H = 140

export default function GroupPage() {
  const { CurrentDoc, Entities, EntityById, UpdateMeta, UpdateBody, GenerateMember, MembersOf, AddSubPage, PreviewFor, Banks, OpenEntityById } = useProject()

  // 2. Signals — local form state for adding a relationship + the column view
  const [RelFrom, SetRelFrom] = createSignal('')
  const [RelTo, SetRelTo] = createSignal('')
  const [RelLabel, SetRelLabel] = createSignal('')
  const [ColKey, SetColKey] = createSignal('')

  // 6. accessors
  const attributes = () => CurrentDoc.meta?.attributes || []
  const members = () => MembersOf(CurrentDoc.meta)
  const explicitMembers = () => CurrentDoc.meta?.members || []
  const relationships = () => CurrentDoc.meta?.relationships || []
  const rule = () => CurrentDoc.meta?.memberRule || {}
  const isRuleMember = (id) => !explicitMembers().includes(id)
  const setRule = (field, value) => UpdateMeta('memberRule', { ...rule(), [field]: value })

  // Walk the inherits-from chain (cycle-safe) collecting parent attributes.
  const inheritedAttributes = () => {
    const acc = []
    const seen = new Set([CurrentDoc.id])
    let parentId = CurrentDoc.meta?.inherits
    while (parentId && !seen.has(parentId)) {
      seen.add(parentId)
      const parent = EntityById(parentId)
      if (!parent) break
      for (const attr of parent.meta?.attributes || []) if (attr.key) acc.push({ ...attr, from: parent.meta.name })
      parentId = parent.meta?.inherits
    }
    return acc
  }
  const perMemberKeys = () => {
    const own = attributes().filter((a) => a.mode !== 'fixed' && a.key).map((a) => a.key)
    const inherited = inheritedAttributes().filter((a) => a.mode !== 'fixed' && a.key).map((a) => a.key)
    return Array.from(new Set([...inherited, ...own]))
  }

  const candidates = () =>
    Entities().filter((e) => e.meta.type !== 'group' && !members().includes(e.meta.id))
  const inheritableGroups = () => Entities().filter((e) => e.meta.type === 'group' && e.meta.id !== CurrentDoc.id)

  // node positions keyed by entity id (deterministic grid layout)
  const positions = () => {
    const map = {}
    members().forEach((id, i) => {
      map[id] = { x: (i % COLS) * COL_W + COL_W / 2, y: Math.floor(i / COLS) * ROW_H + 70 }
    })
    return map
  }
  const canvasWidth = () => COLS * COL_W
  const canvasHeight = () => Math.max(1, Math.ceil(members().length / COLS)) * ROW_H + 10

  // 5. handlers
  const addAttribute = () =>
    UpdateMeta('attributes', [...attributes(), { key: '', mode: 'per-member', value: '' }])
  const updateAttribute = (i, patch) =>
    UpdateMeta('attributes', attributes().map((a, idx) => (idx === i ? { ...a, ...patch } : a)))
  const removeAttribute = (i) => UpdateMeta('attributes', attributes().filter((_, idx) => idx !== i))

  const addMember = (id) => { if (id) UpdateMeta('members', [...members(), id]) }
  const removeMember = (id) => {
    UpdateMeta('members', members().filter((m) => m !== id))
    UpdateMeta('relationships', relationships().filter((r) => r.from !== id && r.to !== id))
  }

  function handleAddRelationship() {
    if (!RelFrom() || !RelTo() || RelFrom() === RelTo()) return
    UpdateMeta('relationships', [...relationships(), { from: RelFrom(), to: RelTo(), label: RelLabel() || 'related' }])
    SetRelLabel('')
  }
  const removeRelationship = (i) => UpdateMeta('relationships', relationships().filter((_, idx) => idx !== i))

  const memberEntities = () => members().map((id) => EntityById(id)).filter(Boolean)
  const memberName = (id) => EntityById(id)?.meta.name || 'Unknown'
  const memberValue = (id, key) => EntityById(id)?.meta[key] ?? ''
  const activeCol = () => ColKey() || perMemberKeys()[0] || ''

  const self = () => EntityById(CurrentDoc.id)
  const subPages = () => (self()?.childIds || []).map((id) => EntityById(id)).filter(Boolean)
  const addPage = () => AddSubPage(CurrentDoc.id, 'New page', 'Lore')

  return (
    <div class="gp">
      <div class="gp-page">
        <div class="gp-head">
          <span class="gp-crest" style={{ background: avatarColor(CurrentDoc.id) }}>
            {avatarInitial(CurrentDoc.meta?.name)}
          </span>
          <div class="gp-headmain">
            <input class="gp-name" value={CurrentDoc.meta?.name || ''} placeholder="Group name"
              onInput={(e) => UpdateMeta('name', e.currentTarget.value)} />
            <div class="gp-sub">Group · {members().length} member{members().length === 1 ? '' : 's'}</div>
          </div>
        </div>

        <div class="gp-sec">
          <div class="gp-lab">Shared attributes <button class="gp-add" onClick={addAttribute}>＋ add</button></div>
          <div class="gp-note">Members inherit these. “Fixed” shares one value; “per-member” gives each member their own slot.</div>
          <For each={attributes()}>
            {(attr, i) => (
              <div class="gp-attr">
                <input class="gp-in" placeholder="attribute" value={attr.key}
                  onInput={(e) => updateAttribute(i(), { key: e.currentTarget.value })} />
                <select class="gp-sel" value={attr.mode} onChange={(e) => updateAttribute(i(), { mode: e.currentTarget.value })}>
                  <option value="per-member">per-member</option>
                  <option value="fixed">fixed</option>
                </select>
                <Show when={attr.mode === 'fixed'}>
                  <input class="gp-in" placeholder="value" value={attr.value || ''}
                    onInput={(e) => updateAttribute(i(), { value: e.currentTarget.value })} />
                </Show>
                <button class="gp-x" onClick={() => removeAttribute(i())}>×</button>
              </div>
            )}
          </For>
        </div>

        <div class="gp-sec">
          <div class="gp-lab">Inherits from</div>
          <EntitySelect value={CurrentDoc.meta?.inherits || ''} onSelect={(id) => UpdateMeta('inherits', id)} only="group" exclude={[CurrentDoc.id]} allowClear placeholder="— none —" clearLabel="— none —" />
          <Show when={inheritedAttributes().length}>
            <div class="gp-note">Cascaded down — each member also gets these slots.</div>
            <For each={inheritedAttributes()}>
              {(attr) => (
                <div class="gp-attr gp-inherited">
                  <span class="gp-an">{attr.key}</span>
                  <span class="gp-tag">{attr.mode === 'fixed' ? `fixed “${attr.value || ''}”` : 'per-member'}</span>
                  <span class="gp-from">from {attr.from}</span>
                </div>
              )}
            </For>
          </Show>
        </div>

        <div class="gp-sec">
          <div class="gp-lab">Members</div>
          <div class="gp-rule">
            <span class="gp-rulelab">Auto-include where</span>
            <input class="gp-in gp-rulein" placeholder="attribute (e.g. Race)" value={rule().key || ''} onInput={(e) => setRule('key', e.currentTarget.value)} />
            <span class="gp-ruleeq">=</span>
            <input class="gp-in gp-rulein" placeholder="value (e.g. Red Demon)" value={rule().value || ''} onInput={(e) => setRule('value', e.currentTarget.value)} />
          </div>
          <For each={members()} fallback={<div class="gp-empty">No members yet.</div>}>
            {(id) => (
              <div class="gp-member">
                <span class="gp-av" style={{ background: avatarColor(id) }}>{avatarInitial(memberName(id))}</span>
                <div class="gp-mwho">
                  <div class="gp-mname">{memberName(id)}</div>
                  <Show when={perMemberKeys().length}>
                    <div class="gp-mattrs">
                      <For each={perMemberKeys()}>
                        {(key) => (
                          <span class="gp-chip">{key}: <b>{memberValue(id, key) || '—'}</b></span>
                        )}
                      </For>
                    </div>
                  </Show>
                </div>
                <Show when={isRuleMember(id)} fallback={<button class="gp-x" onClick={() => removeMember(id)}>×</button>}>
                  <span class="gp-ruletag" title="Included automatically by the membership rule">rule</span>
                </Show>
              </div>
            )}
          </For>
          <div class="gp-memberadd">
            <EntitySelect value="" placeholder="Add member…" only="nongroup" exclude={members()} onSelect={(id) => id && addMember(id)} />
            <button class="gp-gen" title="Create a member populated from the data banks" onClick={GenerateMember}>✦ Generate from banks</button>
          </div>
        </div>

        <Show when={perMemberKeys().length && members().length}>
          <div class="gp-sec">
            <div class="gp-lab">
              By attribute
              <select class="gp-colsel" value={activeCol()} onChange={(e) => SetColKey(e.currentTarget.value)}>
                <For each={perMemberKeys()}>{(key) => <option value={key}>{key}</option>}</For>
              </select>
            </div>
            <For each={members()}>
              {(id) => (
                <div class="gp-colrow">
                  <span class="gp-av gp-avsm" style={{ background: avatarColor(id) }}>{avatarInitial(memberName(id))}</span>
                  <span class="gp-colname">{memberName(id)}</span>
                  <span class="gp-colval" classList={{ unset: !memberValue(id, activeCol()) }}>
                    {memberValue(id, activeCol()) || '— unset —'}
                  </span>
                </div>
              )}
            </For>
          </div>
        </Show>

        <div class="gp-sec">
          <div class="gp-lab">Relationship graph</div>
          <div class="gp-relform">
            <EntitySelect value={RelFrom()} onSelect={SetRelFrom} pool={memberEntities()} placeholder="from…" />
            <input class="gp-in gp-rellabel" placeholder="label (e.g. mother)" value={RelLabel()}
              onInput={(e) => SetRelLabel(e.currentTarget.value)} />
            <EntitySelect value={RelTo()} onSelect={SetRelTo} pool={memberEntities()} placeholder="to…" />
            <button class="gp-reladd" onClick={handleAddRelationship}>Add</button>
          </div>

          <Show when={members().length} fallback={<div class="gp-empty">Add members to build the graph.</div>}>
            <div class="gp-canvas" style={{ height: `${canvasHeight()}px` }}>
              <svg class="gp-edges" viewBox={`0 0 ${canvasWidth()} ${canvasHeight()}`} preserveAspectRatio="xMidYMid meet">
                <For each={relationships()}>
                  {(rel) => {
                    const p = positions()
                    const a = p[rel.from]
                    const b = p[rel.to]
                    return (
                      <Show when={a && b}>
                        <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="var(--edge, rgba(127,127,127,.4))" stroke-width="1.5" />
                        <text x={(a.x + b.x) / 2} y={(a.y + b.y) / 2 - 4} class="gp-elabel" text-anchor="middle">{rel.label}</text>
                      </Show>
                    )
                  }}
                </For>
              </svg>
              <For each={members()}>
                {(id, i) => (
                  <div class="gp-node" style={{ left: `${(i() % COLS) * COL_W + COL_W / 2}px`, top: `${Math.floor(i() / COLS) * ROW_H + 70}px` }}>
                    <span class="gp-nodeav" style={{ background: avatarColor(id) }}>{avatarInitial(memberName(id))}</span>
                    <div class="gp-nodename">{memberName(id)}</div>
                  </div>
                )}
              </For>
            </div>
            <Show when={relationships().length}>
              <div class="gp-rellist">
                <For each={relationships()}>
                  {(rel, i) => (
                    <span class="gp-relpill">
                      {memberName(rel.from)} <b>{rel.label}</b> {memberName(rel.to)}
                      <button class="gp-relx" onClick={() => removeRelationship(i())}>×</button>
                    </span>
                  )}
                </For>
              </div>
            </Show>
          </Show>
        </div>

        <div class="gp-sec">
          <div class="gp-lab">Notes</div>
          <div class="ep-bodyeditor">
            <Editor doc={CurrentDoc.body} onChange={(text) => UpdateBody(text)} pageView={false}
              entities={Entities} onOpenEntity={OpenEntityById} previewFor={PreviewFor} banks={Banks} />
          </div>
        </div>

        <div class="gp-sec">
          <div class="gp-lab">Pages <button class="gp-add" onClick={addPage}>＋ add</button></div>
          <Show when={subPages().length} fallback={<div class="gp-empty">No sub-pages yet.</div>}>
            <For each={subPages()}>
              {(page) => (
                <button class="ep-page-row" onClick={() => OpenEntityById(page.meta.id)}>
                  <span class="ep-page-name">{page.meta.name}</span>
                  <span class="ep-page-type">{page.meta.type || 'Page'}</span>
                </button>
              )}
            </For>
          </Show>
        </div>
      </div>
    </div>
  )
}

import { For, Show, createSignal } from 'solid-js'
import { useProject } from '../project/ProjectContext.jsx'
import './ImportWizard.css'

export default function ImportWizard() {
  const { ImportFiles, CancelImport, PickImportFiles, PickImportFolder, RemoveImportFile, CommitImport, Busy } = useProject()

  // 2. Signals — per-row edits keyed by source path; a renumber-from start.
  const [Edits, SetEdits] = createSignal({})
  const [Selected, SetSelected] = createSignal(null)
  const [RenumberStart, SetRenumberStart] = createSignal(1)

  // 6. JSX-helper builders
  const files = () => ImportFiles()
  const selectedFile = () => files().find((f) => f.path === Selected()) || files()[0] || null

  const numberOf = (file, index) => {
    const edited = Edits()[file.path]?.number
    if (edited != null && edited !== '') return Number(edited)
    return file.number ?? index + 1
  }
  const titleOf = (file) => {
    const edited = Edits()[file.path]?.title
    return edited != null ? edited : file.title
  }
  const setEdit = (path, key, value) => SetEdits((m) => ({ ...m, [path]: { ...m[path], [key]: value } }))

  // Duplicate detection: a "chapter already exists" is two rows sharing a number.
  const numberCounts = () => {
    const counts = {}
    files().forEach((f, i) => { const n = numberOf(f, i); counts[n] = (counts[n] || 0) + 1 })
    return counts
  }
  const isDuplicate = (file, index) => numberCounts()[numberOf(file, index)] > 1
  const conflicts = () => Object.values(numberCounts()).filter((c) => c > 1).length

  const chapters = () => files().map((f, i) => ({ title: titleOf(f), number: numberOf(f, i), body: f.body }))
  const importLabel = () => {
    const count = files().length
    return count ? `Import ${count} chapter${count === 1 ? '' : 's'}` : 'Import'
  }

  // 5. Handlers
  const renumber = () => {
    const start = Number(RenumberStart()) || 1
    const next = {}
    files().forEach((f, i) => { next[f.path] = { ...Edits()[f.path], number: start + i } })
    SetEdits(next)
  }
  function handleImport() {
    if (files().length && !conflicts()) CommitImport(chapters())
  }

  return (
    <div class="iw-overlay">
      <div class="iw-modal">
        <div class="iw-head">
          <span class="iw-title">Import chapters</span>
          <button class="iw-x" onClick={CancelImport} aria-label="Close">×</button>
        </div>

        <div class="iw-source">
          <button class="iw-btn" onClick={PickImportFiles}>Select files…</button>
          <button class="iw-btn" onClick={PickImportFolder}>Add folder…</button>
          <span class="iw-count">{files().length} file{files().length === 1 ? '' : 's'}</span>
          <Show when={files().length > 1}>
            <span class="iw-renumber">
              Number from
              <input class="iw-numin small" type="number" step="0.1" value={RenumberStart()}
                onInput={(e) => SetRenumberStart(e.currentTarget.value)} />
              <button class="iw-btn small" onClick={renumber}>Apply</button>
            </span>
          </Show>
        </div>

        <Show when={files().length} fallback={<div class="iw-empty">Choose .txt files or a folder to import.</div>}>
          <div class="iw-body">
            <div class="iw-list">
              <div class="iw-listhead"><span class="iw-h-num">#</span><span>Title · source</span></div>
              <For each={files()}>
                {(file, index) => (
                  <div class="iw-row" classList={{ sel: selectedFile()?.path === file.path, dup: isDuplicate(file, index()) }}
                    onClick={() => SetSelected(file.path)}>
                    <input class="iw-numin" type="number" step="0.1" value={numberOf(file, index())}
                      onClick={(e) => e.stopPropagation()} onInput={(e) => setEdit(file.path, 'number', e.currentTarget.value)} />
                    <div class="iw-rowmain">
                      <input class="iw-titlein" value={titleOf(file)} placeholder="Chapter title"
                        onClick={(e) => e.stopPropagation()} onInput={(e) => setEdit(file.path, 'title', e.currentTarget.value)} />
                      <div class="iw-rowsub">
                        {file.name}
                        <Show when={isDuplicate(file, index())}><span class="iw-dupwarn"> · duplicate number</span></Show>
                      </div>
                    </div>
                    <button class="iw-remove" title="Remove" onClick={(e) => { e.stopPropagation(); RemoveImportFile(file.path) }}>×</button>
                  </div>
                )}
              </For>
            </div>

            <div class="iw-preview">
              <Show when={selectedFile()} fallback={<div class="iw-empty">Select a file to preview.</div>}>
                <div class="iw-pvhead">{titleOf(selectedFile())}</div>
                <div class="iw-pvbody">{selectedFile().body}</div>
              </Show>
            </div>
          </div>
        </Show>

        <div class="iw-foot">
          <Show when={conflicts()}>
            <span class="iw-conflict">⚠ {conflicts()} numbering conflict{conflicts() === 1 ? '' : 's'} — renumber to resolve</span>
          </Show>
          <span class="iw-spring"></span>
          <button class="iw-btn ghost" onClick={CancelImport}>Cancel</button>
          <button class="iw-btn primary" disabled={!files().length || Busy() || conflicts()} onClick={handleImport}>
            {importLabel()}
          </button>
        </div>
      </div>
    </div>
  )
}

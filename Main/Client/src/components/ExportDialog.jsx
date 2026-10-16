import { For, Show, createSignal, onCleanup, onMount } from 'solid-js'
import { useProject } from '../project/ProjectContext.jsx'
import { chapterLabel } from '../project/format.js'
import {
  EXPORT_FORMATS, TRIM_SIZES, DEFAULT_EXPORT_OPTIONS, exportFormat, trimSize, isBookFormat, includeAvailability,
  metadataChecks, copyrightLine, firstParagraph, serialFileName, approximateWords,
} from '../project/bookExport.js'
import { CheckIcon } from './icons.jsx'
import { showToast } from './Toast.jsx'
import './BookPages.css'
import './ExportDialog.css'

// The options last used, kept for the next time the dialog opens.
const [REMEMBERED, SET_REMEMBERED] = createSignal({ ...DEFAULT_EXPORT_OPTIONS })

const formatNumber = (n) => Number(n || 0).toLocaleString()

// Print an HTML document through the webview's print dialog (Save as PDF).
function printDocument(html) {
  const frame = document.createElement('iframe')
  frame.style.cssText = 'position:fixed;width:0;height:0;border:0;visibility:hidden'
  frame.onload = () => {
    try {
      frame.contentWindow.focus()
      frame.contentWindow.print()
    } finally {
      setTimeout(() => frame.remove(), 1000)
    }
  }
  frame.srcdoc = html
  document.body.appendChild(frame)
}

// Export book, by destination: the format on the left with what it includes and
// what it still needs from the Book pages; a preview of the first pages on the right.
export default function ExportDialog(props) {
  const { Book, BookCoverUrl, ExportPlan, ExportBook, LoadPublishedTexts } = useProject()

  // 2. Signals
  const [Options, SetOptions] = createSignal(REMEMBERED())
  const [Busy, SetBusy] = createSignal(false)
  const [Failure, SetFailure] = createSignal('')

  // 3. onMount
  onMount(() => {
    LoadPublishedTexts().catch((err) => console.error(err))
    window.addEventListener('keydown', handleKeyDown)
  })
  onCleanup(() => window.removeEventListener('keydown', handleKeyDown))

  // 5. Handlers
  function setOption(key, value) {
    SetFailure('')
    SetOptions((options) => ({ ...options, [key]: value }))
    SET_REMEMBERED(Options())
  }
  function handleKeyDown(event) {
    if (event.key === 'Escape' && !Busy()) props.onClose()
  }
  async function handleExport() {
    SetBusy(true)
    SetFailure('')
    try {
      const result = await ExportBook(Options())
      props.onClose()
      if (result.printHtml) printDocument(result.printHtml)
      showToast(result.count != null ? `Exported ${result.count} chapter files to ${result.path}` : `Exported ${result.path}`)
    } catch (err) {
      console.error(err)
      SetFailure(String(err?.message || err))
    } finally {
      SetBusy(false)
    }
  }

  // 6. JSX-helper builders
  const plan = () => ExportPlan(Options())
  const applied = () => plan().options
  const fmt = () => applied().format
  const isBook = () => isBookFormat(fmt())
  const available = () => includeAvailability(fmt(), plan().counts)
  const overview = () => Book.overview.meta
  const publishing = () => Book.publishing.meta
  const first = () => plan().chapters[0]
  const firstPara = () => (first() ? firstParagraph(first().text) : '')
  const checks = () => metadataChecks(fmt(), { overview: overview(), publishing: publishing(), blurb: Book.blurb.body, hasCover: Boolean(overview().cover) })
  const pageRatio = () => (fmt() === 'pdf' ? trimSize(applied().trim).width / trimSize(applied().trim).height : fmt() === 'docx' ? 8.5 / 11 : 0.66)
  const pageStyle = () => ({ 'aspect-ratio': String(pageRatio()) })
  const isbn = () => (fmt() === 'pdf' ? publishing().isbnP : publishing().isbnE)
  const chapterCount = () => plan().chapters.length
  const footLine = () => {
    const files = fmt() === 'serial' ? `${chapterCount()} files` : `${plan().fileName.replace(/\.[^.]+$/, '')}.${exportFormat(fmt()).ext}`
    return `${chapterCount()} chapter${chapterCount() === 1 ? '' : 's'} · ${formatNumber(plan().words)} words · ${files}`
  }
  const fileName = () => (fmt() === 'serial' && first() ? serialFileName(first(), 0) : plan().fileName)

  const ToggleChip = (chipProps) => (
    <button class="chip toggle" classList={{ on: Options()[chipProps.option] === chipProps.value }} onClick={() => setOption(chipProps.option, chipProps.value)}>
      {chipProps.children}
    </button>
  )
  const IncludeOption = (optionProps) => (
    <label class="xopt" classList={{ off: !available()[optionProps.option] }}>
      <input type="checkbox" checked={applied()[optionProps.option]} disabled={!available()[optionProps.option]}
        onChange={(e) => setOption(optionProps.option, e.currentTarget.checked)} />
      {optionProps.label}
    </label>
  )
  const BookCover = () => (
    <Show when={BookCoverUrl()} fallback={<div class="tcover"><div class="ct">{overview().title || 'Untitled'}</div><div class="ca">{overview().author}</div></div>}>
      <img class="cover-img" src={BookCoverUrl()} alt="" />
    </Show>
  )

  // 7. JSX
  return (
    <div class="modal-overlay" onClick={() => !Busy() && props.onClose()}>
      <div class="modal xmodal" role="dialog" aria-label="Export book" onClick={(e) => e.stopPropagation()}>
        <div class="modal-head">Export book</div>
        <div class="xbody">
          <div class="xopts">
            <div class="flabel">Format</div>
            <div class="xfmts">
              <For each={EXPORT_FORMATS}>
                {(format) => (
                  <button class="xfmt" classList={{ on: format.id === fmt() }} onClick={() => setOption('format', format.id)}>
                    <b>{format.name}</b><span>{format.use}</span>
                  </button>
                )}
              </For>
            </div>
            <Show when={fmt() === 'pdf'}>
              <div class="flabel">Trim size</div>
              <div class="chips">
                <For each={TRIM_SIZES}>{(trim) => <ToggleChip option="trim" value={trim.id}>{trim.label}</ToggleChip>}</For>
              </div>
            </Show>
            <div class="flabel">Chapters</div>
            <div class="chips">
              <ToggleChip option="scope" value="all">All written</ToggleChip>
              <ToggleChip option="scope" value="published">Published only</ToggleChip>
              <ToggleChip option="scope" value="range">Range</ToggleChip>
              <Show when={Options().scope === 'range'}>
                <input class="chipin xrange" inputmode="numeric" value={Options().from} placeholder="from" onInput={(e) => setOption('from', e.currentTarget.value)} />
                <input class="chipin xrange" inputmode="numeric" value={Options().to} placeholder="to" onInput={(e) => setOption('to', e.currentTarget.value)} />
              </Show>
            </div>
            <div class="flabel">Text</div>
            <div class="chips">
              <ToggleChip option="source" value="current">Current text</ToggleChip>
              <ToggleChip option="source" value="published">Latest published drafts</ToggleChip>
            </div>
            <div class="flabel">Include</div>
            <div class="xincl">
              <IncludeOption option="cover" label="Cover image" />
              <IncludeOption option="titlePage" label="Title page" />
              <IncludeOption option="copyright" label="Copyright page" />
              <IncludeOption option="front" label={`Front matter (${plan().counts.frontCount})`} />
              <IncludeOption option="back" label={`Back matter (${plan().counts.backCount})`} />
              <IncludeOption option="headings" label="Chapter headings" />
            </div>
            <Show when={isBook()}>
              <div class="flabel">From the Book pages</div>
              <div class="xchecks">
                <For each={checks()}>
                  {(check) => (
                    <div class="xcheck" classList={{ ok: check.ok }}>
                      <span>{check.ok ? <CheckIcon size={13} /> : '–'}</span>
                      {check.label}
                      <Show when={!check.ok}><span class="counts">{check.hint}</span></Show>
                    </div>
                  )}
                </For>
              </div>
            </Show>
          </div>

          <div class="xprev">
            <Show when={first()} fallback={<div class="counts">Nothing to export</div>}>
              <Show
                when={isBook()}
                fallback={
                  <>
                    <div class="pv-file">
                      <div class="pv-fname">{fileName()}</div>
                      <div class="pv-text">{applied().headings ? `${chapterLabel(first().number, first().title)}\n\n` : ''}{firstPara()}…</div>
                    </div>
                    <Show when={fmt() === 'serial'}><div class="counts xmore">+ {Math.max(0, chapterCount() - 1)} more files</div></Show>
                  </>
                }
              >
                <Show when={fmt() === 'epub' && applied().cover}>
                  <div class="pv-page cover" style={pageStyle()}><BookCover /></div>
                </Show>
                <Show when={applied().titlePage}>
                  <Show
                    when={fmt() === 'docx'}
                    fallback={
                      <div class="pv-page tp" style={pageStyle()}>
                        <div class="pv-t">{overview().title || 'Untitled'}</div>
                        <Show when={overview().subtitle}><div class="pv-s">{overview().subtitle}</div></Show>
                        <div class="pv-a">{overview().author}</div>
                      </div>
                    }
                  >
                    <div class="pv-page ms" style={pageStyle()}>
                      <div class="pv-msh"><span>{overview().author || 'Author'}</span><span>{approximateWords(plan().words)}</span></div>
                      <div class="pv-mst">{overview().title || 'Untitled'}</div>
                      <div class="pv-msa">by {overview().author || 'Author'}</div>
                    </div>
                  </Show>
                </Show>
                <Show when={applied().copyright}>
                  <div class="pv-page cp" style={pageStyle()}>
                    <div>{copyrightLine(overview(), publishing())}</div>
                    <Show when={isbn()}><div>ISBN {isbn()}</div></Show>
                  </div>
                </Show>
                <div class="pv-page ch" classList={{ docx: fmt() === 'docx' }} style={pageStyle()}>
                  <Show when={applied().headings}>
                    <Show when={first().number != null} fallback={<div class="pv-cht pv-solo">{first().title || 'Untitled'}</div>}>
                      <div class="pv-chn">Chapter {first().number}</div>
                      <div class="pv-cht">{first().title}</div>
                    </Show>
                  </Show>
                  <div class="pv-p">{firstPara()}</div>
                </div>
              </Show>
            </Show>
          </div>
        </div>
        <div class="modal-foot">
          <Show when={Failure()} fallback={<span class="counts left">{footLine()}</span>}>
            <span class="xfail left" role="alert">{Failure()}</span>
          </Show>
          <button class="modal-cancel" disabled={Busy()} onClick={() => props.onClose()}>Cancel</button>
          <button class="modal-go" disabled={Busy() || !chapterCount()} onClick={handleExport}>{Busy() ? 'Exporting…' : 'Export'}</button>
        </div>
      </div>
    </div>
  )
}

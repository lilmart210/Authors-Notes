import { For, Show } from 'solid-js'
import { useProject } from '../project/ProjectContext.jsx'
import { chapterLabel } from '../project/format.js'
import { scrapContext } from '../project/scraps.js'
import { displayDate } from '../project/drafts.js'
import './BookPages.css'
import './Editor.css'

// Every scrap from every chapter, in reading order, each shown in the passage it
// was cut from. "Show" opens the chapter with the replacement selected.
export default function ScrapsView() {
  const { AllScraps, FocusScrap } = useProject()

  // 6. JSX-helper builders
  // Consecutive scraps from the same chapter share one heading.
  function groups() {
    const out = []
    for (const entry of AllScraps()) {
      const last = out.at(-1)
      if (last && last.chapter.id === entry.chapter.id) last.scraps.push(entry.scrap)
      else out.push({ chapter: entry.chapter, scraps: [entry.scrap] })
    }
    return out
  }
  const heading = (chapter) => chapterLabel(chapter.number, chapter.meta?.title ?? chapter.title)
  const contextOf = (chapter, scrap) => scrapContext(chapter.body || '', scrap)

  // 7. JSX
  return (
    <div class="docscroll">
      <div class="docwrap">
        <div class="dochead">
          <h1 class="h1">Scrapped text</h1>
          <span class="counts">{AllScraps().length ? `${AllScraps().length} scraps` : ''}</span>
        </div>
        <Show when={AllScraps().length} fallback={<div class="counts">Select text in a chapter and choose Scrap or Rewrite.</div>}>
          <For each={groups()}>
            {(group) => (
              <>
                <div class="subhead"><span class="flabel">{heading(group.chapter)}</span></div>
                <div class="tblwrap">
                  <table class="tbl">
                    <tbody>
                      <For each={group.scraps}>
                        {(scrap) => (
                          <tr>
                            <td class="scrap-review">
                              <div class="scrap-flow">
                                <span class="ctx">{contextOf(group.chapter, scrap).before}</span>
                                <del>{scrap.text}</del>
                                <Show when={contextOf(group.chapter, scrap).now}><ins>{contextOf(group.chapter, scrap).now}</ins></Show>
                                <span class="ctx">{contextOf(group.chapter, scrap).after}</span>
                              </div>
                            </td>
                            <td class="tnum">{displayDate(scrap.date)}</td>
                            <td class="tact"><button class="btn" onClick={() => FocusScrap(group.chapter.id, scrap.id)}>Show</button></td>
                          </tr>
                        )}
                      </For>
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </For>
        </Show>
      </div>
    </div>
  )
}

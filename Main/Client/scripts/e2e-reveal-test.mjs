// End-to-end test of the animated reveal boxes: the height animates, and the
// contents stay transparent until the box is full height (opening) or fade out
// before it shrinks (closing).   node scripts/e2e-reveal-test.mjs
import { runE2E } from './e2e-harness.mjs'

runE2E(String.raw`
  await openProject()

  // Sample a box's height and its contents' opacity every few ms for a while,
  // starting once pending microtasks have run (the browser never paints before that).
  async function sample(read, ms = 900) {
    await sleep(0)
    const out = []
    const t0 = performance.now()
    while (performance.now() - t0 < ms) { out.push(read()); await sleep(8) }
    return out
  }
  const opacityOf = (el) => (el && el.isConnected ? Number(getComputedStyle(el).opacity) : null)
  const heightOf = (el) => (el && el.isConnected ? el.getBoundingClientRect().height : 0)

  function checkOpening(samples, label) {
    const full = Math.max(...samples.map((s) => s.h))
    const growing = samples.filter((s) => s.h < full - 1)
    const last = samples[samples.length - 1]
    check(growing.length >= 3, label + ': the height animates open (' + growing.length + ' frames between)')
    check(growing.every((s) => s.o === 0), label + ': contents stay transparent until full height')
    check(samples.some((s) => s.h >= full - 1 && s.o > 0 && s.o < 1), label + ': then they fade in')
    check(last.o === 1 && Math.abs(last.h - full) < 1, label + ': and end fully shown')
  }
  function checkClosing(samples, start, label) {
    const fading = samples.filter((s) => s.o !== null && s.o > 0)
    const shrinking = samples.filter((s) => s.h > 1 && s.h < start - 1)
    check(fading.every((s) => Math.abs(s.h - start) < 1), label + ': contents fade out before the height moves')
    check(shrinking.length >= 3 && shrinking.every((s) => s.o === 0 || s.o === null), label + ': then the height animates closed (' + shrinking.length + ' frames)')
    check(samples[samples.length - 1].h < 1, label + ': and ends closed')
  }

  // --- a sidebar section ---
  const worldSec = [...document.querySelectorAll('.binder .sec')].find((s) => s.querySelector('.sechead').textContent.includes('World'))
  const worldBox = worldSec.querySelector(':scope > .reveal')
  const worldStart = heightOf(worldBox)
  check(worldStart > 50 && !!worldBox.querySelector('.node'), 'World starts open')
  click(worldSec.querySelector('.sechead'))
  const closing = await sample(() => ({ h: heightOf(worldBox), o: opacityOf(worldBox.querySelector('.reveal-in')) }))
  checkClosing(closing, worldStart, 'Closing World')
  check(!worldBox.querySelector('.node'), 'its rows are gone once closed')
  click(worldSec.querySelector('.sechead'))
  const opening = await sample(() => ({ h: heightOf(worldBox), o: opacityOf(worldBox.querySelector('.reveal-in')) }))
  checkOpening(opening, 'Opening World')
  check(worldBox.style.height === '' && worldBox.style.overflow === '', 'the box goes back to its natural height afterwards')

  // --- a tree row (an arc in the Manuscript) ---
  const arcRow = document.querySelector('.binder .node.arc')
  const arcBox = arcRow.nextElementSibling
  click(arcRow.querySelector('.tw'))
  const arcOpening = await sample(() => ({ h: heightOf(arcBox), o: opacityOf(arcBox.querySelector('.reveal-in')) }))
  checkOpening(arcOpening, 'Opening an arc')

  // --- reopening mid-close picks up where it was ---
  click(arcRow.querySelector('.tw'))
  await sleep(40)
  click(arcRow.querySelector('.tw'))
  await sleep(900)
  check(opacityOf(arcBox.querySelector('.reveal-in')) === 1 && arcBox.style.height === '', 'reopening mid-animation ends fully open')

  // --- a right-panel pane (Topics) ---
  const topicsPane = [...document.querySelectorAll('.dock .pane')].find((p) => p.querySelector('.pbar .t')?.textContent === 'Topics')
  const topicsStart = heightOf(topicsPane)
  click(topicsPane.querySelector('.pbar'))
  const paneClosing = await sample(() => ({ h: heightOf(topicsPane), o: topicsPane.classList.contains('collapsed') ? null : opacityOf(topicsPane.querySelector('.pbody')) }))
  check(paneClosing.filter((s) => s.o !== null && s.o > 0).every((s) => Math.abs(s.h - topicsStart) < 1), 'Closing Topics: contents fade out before the pane moves')
  check(paneClosing.filter((s) => s.h < topicsStart - 1 && s.h > 32).length >= 3, 'then the pane height animates closed')
  check(topicsPane.classList.contains('collapsed') && heightOf(topicsPane) < 34, 'and ends as just its header')
  const planPane = [...document.querySelectorAll('.dock .pane')].find((p) => p.querySelector('.pbar .t')?.textContent === 'Chapter plan')
  const planBefore = heightOf(planPane)
  click(topicsPane.querySelector('.pbar'))
  const paneOpening = await sample(() => ({ h: heightOf(topicsPane), o: opacityOf(topicsPane.querySelector('.pbody')), plan: heightOf(planPane) }))
  const full = Math.max(...paneOpening.map((s) => s.h))
  check(paneOpening.filter((s) => s.h < full - 1).length >= 3 && paneOpening.filter((s) => s.h < full - 1).every((s) => s.o === 0), 'Opening Topics: the pane grows with its contents transparent')
  check(paneOpening[paneOpening.length - 1].o === 1, 'then its contents fade in')
  check(paneOpening.every((s) => Math.abs(s.plan - planBefore) < 1), 'the other panes keep their height (the panel scrolls instead)')

  // --- the Outline: an arc group and a card's editor ---
  click(await until(() => byText('.binder .node', 'Outline')))
  await until(() => document.querySelector('.tl-node'))
  const band = document.querySelector('.tl-band')
  const bandBox = band.nextElementSibling
  click(band)
  await sleep(900)
  check(!bandBox.querySelector('.tl-node'), 'Outline: collapsing an arc removes its cards after animating')
  click(band)
  const bandOpening = await sample(() => ({ h: heightOf(bandBox), o: opacityOf(bandBox.querySelector('.reveal-in')) }))
  checkOpening(bandOpening, 'Outline arc')
  const card = document.querySelector('.tl-node')
  const wrap = card.querySelector('.tl-planwrap')
  const readHeight = heightOf(wrap)
  click(card)
  const editing = await sample(() => ({ h: heightOf(wrap), o: opacityOf(wrap.firstElementChild), editor: !!wrap.querySelector('.tl-plan') }))
  const editFull = Math.max(...editing.map((s) => s.h))
  check(editing.filter((s) => s.editor && s.h > readHeight + 1 && s.h < editFull - 1).length >= 3, 'Outline card: opening the editor animates the height')
  check(editing.filter((s) => s.editor && s.h < editFull - 1).every((s) => s.o === 0), 'the editor stays transparent until the card is full height')
  check(editing[editing.length - 1].o === 1 && editing[editing.length - 1].editor, 'then it fades in')
  finish()
`, { budgetMs: 60000 })

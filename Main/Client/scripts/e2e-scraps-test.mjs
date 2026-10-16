// End-to-end test of the selection menu and margin scraps against the real
// editor on a fake disk.   node scripts/e2e-scraps-test.mjs
import { runE2E } from './e2e-harness.mjs'

runE2E(String.raw`
  const cm = await openProject()
  const view = viewOf(cm)
  const manifest = JSON.parse(file('project.json'))
  const chapterPath = 'chapters/' + manifest.tree[0].children[0].file
  const press = (button) => button.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }))
  const menuButton = (label) => [...document.querySelectorAll('.cm-seltb button')].find((b) => b.textContent === label)

  // --- select → floating menu ---
  const doc = view.state.doc.toString()
  const target = 'These words were spoken very lightly.'
  const at = doc.indexOf(target)
  check(at > 0, 'found a sentence to work with')
  view.focus()
  view.dispatch({ selection: { anchor: at, head: at + target.length } })
  const menu = await until(() => document.querySelector('.cm-seltb'))
  const labels = menu ? [...menu.querySelectorAll('button')].map((b) => b.textContent) : []
  check(['Cut', 'Copy', 'Scrap', 'Rewrite'].every((l) => labels.includes(l)), 'selecting text shows Cut · Copy · Scrap · Rewrite (' + labels.join(' · ') + ')')

  // --- Rewrite: the text goes to the margin, typing in its place is the replacement ---
  press(menuButton('Rewrite'))
  await sleep(100)
  check(!view.state.doc.toString().includes(target), 'Rewrite takes the sentence out of the prose')
  const card = await until(() => document.querySelector('.scrap-margin .scrap'))
  check(!!card && card.querySelector('del')?.textContent === target, 'a margin card holds the scrapped sentence')
  const cursor = view.state.selection.main.head
  view.dispatch({ changes: { from: cursor, insert: 'He spoke softly.' }, selection: { anchor: cursor + 'He spoke softly.'.length }, userEvent: 'input.type' })
  await sleep(150)
  check(document.querySelector('.scrap-margin .scrap ins')?.textContent === 'He spoke softly.', 'what you type in its place shows on the card as the replacement')
  check([...document.querySelectorAll('.scrap-margin .scrap .ctx')].some((c) => c.textContent.trim().length > 10), 'the card shows the surrounding story')
  await sleep(2500)
  const saved = file(chapterPath) || ''
  check(saved.includes('scraps: [') && saved.includes(target.replace(/"/g, '\\"')), 'the scrap is saved in the chapter file')

  // --- Put back ---
  click(byText('.scrap-margin .scrap-btn', 'Put back'))
  await sleep(150)
  const restored = view.state.doc.toString()
  check(restored.includes(target) && !restored.includes('He spoke softly.'), 'Put back swaps the original sentence back in')
  check(!document.querySelector('.scrap-margin .scrap'), 'and the card goes away')
  await sleep(2500)
  check((file(chapterPath) || '').includes('scraps: []'), 'the chapter file no longer lists it')

  // --- plain Scrap, then review it from Notes ---
  const second = 'He was Qin Peizhi, city lord of Extreme Path City.'
  const at2 = view.state.doc.toString().indexOf(second)
  view.focus()
  view.dispatch({ selection: { anchor: at2, head: at2 + second.length } })
  press(await until(() => menuButton('Scrap')))
  await sleep(200)
  check(!view.state.doc.toString().includes(second) && document.querySelectorAll('.scrap-margin .scrap').length === 1, 'Scrap cuts the text and keeps a card')
  click(await until(() => [...document.querySelectorAll('.binder .node')].find((n) => n.textContent.includes('Scrapped text'))))
  const review = await until(() => document.querySelector('.scrap-review'))
  check(!!review && review.textContent.includes(second), 'Notes › Scrapped text lists it in its passage')
  click(byText('.btn', 'Show'))
  await sleep(600)
  const back = viewOf(document.querySelector('.splitwrap .an-editor-host .cm-content'))
  check(!!back && back.state.selection.main.from === at2, '"Show" opens the chapter at the spot it was cut')
  finish()
`, { budgetMs: 60000 })

// End-to-end test of Plot › Outline: chapter cards by arc with their draft state.
//   node scripts/e2e-outline-test.mjs
import { runE2E } from './e2e-harness.mjs'

runE2E(String.raw`
  await openProject()
  click(await until(() => byText('.binder .node', 'Outline')))
  const outline = await until(() => document.querySelector('.tl'))
  check(!!outline && document.querySelector('.tl-title')?.textContent === 'Outline', 'Plot › Outline opens the outline')
  const counts = document.querySelector('.tl-bar .counts')?.textContent || ''
  check(/^\d+ chapters( · \d+ planned)? · [\d,]+ words$/.test(counts), 'the header counts chapters, planned and words (' + counts + ')')

  const dots = [...document.querySelectorAll('.tl-dot')]
  const states = new Set(dots.map((d) => [...d.classList].find((c) => ['empty', 'new', 'pub', 'changed'].includes(c))))
  check(dots.length > 0 && !states.has(undefined), 'every chapter dot shows its draft state (' + [...states].join(', ') + ')')
  check(!!document.querySelector('.tl-node .stagechip') && /^Draft \d+$/.test(document.querySelector('.tl-node .stagechip').textContent), 'written chapters carry their Draft chip')
  check(!document.querySelector('.tl select'), 'there is no status picker anymore')

  // --- editing a card keeps focus (cards update in place) ---
  click(document.querySelector('.tl-node .tl-card'))
  const summary = await until(() => document.querySelector('.tl-plan textarea'))
  summary.focus()
  setInput(summary, summary.value + ' x')
  await sleep(300)
  check(document.activeElement === summary && summary.isConnected, 'typing in a card keeps the cursor there')
  click(document.querySelector('.tl-node.sel .tl-card'))

  // --- a planned chapter in an arc ---
  const band = document.querySelector('.tl-band')
  const arcName = band.querySelector('.tl-band-nm').textContent
  check(/[\d,]+ words/.test(band.querySelector('.tl-band-rg').textContent), 'each arc shows its range and words')
  const before = document.querySelectorAll('.tl-node').length
  click(byText('.tl-addinarc', 'Planned chapter'))
  await until(() => document.querySelectorAll('.tl-node').length > before)
  const added = [...document.querySelectorAll('.tl-node.planned')].at(-1)
  check(!!added && added.querySelector('.tl-dot.empty') && added.textContent.includes('planned'), 'Planned chapter adds a dashed, planned card')
  await sleep(300)
  const newest = filesUnder('chapters/').filter((p) => /^chapters\/[^/]+\.md$/.test(p)).find((p) => !E.original.has(ROOT + '/' + p))
  const text = newest ? file(newest) : ''
  check(text.includes('arc: ' + arcName) && !/\nstatus:/.test(text), 'it is saved in that arc, with no status field')

  // --- the arc name opens the arc page ---
  click([...document.querySelectorAll('.tl-band-nm')].find((a) => a.textContent === arcName))
  check(!!(await until(() => [...document.querySelectorAll('input.ptitle')].find((i) => i.value === arcName))), 'clicking the arc name opens its page')
  finish()
`, { budgetMs: 40000 })

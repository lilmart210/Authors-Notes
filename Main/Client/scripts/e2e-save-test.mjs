// End-to-end save test: open a chapter, type, (wait or) close the window — then
// read the chapter file back off the fake disk. The author's manual check, scripted.
//
//   node scripts/e2e-save-test.mjs
import { runE2E } from './e2e-harness.mjs'

runE2E(String.raw`
  const cm = await openProject()
  const manifest = JSON.parse(file('project.json'))
  const chapterPath = 'chapters/' + manifest.tree[0].children[0].file

  // 1. type, then just wait (autosave)
  typeInto(cm, ' E2E-WAITED')
  await sleep(80)
  check(viewOf(cm).state.doc.toString().includes('E2E-WAITED'), 'typing reaches the editor state')
  await sleep(7000)
  check((file(chapterPath) || '').includes('E2E-WAITED'), 'text is on disk a few seconds after typing stops')

  // 2. type, then close the window straight away (title-bar ✕)
  typeInto(cm, ' E2E-CLOSED')
  await sleep(80)
  click(document.querySelector('.wc.close'))
  await until(() => E.destroyed, 6000)
  const saved = file(chapterPath) || ''
  check(saved.includes('E2E-CLOSED'), 'text typed right before closing is on disk')
  check(E.destroyed, 'window actually closes after saving')
  check(saved.startsWith('---') && saved.includes('id: '), 'chapter frontmatter survives the save')

  // 3. nothing written to the wrong place
  const strays = [...E.files.keys()].filter((p) => !E.original.has(p))
  check(strays.length === 0, 'no stray files written' + (strays.length ? ': ' + strays.join(', ') : ''))
  finish()
`, { budgetMs: 40000 })

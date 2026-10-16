// End-to-end test of the binder (the Book · Plot · Manuscript · World · Notes
// sidebar) against the real frontend on a fake disk: Book pages, drafts, pages,
// arcs, drag-and-drop, undo — each checked by reading the files the app wrote.
//
//   node scripts/e2e-binder-test.mjs
import { runE2E } from './e2e-harness.mjs'

runE2E(String.raw`
  const cm = await openProject()
  const manifest = JSON.parse(file('project.json'))
  const firstChapter = manifest.tree[0].children[0].file
  const sectionHead = (name) => byText('.binder .sechead', name)
  const sectionPlus = (name) => sectionHead(name).querySelector('.nodebtn[title="New…"]')
  const rowNamed = (name) => [...document.querySelectorAll('.binder .node')].find((n) => n.querySelector('.lbl')?.textContent.trim() === name)
  const menuItem = (label) => byText('.binder-menu button', label)
  async function createInline(sectionName, kindLabel, name) {
    click(sectionPlus(sectionName))
    click(await until(() => menuItem(kindLabel)))
    const input = await until(() => document.querySelector('.binder .inl'))
    setInput(input, name)
    pressEnter(input)
    await until(() => rowNamed(name))
  }

  // --- sections ---
  const heads = [...document.querySelectorAll('.binder .sechead')].map((h) => h.querySelector('span:nth-child(2)').textContent)
  check(heads.join(',') === 'Book,Plot,Manuscript,World,Notes', 'sidebar sections are the parts of a book: ' + heads.join(' · '))
  check(!document.querySelector('.rail [title="Timeline & plot"]'), 'old Timeline rail button is gone')

  // --- Overview: title + planned length save to book/overview.md ---
  click(document.querySelector('.bookrow'))
  const title = await until(() => document.querySelector('.bigtitle'))
  check(!!title, 'book row opens the Overview')
  setInput(title, 'Strongest World E2E')
  const planInputs = document.querySelectorAll('.pnum input')
  setInput(planInputs[0], '3'); setInput(planInputs[1], '20'); setInput(planInputs[2], '2500')
  await sleep(50)
  check((document.querySelector('.planres')?.textContent || '').includes('60 chapters'), 'planned length = arcs × chapters × words (60 chapters)')
  await sleep(2500)
  const overview = file('book/overview.md') || ''
  check(overview.includes('title: Strongest World E2E') && overview.includes('"perArc":20'), 'Overview writes book/overview.md (title + plan)')
  check((document.querySelector('.booktitle')?.textContent || '') === 'Strongest World E2E', 'sidebar book row follows the title')

  // --- Blurb: write, publish draft 1 ---
  click(rowNamed('Blurb'))
  const blurbCm = await until(() => document.querySelector('.bookdoc .cm-content'))
  check(!!blurbCm, 'Blurb opens with an editor')
  typeInto(blurbCm, 'The end always justifies the means.')
  await sleep(2500)
  check((file('book/blurb.md') || '').includes('The end always justifies the means.'), 'Blurb text saves to book/blurb.md')
  const publishBlurb = await until(() => document.querySelector('.dock .pubbtn.wide'))
  check(publishBlurb && !publishBlurb.disabled && publishBlurb.textContent.includes('Publish draft 1'), 'right panel offers "Publish draft 1" for the blurb')
  click(publishBlurb)
  await until(() => file('book/.drafts/blurb/001.md'))
  await sleep(2500)
  check((file('book/.drafts/blurb/001.md') || '').includes('The end always justifies'), 'publishing writes book/.drafts/blurb/001.md')
  check((file('book/blurb.md') || '').includes('lastDraft:'), 'blurb.md is stamped with its last draft')
  const afterPublish = document.querySelector('.dock .pubbtn.wide')
  check(afterPublish && afterPublish.disabled && afterPublish.textContent.includes('Publish draft 2'), 'button stays, moves to draft 2, greyed until something changes')

  // --- Chapter: publish, edit, compare, restore ---
  click(document.querySelector('.binder .node.arc .tw')) // arcs start collapsed
  const chapterRow = await until(() => [...document.querySelectorAll('.binder .node')].find((n) => n.querySelector('.sd')))
  click(chapterRow)
  await sleep(300)
  const chapterCm = await until(() => document.querySelector('.splitwrap .an-editor-host .cm-content'))
  const stem = firstChapter.replace(/\.md$/, '')
  const chapterPublish = await until(() => document.querySelector('.dock .pubbtn.wide'))
  click(chapterPublish)
  await until(() => file('chapters/.drafts/' + stem + '/001.md'))
  check(!!file('chapters/.drafts/' + stem + '/001.md'), 'publishing a chapter writes chapters/.drafts/<chapter>/001.md')
  await sleep(2500)
  check((file('chapters/' + firstChapter) || '').includes('lastDraft:'), 'chapter frontmatter is stamped with lastDraft')
  typeInto(chapterCm, ' A brand new sentence.')
  await sleep(2500)
  const changedDot = document.querySelector('.binder .node.sel .sd')
  check(changedDot && changedDot.classList.contains('changed'), 'editing after publishing turns the chapter dot amber (changed)')
  const working = await until(() => document.querySelector('.dock .gitrow.now'))
  click(working)
  const diff = await until(() => document.querySelector('.diffsheet'))
  check(diff && diff.querySelector('ins') && diff.textContent.includes('A brand new sentence.'), 'compare view shows the new sentence as added')
  click(byText('.btn', 'Restore draft'))
  await sleep(2500)
  check(!(file('chapters/' + firstChapter) || '').includes('A brand new sentence.'), 'restoring draft 1 puts the old text back on disk')

  // --- Pages: create a World folder and a Notes page, rename, move, delete + undo ---
  await createInline('World', 'New folder', 'Maps')
  await sleep(500)
  const mapsFile = filesUnder('bible/').find((f) => /^bible\/maps__[0-9a-f]{6}\.md$/.test(f))
  check(!!mapsFile && (file(mapsFile) || '').includes('type: folder'), 'World + → New folder writes bible/maps__<id>.md as a folder')
  const mapsRow = rowNamed('Maps')
  mapsRow.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))
  const renameInput = await until(() => mapsRow.querySelector('.inl') || document.querySelector('.binder .inl'))
  setInput(renameInput, 'Atlas')
  pressEnter(renameInput)
  await until(() => rowNamed('Atlas'))
  await sleep(2500)
  check((file(mapsFile) || '').includes('name: Atlas'), 'double-click rename saves the new name (file keeps its id)')

  await createInline('Notes', 'New page', 'Loose idea')
  await sleep(500)
  const ideaFile = filesUnder('notes/').find((f) => f.startsWith('notes/loose-idea__'))
  check(!!ideaFile, 'Notes + → New page writes notes/loose-idea__<id>.md')

  const ideaRow = rowNamed('Loose idea'), atlasRow = rowNamed('Atlas')
  const transfer = new DataTransfer()
  ideaRow.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: transfer }))
  const box = atlasRow.getBoundingClientRect()
  atlasRow.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: transfer, clientY: box.top + box.height / 2 }))
  atlasRow.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: transfer, clientY: box.top + box.height / 2 }))
  await sleep(1500)
  const moved = filesUnder('bible/').find((f) => /^bible\/atlas__|^bible\/maps__/.test(f) && f.includes('/loose-idea__'))
  check(!!moved && !filesUnder('notes/').some((f) => f.startsWith('notes/loose-idea__')), 'dragging a Notes page onto a World folder moves it inside (' + (moved || 'not moved') + ')')
  // the page keeps its id through rename + move; its folder is named after its current name
  const atlasId = mapsFile.match(/__([0-9a-f]{6})\.md$/)[1]
  const atlasFiles = () => filesUnder('bible/').filter((f) => f.includes('__' + atlasId + '/') || f.endsWith('__' + atlasId + '.md'))
  check(atlasFiles().some((f) => f.endsWith('__' + atlasId + '/_index.md')), 'the folder became a container (_index.md)')

  const atlasNow = rowNamed('Atlas')
  atlasNow.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 60, clientY: 60 }))
  click(await until(() => menuItem('Delete')))
  await sleep(800)
  check(atlasFiles().length === 0, 'Delete removes the folder and what is inside it' + (atlasFiles().length ? ' — left: ' + atlasFiles().join(', ') : ''))
  click(await until(() => byText('.toast button', 'Undo')))
  await sleep(1500)
  check(atlasFiles().length === 2 && !!rowNamed('Atlas'), 'Undo brings the folder and its page back (' + atlasFiles().length + ' files)')

  // --- Page view: folder table, column, paste a list, fields that link ---
  click(rowNamed('Atlas'))
  await until(() => document.querySelector('.docwrap .tbl') && document.querySelector('.ptitle')?.value === 'Atlas')
  click(document.querySelector('.tbl th.thadd button'))
  const columnInput = await until(() => document.querySelector('.tbl th.thadd input'))
  setInput(columnInput, 'First seen')
  pressEnter(columnInput)
  await sleep(2500)
  const atlasIndex = () => file(atlasFiles().find((f) => f.endsWith('/_index.md')) || '') || ''
  check(atlasIndex().includes('columns: ["First seen"]'), 'adding a column saves it on the folder')
  const quick = document.querySelector('.quickrow .quickadd')
  const pasted = new DataTransfer()
  pasted.setData('text/plain', 'long yan - a disciple of the traveling cloud sect. ch 22\npan zhengshang - a tier 1 outer disciple. ch 22')
  quick.dispatchEvent(new ClipboardEvent('paste', { clipboardData: pasted, bubbles: true, cancelable: true }))
  await until(() => byText('.tbl .tname', 'Pan Zhengshang'))
  const longYanFile = atlasFiles().find((f) => f.includes('/long-yan__'))
  check(!!longYanFile && /summary: A disciple of the traveling cloud sect/.test(file(longYanFile)) && file(longYanFile).includes('First seen: Ch. 22'), 'pasting the author-style list adds a page per line (name, description, first seen)')
  click(byText('.tbl .tname', 'Long Yan'))
  await until(() => document.querySelector('.ptitle')?.value === 'Long Yan')
  click(byText('.prop-add button', 'Add field'))
  const fieldInput = await until(() => document.querySelector('.prop-add input'))
  setInput(fieldInput, 'Family')
  pressEnter(fieldInput)
  const familyValue = await until(() => [...document.querySelectorAll('.prop')].find((p) => p.querySelector('.prop-k')?.textContent === 'Family')?.querySelector('.prop-v'))
  setInput(familyValue, 'Jin Family')
  await sleep(2500)
  check((file(longYanFile) || '').includes('Family: Jin Family'), 'a new field saves on the page')
  const openJin = await until(() => document.querySelector('.prop-slot button[title="Open Jin Family"]'))
  check(!!openJin, 'a field naming another page offers to open it')
  click(openJin)
  await until(() => document.querySelector('.ptitle')?.value === 'Jin Family')
  const linked = await until(() => [...document.querySelectorAll('.dock .dock-mrow')].find((r) => r.textContent.includes('Long Yan')))
  check(!!linked && linked.textContent.includes('Family'), 'Jin Family lists Long Yan under "Linked from" (via Family)')

  // --- Arcs: create one, add a chapter into it ---
  await createInline('Manuscript', 'New arc', 'Arc Four')
  await sleep(500)
  check(!!file('arcs/arc-four.md'), 'Manuscript + → New arc writes arcs/arc-four.md')
  const arcTitle = await until(() => document.querySelector('.ptitle'))
  check(arcTitle && arcTitle.value === 'Arc Four', 'the new arc opens as a page')
  click(byText('.addrow', 'New chapter'))
  await sleep(1500)
  const newChapter = filesUnder('chapters/').filter((f) => !f.includes('/.drafts/')).map((f) => file(f)).find((t) => t.includes('arc: Arc Four'))
  check(!!newChapter, 'New chapter from the arc page lands in that arc')

  // --- deleting a chapter that's open in the editor keeps it deleted ---
  const arcChapterFile = filesUnder('chapters/').filter((f) => !f.includes('/.drafts/')).find((f) => (file(f) || '').includes('arc: Arc Four'))
  const arcRow = rowNamed('Arc Four')
  if (!arcRow.nextElementSibling?.querySelector('.sd')) click(arcRow.querySelector('.tw'))
  const openChapterRow = await until(() => document.querySelector('.binder .node.sel .sd')?.closest('.node'))
  typeInto(document.querySelector('.splitwrap .an-editor-host .cm-content'), 'Typed just before deleting.')
  openChapterRow.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 60, clientY: 60 }))
  click(await until(() => menuItem('Delete')))
  click(await until(() => document.querySelector('.modal-go.danger')))
  await sleep(4000)
  check(!!arcChapterFile && !file(arcChapterFile), 'a deleted chapter stays deleted (even with unsaved typing in its editor)')

  // --- Publishing page ---
  click(rowNamed('Publishing'))
  await until(() => document.querySelector('.tbl tbody tr'))
  check(document.querySelectorAll('.tbl tbody tr').length > 10, 'Publishing lists the chapters with their drafts')

  finish()
`, { budgetMs: 120000 })

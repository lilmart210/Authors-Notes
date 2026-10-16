// End-to-end test of Export book (by destination) against the real app on a
// fake disk. Pandoc is a stand-in here; scripts/export-test.mjs runs the real one.
//   node scripts/e2e-export-test.mjs
import { runE2E } from './e2e-harness.mjs'

runE2E(String.raw`
  // --- the Book pages, a front-matter page and one published chapter, on disk before opening ---
  const put = (rel, text) => {
    E.files.set(ROOT + '/' + rel, text)
    for (let dir = rel; dir.includes('/');) { dir = dir.slice(0, dir.lastIndexOf('/')); E.dirs.add(ROOT + '/' + dir) }
  }
  put('book/overview.md', '---\ntitle: The Strongest World\nauthor: J. Watson\n---\n\n')
  put('book/publishing.md', '---\nlanguage: English\ncopyright: © 2026 J. Watson\n---\n\n')
  put('book/blurb.md', 'A city lord on the edge of the world.')
  put('front-matter/dedication__0a1b2c.md', '---\nid: 0a1b2c3d4e5f6\nname: Dedication\ntype: page\n---\n\nFor my readers.')
  const chapterFiles = filesUnder('chapters/').filter((p) => /^chapters\/[^/]+\.md$/.test(p))
  const target = chapterFiles.find((p) => /\nnumber: 1\n/.test(file(p))) || chapterFiles[0]
  const stem = target.slice('chapters/'.length, -3)
  put(target, file(target).replace('\n---\n', '\nlastDraft: {"n":1,"date":"2026-10-01T00:00:00.000Z","hash":"0"}\n---\n'))
  put('chapters/.drafts/' + stem + '/001.md', '---\nn: 1\ndate: 2026-10-01T00:00:00.000Z\n---\n\nTHE PUBLISHED DRAFT TEXT.')

  // Watch for the print dialog (the print PDF path).
  let printed = 0
  const realOnload = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'onload')
  Object.defineProperty(HTMLIFrameElement.prototype, 'onload', {
    configurable: true,
    set(fn) { this.addEventListener('load', () => { this.contentWindow.print = () => { printed++ } }); realOnload.set.call(this, fn) },
    get() { return realOnload.get.call(this) },
  })

  await openProject()
  const openExport = async () => {
    click(byText('.menu .menuitem button', 'File'))
    click(await until(() => byText('.filemenu button', 'Export')))
    return until(() => document.querySelector('.xmodal'))
  }
  const fmtButton = (name) => [...document.querySelectorAll('.xfmt')].find((b) => b.querySelector('b').textContent === name)
  const chip = (label) => [...document.querySelectorAll('.xmodal .chip.toggle')].find((b) => b.textContent.trim() === label)
  const foot = () => document.querySelector('.xmodal .modal-foot .counts')?.textContent || ''
  const exportNow = async () => { click(document.querySelector('.xmodal .modal-go')); await until(() => !document.querySelector('.xmodal') || document.querySelector('.xfail'), 5000); await sleep(100) }

  // --- the dialog ---
  const dialog = await openExport()
  check(!!dialog, 'File › Export… opens Export book')
  check([...document.querySelectorAll('.xfmt b')].map((b) => b.textContent).join(' · ') === 'EPUB · Word (.docx) · Print PDF · Web serial · Markdown', 'formats are listed by destination')
  check(fmtButton('EPUB').classList.contains('on'), 'EPUB is chosen first')
  const checkRow = (label) => [...document.querySelectorAll('.xcheck')].find((r) => r.textContent.startsWith(label) || r.textContent.includes(label))
  check(checkRow('Title')?.classList.contains('ok') && checkRow('Author')?.classList.contains('ok'), 'title and author come from the Overview')
  check(checkRow('Cover') && !checkRow('Cover').classList.contains('ok') && checkRow('Cover').textContent.includes('upload on Overview'), 'a missing cover is flagged')
  check(byText('.xopt', 'Front matter (1)') && !byText('.xopt', 'Front matter (1)').classList.contains('off'), 'front matter counts its pages')
  check(byText('.xopt', 'Back matter (0)')?.classList.contains('off'), 'back matter is off with no pages')
  check(!!document.querySelector('.xprev .pv-page.cover') && !!document.querySelector('.xprev .pv-page.tp') && !!document.querySelector('.xprev .pv-page.ch'), 'preview shows cover, title page and the first chapter page')
  check(/^\d+ chapters · [\d,]+ words · The Strongest World\.epub$/.test(foot()), 'footer: chapters, words, file (' + foot() + ')')

  // --- EPUB ---
  await exportNow()
  const epubCall = E.shell.at(-1)
  check(!!epubCall && epubCall.args.includes('epub3') && epubCall.args.includes('--epub-title-page=true'), 'EPUB goes through Pandoc with a title page')
  check(!!file('exports/The Strongest World.epub'), 'writes exports/The Strongest World.epub')
  const source = file('exports/.build/book.md') || ''
  check(source.includes('title: "The Strongest World"') && source.includes('lang: "en"') && source.includes('description: "A city lord'), 'the Pandoc source carries title, language and blurb')
  check(source.includes('# Dedication') && source.indexOf('# Dedication') < source.indexOf('{.chn}'), 'front matter comes before the chapters')
  check(!/^\s*%/m.test(source.split('\n---\n').slice(1).join('\n')), 'no editorial comments reach the book')
  check(!document.querySelector('.xmodal') && (document.querySelector('.toast')?.textContent || '').includes('Exported exports/The Strongest World.epub'), 'the dialog closes and says where it went')

  // --- Web serial (options are remembered) ---
  await openExport()
  check(fmtButton('EPUB').classList.contains('on'), 'the dialog remembers the last format')
  click(fmtButton('Web serial'))
  await sleep(50)
  check(byText('.xopt', 'Title page')?.classList.contains('off') && !document.querySelector('.xchecks'), 'serial: no title page, nothing needed from the Book pages')
  const fname = document.querySelector('.pv-fname')?.textContent || ''
  check(/^\d{3}-[a-z0-9-]+\.txt$/.test(fname) && !!byText('.xprev .counts', 'more files'), 'preview shows the first chapter file (' + fname + ')')
  const chapterCount = Number(foot().match(/^(\d+)/)[1])
  await exportNow()
  const serialFiles = filesUnder('exports/serial/')
  check(serialFiles.length === chapterCount, 'one file per chapter in exports/serial (' + serialFiles.length + ')')
  check((file('exports/serial/' + fname) || '').startsWith('Chapter '), 'each file starts with its chapter heading')

  // --- Markdown of the published drafts only ---
  await openExport()
  click(fmtButton('Markdown'))
  click(chip('Published only'))
  click(chip('Latest published drafts'))
  await sleep(100)
  check(foot().startsWith('1 chapter ·'), 'Published only narrows to the one published chapter (' + foot() + ')')
  check((document.querySelector('.pv-text')?.textContent || '').includes('THE PUBLISHED DRAFT TEXT'), 'the preview shows the published draft text')
  await exportNow()
  const markdown = file('exports/The Strongest World.md') || ''
  check(markdown.includes('THE PUBLISHED DRAFT TEXT') && (markdown.match(/^# /gm) || []).length === 1, 'Markdown holds just the published draft')

  // --- Range ---
  await openExport()
  click(chip('All written'))
  click(chip('Current text'))
  click(chip('Range'))
  const [from, to] = await until(() => { const r = document.querySelectorAll('.xrange'); return r.length === 2 && r })
  setInput(from, '2'); setInput(to, '3')
  await sleep(100)
  check(/^[12] chapters? ·/.test(foot()), 'a range limits the chapters by number (' + foot() + ')')

  // --- Pandoc failing keeps the dialog open with the reason ---
  click(chip('All written'))
  click(fmtButton('Word (.docx)'))
  await sleep(50)
  check(!!document.querySelector('.xprev .pv-page.ms') && byText('.xopt', 'Copyright page')?.classList.contains('off'), 'Word: manuscript title page, no copyright page')
  E.pandocFail = 'pandoc: something broke'
  await exportNow()
  check((document.querySelector('.xfail')?.textContent || '').includes('something broke') && !!document.querySelector('.xmodal'), 'a Pandoc failure stays in the dialog with its message')
  E.console.splice(0, E.console.length, ...E.console.filter((line) => !line.includes('something broke')))
  E.pandocFail = null

  // --- Print PDF ---
  click(fmtButton('Print PDF'))
  const trim = await until(() => chip('5 × 8 in'))
  check(!!trim, 'Print PDF offers trim sizes')
  click(trim)
  await exportNow()
  const print = file('exports/The Strongest World (print).html') || ''
  check(print.includes('size: 5in 8in') && print.includes('class="titlepage"') && print.includes('© 2026 J. Watson'), 'the print interior is laid out at 5 × 8 with title and copyright pages')
  await until(() => printed, 3000)
  check(printed === 1, 'and goes to the print dialog')

  // --- Escape closes ---
  await openExport()
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
  await sleep(50)
  check(!document.querySelector('.xmodal'), 'Escape closes the dialog')
  finish()
`, { budgetMs: 60000 })

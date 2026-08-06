// Headless verification of the project format against the author's REAL novel.
//
// SAFETY: this reads the source folder read-only and writes ONLY into the
// scratchpad. It never modifies anything under "story board".
//
// Run:  node scripts/import-test.mjs

import { readdir, readFile, mkdir, writeFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import * as fmt from '../src/project/format.js'

const SOURCE = 'C:/Users/mrmar/Desktop/story board/Strongest World/final Revised Chapters'
const OUT = 'C:/Users/mrmar/AppData/Local/Temp/claude/c--Users-mrmar-Desktop-Javascript-Authors-Notes/24e25c43-6665-46cf-8aa1-ca29e50ef059/scratchpad/import-test/Strongest World.project'

const ok = (m) => console.log(`  ✓ ${m}`)
const fail = (m) => { console.error(`  ✗ ${m}`); process.exitCode = 1 }

async function main() {
  console.log('\n== Pure round-trip unit check ==')
  {
    const meta = { id: fmt.generateId(), title: 'Thoughts', type: 'chapter', number: 1, status: 'finished' }
    const body = 'Line one.\n\nLine two with “curly” quotes and — dashes.'
    const round = fmt.parseDocument(fmt.stringifyDocument(meta, body))
    round.body === body ? ok('body round-trips exactly') : fail(`body drift:\n${JSON.stringify(round.body)}`)
    round.meta.number === 1 && typeof round.meta.number === 'number' ? ok('number stays numeric') : fail('number type lost')
    round.meta.title === 'Thoughts' ? ok('title round-trips') : fail('title drift')
    fmt.parseDocument('no frontmatter here').body === 'no frontmatter here' ? ok('handles no-frontmatter') : fail('frontmatter fallback broke')
  }

  console.log('\n== Import the real chapters (READ-ONLY source) ==')
  const entries = (await readdir(SOURCE)).filter((f) => f.toLowerCase().endsWith('.txt'))
  console.log(`  source: ${entries.length} .txt files`)

  const docs = []
  for (const fileName of entries) {
    const raw = await readFile(join(SOURCE, fileName), 'utf8')
    const parsed = fmt.parseSourceChapter(fileName, raw)
    docs.push({ ...parsed, raw })
  }

  // Order tolerant of missing/duplicate numbers, then assign 1-based order.
  const ordered = [...docs].sort((a, b) => {
    const an = a.number ?? Number.POSITIVE_INFINITY
    const bn = b.number ?? Number.POSITIVE_INFINITY
    return an !== bn ? an - bn : String(a.sourceName).localeCompare(String(b.sourceName))
  })

  // Write a fresh project into scratchpad.
  await rm(OUT, { recursive: true, force: true })
  await mkdir(join(OUT, fmt.CHAPTER_DIR), { recursive: true })

  const manifest = fmt.createManifest({ name: 'Strongest World', author: 'lilmart210' })
  const group = manifest.tree[0]
  const seenNumbers = new Map()
  const conflicts = []
  const noNumber = []

  for (let i = 0; i < ordered.length; i++) {
    const doc = ordered[i]
    const id = fmt.generateId()
    const file = fmt.chapterFileName(doc.title, id)
    const meta = { id, title: doc.title, type: 'chapter', number: doc.number ?? null, status: 'imported' }
    await writeFile(join(OUT, fmt.CHAPTER_DIR, file), fmt.stringifyDocument(meta, doc.body), 'utf8')
    group.children.push({ id, kind: 'chapter', file })

    if (doc.number == null) noNumber.push(doc.sourceName)
    else if (seenNumbers.has(doc.number)) conflicts.push(doc.number)
    else seenNumbers.set(doc.number, doc.sourceName)
  }
  await writeFile(join(OUT, fmt.MANIFEST_FILE), fmt.serializeManifest(manifest), 'utf8')
  ok(`wrote ${ordered.length} chapter files + manifest to scratchpad`)
  console.log(`    numbering conflicts (dupes): ${conflicts.length ? conflicts.join(', ') : 'none'}`)
  console.log(`    chapters without a number: ${noNumber.length ? noNumber.join(', ') : 'none'}`)

  console.log('\n== Reload from disk & verify ==')
  const reManifest = fmt.parseManifest(await readFile(join(OUT, fmt.MANIFEST_FILE), 'utf8'))
  reManifest.tree[0].children.length === ordered.length ? ok('manifest reloads with all chapters') : fail('manifest child count mismatch')

  const reFiles = (await readdir(join(OUT, fmt.CHAPTER_DIR))).filter((f) => f.endsWith('.md'))
  const reDocs = []
  let bodyMatches = 0
  for (const fileName of reFiles) {
    const parsed = fmt.parseDocument(await readFile(join(OUT, fmt.CHAPTER_DIR, fileName), 'utf8'))
    reDocs.push({ fileName, meta: parsed.meta })
    if (parsed.meta.id && parsed.meta.title) bodyMatches++
  }
  bodyMatches === reFiles.length ? ok('every reloaded file has id + title in frontmatter') : fail('some files lost metadata')

  console.log('\n== Resilience: rebuild order with NO manifest ==')
  const rebuilt = fmt.rebuildOrderFromDocs(reDocs)
  rebuilt.length === reFiles.length ? ok(`recovered all ${rebuilt.length} chapters from frontmatter alone`) : fail('rebuild lost files')
  const firstTitled = rebuilt.find((d) => d.meta.number === 1)
  console.log(`    first numbered chapter recovered: ${firstTitled ? `#1 "${firstTitled.meta.title}"` : '(none numbered 1)'}`)

  console.log(`\nDone. Sample of imported chapters:`)
  for (const d of rebuilt.slice(0, 6)) console.log(`    ${String(d.meta.number ?? '—').padStart(3)}  ${d.meta.title}   [${d.fileName}]`)
  console.log('')
}

main().catch((e) => { console.error(e); process.exitCode = 1 })

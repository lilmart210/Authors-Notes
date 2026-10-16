// Headless tests for the pure draft + book logic.  node scripts/drafts-test.mjs
import * as drafts from '../src/project/drafts.js'
import * as book from '../src/project/book.js'

let failures = 0
function check(ok, label) {
  console.log(`  ${ok ? '✓' : '✗'} ${label}`)
  if (!ok) failures++
}
const rebuild = (ops, keep) => ops.filter(([op]) => op === '=' || op === keep).map(([, t]) => t).join('')

console.log('draft state')
const text = 'So they escaped after all.'
check(drafts.draftState({}, '') === 'empty', 'nothing written → empty')
check(drafts.draftState({}, text) === 'new', 'written, never published → new')
const meta = { lastDraft: drafts.lastDraftStamp(3, text, '2026-10-15T10:00:00.000Z') }
check(drafts.draftState(meta, text) === 'pub', 'same text as the last draft → pub')
check(drafts.draftState(meta, text + ' More.') === 'changed', 'edited after publishing → changed')
check(drafts.workingDraftNumber(meta) === 4 && drafts.workingDraftNumber({}) === 1, 'working draft = last + 1')
check(!drafts.canPublish(meta, text) && drafts.canPublish(meta, text + 'x') && !drafts.canPublish({}, ' '), 'publish only when there is something new')
check(drafts.stateLine(meta, text) === 'Draft 3 published Oct 15, 2026', 'state line names the draft and date')
check(drafts.draftFileName(7) === '007.md' && drafts.draftNumberFromFile('012.md') === 12 && drafts.draftNumberFromFile('x.md') === null, 'draft file names')

console.log('diff')
const before = 'First paragraph stays.\n\nThe tall man yelled at a man on the floor.\n\nLast one stays too.'
const after = 'First paragraph stays.\n\nThe city lord yelled at the man on the floor, quietly.\n\nLast one stays too.'
const ops = drafts.diffWords(before, after)
check(rebuild(ops, '+') === after, 'equal + added parts rebuild the new text')
check(rebuild(ops, '-') === before, 'equal + removed parts rebuild the old text')
check(ops.some(([op, t]) => op === '=' && t.includes('First paragraph stays.')), 'unchanged paragraphs stay whole')
const stats = drafts.diffStats(ops)
check(stats.added > 0 && stats.removed > 0, `word counts of the change (+${stats.added} −${stats.removed})`)
check(drafts.diffWords('', '').length === 0 && rebuild(drafts.diffWords('', 'new text'), '+') === 'new text', 'empty edges')
const longA = Array.from({ length: 400 }, (_, i) => `Paragraph ${i} with some words in it.`).join('\n\n')
const longB = longA.replace('Paragraph 200 with', 'Paragraph 200 now with')
const t0 = Date.now()
const longOps = drafts.diffWords(longA, longB)
check(rebuild(longOps, '+') === longB && Date.now() - t0 < 2000, `long chapter diff is correct and fast (${Date.now() - t0} ms)`)

console.log('book plan')
const plan = book.planTarget({ arcs: 4, perArc: 20, words: 2500 }, [{ name: 'A', plan: '', written: 5 }, { name: 'B', plan: 30, written: 14 }])
check(plan.chapters === 20 + 30 + 2 * 20 && plan.words === 90 * 2500, `arcs × chapters × words with an arc override (${plan.chapters} ch)`)
check(plan.extraArcs === 2, 'arcs not created yet count at the default')
check(book.planTarget({}, []).words === 0, 'no plan → no target')
const merged = book.withBookDefaults('overview', { title: 'X', plan: { perArc: 10 } }, 'Proj')
check(merged.title === 'X' && merged.plan.perArc === 10 && merged.plan.arcs === '' && Array.isArray(merged.tags), 'defaults fill missing keys and keep existing ones')

console.log(failures ? `\n  ${failures} failed` : '\n  all passed')
process.exit(failures ? 1 : 0)

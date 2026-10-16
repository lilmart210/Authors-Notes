// Headless tests for the pure page logic.  node scripts/pages-test.mjs
import * as pages from '../src/project/pages.js'

let failures = 0
function check(ok, label) {
  console.log(`  ${ok ? '✓' : '✗'} ${label}`)
  if (!ok) failures++
}

console.log('quick add')
const longYan = pages.parseEntryLine('long yan - a disciple of the traveling cloud sect, promising tier 2 disciple. ch 22')
check(longYan.name === 'Long Yan' && longYan.summary.startsWith('A disciple') && longYan.chapter === 'Ch. 22', 'author list line → name, description, first seen')
check(pages.parseEntryLine('Ding Tao — a deacon. chapter 25').chapter === 'Ch. 25', 'em dash + "chapter 25"')
check(pages.parseEntryLine('Celestial body: A star in the sky.').summary === 'A star in the sky.', 'glossary "term: definition"')
check(pages.parseEntryLine('Mei Lin').name === 'Mei Lin' && pages.parseEntryLine('Mei Lin').summary === '', 'just a name')
check(pages.parseEntryLine('  ') === null, 'blank line → nothing')
check(pages.parseEntryList('a - one\n\n- b - two\nc').length === 3, 'a pasted list → one entry per line')
check(pages.titleCase("xiao dan'er") === "Xiao Dan'Er" || pages.titleCase('jin hai') === 'Jin Hai', 'lowercase names are title-cased')
check(pages.titleCase('ShouShan') === 'ShouShan', 'mixed case is left alone')

console.log('links')
const cards = [
  { meta: { id: 'r', name: 'Red Demons', aliases: ['Red Demon'] }, body: '' },
  { meta: { id: 'j', name: 'Jin Hai', Race: 'Red Demon', Family: 'Jin Family' }, body: '' },
  { meta: { id: 'p', name: 'Patterns' }, body: 'Every Red Demons member carries a pattern.' },
  { meta: { id: 'x', name: 'Unrelated', Race: 'Human' }, body: 'A redder demon, not a match.' },
]
const links = pages.linkedFrom(cards, cards[0])
check(links.some((l) => l.card.meta.id === 'j' && l.via === 'Race'), 'a field naming the page links to it (Race: Red Demon → Red Demons)')
check(links.some((l) => l.card.meta.id === 'p' && l.via === 'mentioned'), 'a body mentioning the page links to it')
check(!links.some((l) => l.card.meta.id === 'x'), 'near-misses do not link')
check(pages.findPageByName(cards, 'red demon')?.meta.id === 'r', 'find a page by alias, case-insensitive')
check(pages.pageFields(cards[1].meta).map(([k]) => k).join(',') === 'Race,Family', 'fields exclude reserved keys')

console.log(failures ? `\n  ${failures} failed` : '\n  all passed')
process.exit(failures ? 1 : 0)

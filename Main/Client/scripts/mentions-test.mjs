// Headless check of the mention index. Run: node scripts/mentions-test.mjs
import * as m from '../src/project/mentions.js'

const ok = (c, msg) => console.log(`${c ? '  ✓' : '  ✗'} ${msg}`) || (c ? 0 : (process.exitCode = 1))

const chapters = [
  { id: 'a', number: 1, title: 'Thoughts', body: 'Qin Peizhi looked out. ShouShan bowed. Qin Peizhi grinned.' },
  { id: 'b', number: 3, title: 'Demise', body: 'Shoushan ran. The city lord watched. Qinpeizhi is not a match.' },
]
const entities = [
  { id: 'qin', name: 'Qin Peizhi', aliases: ['Qin'] },
  { id: 'shou', name: 'ShouShan', aliases: ['Shoushan', 'Chen ShouShan'] },
]

const idx = m.buildIndex(chapters, entities)

ok(idx.byEntity.qin.find((h) => h.chapterId === 'a')?.count === 2, 'Qin Peizhi counted twice in ch.1')
ok(!idx.byEntity.qin.some((h) => h.chapterId === 'b'), 'no false "Qinpeizhi" match (word boundary holds)')
ok(idx.byEntity.shou.find((h) => h.chapterId === 'a')?.count === 1, 'ShouShan matched in ch.1')
ok(idx.byEntity.shou.find((h) => h.chapterId === 'b')?.count === 1, 'alias "Shoushan" matched in ch.3')
ok(idx.firstSeen.qin === 1 && idx.firstSeen.shou === 1, 'first-seen chapters correct')
ok(m.countMentions({ name: 'Qin Peizhi' }, 'a note about Qin Peizhi and Qin Peizhi') === 2, 'countMentions standalone works')
ok(m.isMentioned({ name: 'Lei', aliases: ['Young Master Lei'] }, 'enter Young Master Lei') === true, 'alias isMentioned works')

const forms = m.surfaceForms({ name: 'ShouShan', aliases: ['Shoushan'] }, chapters)
ok(forms.length === 2, 'surfaceForms finds two spellings (ShouShan, Shoushan)')
ok(forms.find((f) => f.form === 'ShouShan')?.count === 1 && forms.find((f) => f.form === 'Shoushan')?.count === 1, 'surfaceForms counts each spelling')

// --- same-name resolution + chapter-range aliases ---
const matcher = m.buildMentionMatcher([
  { id: 'father', name: 'Jin Hai' },
  { id: 'son', name: 'Jin Hai' },
  // "the Prince" means Qin until ch.27, then a different ruler afterwards
  { id: 'qin', name: 'Qin Peizhi', aliases: [{ form: 'the Prince', until: 27 }] },
  { id: 'ruler', name: 'New Ruler', aliases: [{ form: 'the Prince', from: 28 }] },
])
ok(!!matcher.candidates.get('jin hai') && matcher.candidates.get('jin hai').length === 2, 'shared name gathers both candidates')

const amb = m.resolveMention(matcher.candidates, 'Jin Hai', 6, {})
ok(amb.ids && amb.ids.length === 2, 'unresolved shared name is ambiguous')
const pinned = m.resolveMention(matcher.candidates, 'Jin Hai', 6, { 'jin hai': 'son' })
ok(pinned.id === 'son', 'manual resolution map picks the intended card')

ok(m.resolveMention(matcher.candidates, 'the Prince', 10, {}).id === 'qin', 'range alias resolves to Qin before ch.27')
ok(m.resolveMention(matcher.candidates, 'the Prince', 40, {}).id === 'ruler', 'range alias resolves to the new ruler after ch.28')
console.log('')

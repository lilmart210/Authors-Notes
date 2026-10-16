// Headless tests for scraps: the pure model plus the CodeMirror state field,
// driven through real CodeMirror transactions in Node.  node scripts/scraps-test.mjs
import { EditorState } from '@codemirror/state'
import { scrapContext, newScrap } from '../src/project/scraps.js'
import { scrapField } from '../src/components/scrapsExtension.js'

let failures = 0
function check(ok, label) {
  console.log(`  ${ok ? '✓' : '✗'} ${label}`)
  if (!ok) failures++
}

const doc = 'First paragraph stays.\n\nHe looked at the window. It held a certain beauty, one he appreciated. Then he sighed.\n\nLast.'
const cut = 'It held a certain beauty, one he appreciated.'
const at = doc.indexOf(cut)

function stateWith(scrap, text) {
  return EditorState.create({ doc: text, extensions: [scrapField.init(() => [scrap])] })
}
const scrapOf = (state) => state.field(scrapField)[0]
const replaceAt = (state, from, insert, to = from) => state.update({ changes: { from, to, insert } }).state

console.log('rewrite scrap')
let text = doc.slice(0, at) + doc.slice(at + cut.length)
let state = stateWith(newScrap(cut, at, { rewrite: true, id: 'a' }), text)
state = replaceAt(state, at, 'The view calmed him.')
check(scrapOf(state).to - scrapOf(state).from === 'The view calmed him.'.length && !scrapOf(state).sealed, 'typing at an open Rewrite scrap becomes its replacement')
state = replaceAt(state, scrapOf(state).to, ' Always had.')
check(state.sliceDoc(scrapOf(state).from, scrapOf(state).to) === 'The view calmed him. Always had.', 'it keeps growing while you type on')
state = replaceAt(state, state.doc.length, ' The end.')
check(scrapOf(state).sealed, 'an edit elsewhere seals it')
const before = scrapOf(state)
state = replaceAt(state, 0, 'NEW ')
check(scrapOf(state).from === before.from + 4 && scrapOf(state).to === before.to + 4, 'edits before it shift it along')
state = replaceAt(state, scrapOf(state).to, ' extra')
check(state.sliceDoc(scrapOf(state).from, scrapOf(state).to) === 'The view calmed him. Always had.', 'once sealed, typing at its end no longer joins it')

console.log('plain scrap')
let plain = stateWith(newScrap(cut, at, { id: 'b' }), text)
plain = replaceAt(plain, at, 'typed here')
check(scrapOf(plain).from === scrapOf(plain).to && scrapOf(plain).from === at + 'typed here'.length, 'a plain Scrap does not swallow new typing')
plain = plain.update({ changes: { from: at - 10, to: at + 15, insert: '' } }).state
check(scrapOf(plain).from === at - 10, 'deleting across it pulls the anchor back to the cut point')

console.log('context')
const ctx = scrapContext(doc.slice(0, at) + 'The view calmed him.' + doc.slice(at + cut.length), { from: at, to: at + 'The view calmed him.'.length })
check(ctx.before === 'He looked at the window. ' && ctx.now === 'The view calmed him.' && ctx.after === ' Then he sighed.', 'context stops at paragraph breaks')
const long = 'word '.repeat(60) + 'X' + ' tail'.repeat(60)
const longCtx = scrapContext(long, { from: long.indexOf('X'), to: long.indexOf('X') + 1 })
check(longCtx.before.startsWith('…') && longCtx.after.endsWith('…') && !longCtx.before.startsWith('…ord'), 'long context is trimmed to whole words with …')

console.log(failures ? `\n  ${failures} failed` : '\n  all passed')
process.exit(failures ? 1 : 0)

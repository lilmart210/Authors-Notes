// Pure text helpers for the AI features (Node-testable).

const SENTENCE_END = /[.!?…]+["”’')\]]*/

// Shape a raw model continuation into what autocomplete shows after `before`:
// one line, ending at the first sentence end, with the right spacing.
export function tidySuggestion(text, before = '') {
  let out = String(text || '').split(/\r?\n/)[0]
  if (/\s$/.test(before) || !before) out = out.replace(/^\s+/, '')
  const end = out.match(SENTENCE_END)
  if (end) out = out.slice(0, end.index + end[0].length)
  out = out.replace(/\s+$/, '')
  if (out.length > 160) out = out.slice(0, 160).replace(/\s+\S*$/, '')
  return /\S/.test(out) ? out : ''
}

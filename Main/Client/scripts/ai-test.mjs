// Headless tests for the pure AI helpers and the model catalog.  node scripts/ai-test.mjs
import { tidySuggestion } from '../src/ai/prose.js'
import { AI_MODELS, AI_TAGS, modelForFile, modelForId } from '../src/ai/catalog.js'

let failures = 0
function check(ok, label) {
  console.log(`  ${ok ? '✓' : '✗'} ${label}`)
  if (!ok) failures++
}

console.log('autocomplete suggestions')
check(tidySuggestion(' and the night went quiet. Then more.', 'He looked up') === ' and the night went quiet.', 'stops at the end of the sentence')
check(tidySuggestion('  the door opened', 'He waited. ') === 'the door opened', 'no doubled space after a space')
check(tidySuggestion(' first line\nsecond line', 'x') === ' first line', 'one line only')
check(tidySuggestion('“Go,” she said. Then', 'x') === '“Go,” she said.', 'keeps a closing quote with the full stop')
check(tidySuggestion('Is it? Yes.', '') === 'Is it?', 'question marks end it too')
check(tidySuggestion('   \n', 'x') === '', 'nothing but space is no suggestion')
check(tidySuggestion('word '.repeat(60), 'x').length <= 160, 'long rambles are cut short')

console.log('catalog')
check(AI_MODELS.length === 16 && new Set(AI_MODELS.map((m) => m.id)).size === 16, '16 models, unique ids')
check(AI_MODELS.every((m) => m.url === `https://huggingface.co/${m.repo}/resolve/main/${m.file}` && m.file.endsWith('.gguf')), 'every model downloads a GGUF from Hugging Face')
check(AI_MODELS.every((m) => /^[0-9a-f]{64}$/.test(m.sha256) && m.bytes > 1e8), 'every model has a SHA-256 and a real size')
check(AI_MODELS.every((m) => m.tags.every((t) => AI_TAGS[t])), 'every tag is a known capability')
check(AI_MODELS.every((m, i) => i === 0 || AI_MODELS[i - 1].bytes <= m.bytes), 'listed smallest first')
check(modelForFile('Qwen2.5-7B-Instruct-Q4_K_M.gguf')?.id === 'qwen25-7' && modelForId('gemma2-9')?.gb === 5.8, 'look up by file or id')

console.log(failures ? `\n${failures} FAILED` : '\nall passed')
process.exit(failures ? 1 : 0)

// End-to-end test of local AI: the AI models window (models folder, catalog,
// downloads, Use for) and autocomplete in a chapter. The Rust side (downloads,
// engine, model servers) is a stand-in here.   node scripts/e2e-ai-test.mjs
import { runE2E } from './e2e-harness.mjs'

runE2E(String.raw`
  E.ai.models.set('/appdata/models/my-own-model.gguf', 2500000000) // copied in by hand
  const cm = await openProject()
  const view = viewOf(cm)
  const rows = () => [...document.querySelectorAll('.aimodal .airow')]
  const rowNamed = (name) => rows().find((r) => r.querySelector('.ainame').firstChild.textContent.trim() === name)
  const chip = (label) => [...document.querySelectorAll('.aimodal .chip.toggle')].find((b) => b.textContent === label)
  const status = () => document.querySelector('.status')?.textContent || ''

  // --- the window ---
  click(byText('.menu .menuitem button', 'Tools'))
  click(await until(() => byText('.filemenu button', 'AI models')))
  const dialog = await until(() => document.querySelector('.aimodal'))
  check(!!dialog, 'Tools › AI models… opens the AI models window')
  await until(() => rows().length === 17)
  check(rows().length === 17, '16 catalog models plus the one copied into the folder (' + rows().length + ')')
  check(document.querySelector('.aiused').textContent === '2.5 GB in the models folder', 'the header says how much is in the models folder')
  check(document.querySelector('.aipath').textContent === '/appdata/models', 'the models folder starts in app data')
  check(!!rowNamed('my-own-model')?.querySelector('.btn.danger'), 'a model copied into the folder shows up, with Remove')
  check([...document.querySelectorAll('.aitask select option')].some((o) => o.textContent === 'my-own-model'), 'and can be picked for a job')

  // --- filters and search ---
  click(chip('Tool calling'))
  check(rows().length > 0 && rows().every((r) => r.querySelector('.aitag.tools')), 'Tool calling shows only models with tool calling')
  click(chip('Downloaded'))
  check(rows().length === 1 && !!rowNamed('my-own-model'), 'Downloaded shows what is in the folder')
  click(chip('All'))
  setInput(document.querySelector('.aiq'), 'qwen')
  check(rows().length === 6 && rows().every((r) => r.textContent.includes('Qwen')), 'search narrows the list')
  setInput(document.querySelector('.aiq'), '')

  // --- download ---
  const small = rowNamed('Qwen2.5 0.5B Instruct')
  click(small.querySelector('.pubbtn'))
  check(!!(await until(() => small.querySelector('.aiprog'))), 'Download turns into a progress bar')
  check(!!(await until(() => status().includes('Downloading Qwen2.5 0.5B Instruct'))), 'the status bar shows the download')
  check(!!(await until(() => status().includes('Downloading AI engine'))), 'the AI engine downloads alongside the first model')
  await until(() => small.querySelector('.btn.danger'), 4000)
  check(!!small.querySelector('.aisize.ok svg') && !!small.querySelector('.btn.danger'), 'once downloaded: a check beside the size, and Remove')
  const sent = E.ai.downloaded[0] || {}
  check(sent.dir === '/appdata/models' && sent.url.startsWith('https://huggingface.co/') && /^[0-9a-f]{64}$/.test(sent.sha256) && sent.bytes > 0, 'it downloads from Hugging Face into the models folder, with the hash to check')
  await until(() => E.ai.components.engine, 3000)
  check(E.ai.components.engine === true, 'the engine is installed')
  await until(() => E.ai.settings.tasks?.complete)
  check(E.ai.settings.tasks.complete === sent.file && E.ai.settings.tasks.assist === sent.file, 'the first model is set for autocomplete and the assistant')
  check((document.querySelector('.aiwarn')?.textContent || '').includes('can’t add World entries'), 'the assistant warns when its model can’t call tools')
  await until(() => !status().includes('Downloading'))

  // --- stop a download ---
  const llama = rowNamed('Llama 3.2 1B Instruct')
  E.ai.downloadMs = 3000
  click(llama.querySelector('.pubbtn'))
  click(await until(() => llama.querySelector('.aistop')))
  await until(() => llama.querySelector('.pubbtn'))
  check(!!llama.querySelector('.pubbtn') && ![...E.ai.models.keys()].some((p) => p.includes('Llama-3.2-1B')), 'stopping a download puts the Download button back')
  E.ai.downloadMs = 300

  // --- the models folder ---
  E.dialogResult = '/nas/models'
  click(byText('.aimodal .btn', 'Change'))
  await until(() => document.querySelector('.aipath').textContent === '/nas/models')
  check(E.ai.settings.modelsDir === '/nas/models', 'Change… sets an app-wide models folder (a NAS share works)')
  check(document.querySelector('.aiused').textContent === 'Nothing downloaded' && document.querySelector('.aitask select').disabled, 'models elsewhere aren’t offered')
  E.dialogResult = '/appdata/models'
  click(byText('.aimodal .btn', 'Change'))
  await until(() => rowNamed('my-own-model'))

  // --- remove ---
  click(rowNamed('my-own-model').querySelector('.btn.danger'))
  await until(() => !rowNamed('my-own-model'))
  check(!E.ai.models.has('/appdata/models/my-own-model.gguf'), 'Remove deletes the model file')
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
  await sleep(50)
  check(!document.querySelector('.aimodal'), 'Escape closes the window')

  // --- autocomplete ---
  const line = view.state.doc.line(1)
  view.focus()
  view.dispatch({ selection: { anchor: line.to } })
  view.dispatch({ changes: { from: line.to, insert: ' x' }, selection: { anchor: line.to + 2 }, userEvent: 'input.type' })
  const ghost = await until(() => document.querySelector('.cm-ghost'), 3000)
  check(!!ghost && ghost.textContent === ' and the night went quiet.', 'after a pause, a faded suggestion finishes the sentence (' + (ghost && JSON.stringify(ghost.textContent)) + ')')
  const asked = E.ai.requests.at(-1) || {}
  check(asked.path === '/completion' && asked.body.prompt.endsWith(' x'), 'it asks the autocomplete model to continue the text before the cursor')
  check(E.ai.started.some((s) => s.ctx === 2048), 'the autocomplete model runs with a small context')
  cm.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }))
  await sleep(50)
  check(view.state.doc.line(1).text.endsWith('x and the night went quiet.') && !document.querySelector('.cm-ghost'), 'Tab accepts it')
  const end = view.state.doc.line(1).to
  view.dispatch({ changes: { from: end, insert: ' y' }, selection: { anchor: end + 2 }, userEvent: 'input.type' })
  await until(() => document.querySelector('.cm-ghost'), 3000)
  cm.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
  await sleep(50)
  check(!document.querySelector('.cm-ghost') && view.state.doc.line(1).text.endsWith(' y'), 'Esc drops it')
  const before = E.ai.requests.length
  view.dispatch({ changes: { from: end + 2, insert: ' z' }, selection: { anchor: end + 4 }, userEvent: 'input.type' })
  view.dispatch({ changes: { from: end + 4, insert: 'z' }, selection: { anchor: end + 5 }, userEvent: 'input.type' })
  await sleep(1000)
  check(E.ai.requests.length === before + 1, 'typing again waits for a pause before asking (one request, not one per key)')

  // --- turning it off ---
  E.ai.settings.tasks.complete = ''
  click(byText('.menu .menuitem button', 'Tools'))
  click(await until(() => byText('.filemenu button', 'AI models')))
  const completeSelect = await until(() => document.querySelector('.aitask select'))
  completeSelect.value = ''
  completeSelect.dispatchEvent(new Event('change', { bubbles: true }))
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
  const count = E.ai.requests.length
  const end2 = view.state.doc.line(1).to
  view.dispatch({ changes: { from: end2, insert: ' w' }, selection: { anchor: end2 + 2 }, userEvent: 'input.type' })
  await sleep(1000)
  check(E.ai.requests.length === count && !document.querySelector('.cm-ghost'), 'with Autocomplete set to Off, nothing is suggested')
  finish()
`, { budgetMs: 60000 })

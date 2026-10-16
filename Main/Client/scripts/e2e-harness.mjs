// Shared end-to-end harness — runs the REAL frontend headlessly, no Tauri window.
//
// Builds the app into a temp folder, then loads it in headless Chrome with Tauri's
// IPC replaced by an in-memory disk seeded from `test project/`. A test passes a
// DRIVER script (plain JS run in the page) that clicks through the app and calls
// say()/check(); the harness prints its lines and exits 1 on any FAIL.
//
// No dev server: `vite build` + a file:// page.
import { execSync, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const PROJECT_DIR = path.resolve(ROOT, '../../test project/Strongest World.project')
const OUT_DIR = path.join(os.tmpdir(), 'authors-notes-e2e')
export const VIRTUAL_ROOT = '/proj/Strongest World.project'
const CHROME_PATHS = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
]

// --- fixture: every text file of the test project, keyed by its virtual path ---
function readFixture(dir) {
  const files = {}
  const walk = (abs, rel) => {
    for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
      const childAbs = path.join(abs, entry.name), childRel = rel ? `${rel}/${entry.name}` : entry.name
      if (entry.isDirectory()) walk(childAbs, childRel)
      else if (/\.(md|json|csv|txt)$/i.test(entry.name)) files[`${VIRTUAL_ROOT}/${childRel}`] = fs.readFileSync(childAbs, 'utf8')
    }
  }
  walk(dir, '')
  return files
}

// --- the Tauri stand-in: fs + dialog + events + window, over an in-memory disk ---
const TAURI_MOCK = String.raw`
(() => {
  // Headless --dump-dom runs no rendering loop, so animation frames never come
  // (and Web Animations never finish). Tick frames on a timer, about 60 a second.
  window.requestAnimationFrame = (callback) => setTimeout(() => callback(performance.now()), 16)
  window.cancelAnimationFrame = (id) => clearTimeout(id)
  const files = new Map(Object.entries(window.__FIXTURE__))
  const original = new Set(files.keys())
  const dirs = new Set()
  const norm = (p) => String(p).replace(/\\/g, '/').replace(/\/+$/, '')
  const addParents = (p) => { let d = norm(p); while (d.includes('/')) { d = d.slice(0, d.lastIndexOf('/')); if (d) dirs.add(d) } }
  for (const p of files.keys()) addParents(p)
  const enc = new TextEncoder(), dec = new TextDecoder()
  const callbacks = new Map(), listeners = new Map()
  let nextId = 1
  const E2E = window.__E2E__ = { files, original, dirs, destroyed: false, errors: [], console: [], dialogResult: null, shell: [], pandocFail: null }
  const realError = console.error.bind(console)
  console.error = (...a) => { E2E.console.push(a.map((x) => (x && x.message) || String(x)).join(' ').slice(0, 300)); realError(...a) }
  window.addEventListener('error', (e) => E2E.console.push('uncaught: ' + e.message))
  window.addEventListener('unhandledrejection', (e) => E2E.console.push('unhandled: ' + ((e.reason && e.reason.message) || e.reason)))
  const fail = (msg) => { E2E.errors.push(msg); throw new Error(msg) }
  function emit(event, payload) { for (const id of listeners.get(event) || []) callbacks.get(id)?.({ event, id, payload }) }
  // App-wide AI and component state on the Rust side. Model files live in their own
  // map (the models folder isn't part of the project). Pandoc counts as installed.
  const ai = E2E.ai = {
    settings: {}, defaultDir: '/appdata/models', models: new Map(), unreadable: new Set(),
    components: { pandoc: true, engine: false }, downloadMs: 300, replyMs: 30,
    suggestion: ' and the night went quiet. Then more.', cancel: new Set(),
    downloaded: [], started: [], requests: [], cancelled: [], stopped: [],
  }
  // A download that reports progress over downloadMs, honouring download_cancel.
  async function fakeDownload(id, total) {
    const steps = 6
    for (let i = 1; i <= steps; i++) {
      await new Promise((r) => setTimeout(r, ai.downloadMs / steps))
      if (ai.cancel.has(id)) { ai.cancel.delete(id); throw 'cancelled' }
      emit('download-progress', { id, received: Math.round((total * i) / steps), total })
    }
  }
  async function invoke(cmd, args = {}, options) {
    switch (cmd) {
      case 'plugin:fs|read_text_file': { const p = norm(args.path); if (!files.has(p)) fail('ENOENT ' + p); return enc.encode(files.get(p)).buffer }
      case 'plugin:fs|write_text_file': {
        const p = norm(decodeURIComponent(options.headers.path))
        if (dirs.has(p)) fail('EISDIR write ' + p)
        if (!dirs.has(p.slice(0, p.lastIndexOf('/')))) fail('ENOENT parent of ' + p)
        files.set(p, dec.decode(args)); return null
      }
      case 'plugin:fs|rename': {
        const from = norm(args.oldPath), to = norm(args.newPath)
        if (dirs.has(from)) { // move a whole folder
          if (files.has(to) || dirs.has(to)) fail('EEXIST rename folder onto ' + to)
          for (const f of [...files.keys()]) if (f.startsWith(from + '/')) { files.set(to + f.slice(from.length), files.get(f)); files.delete(f) }
          for (const d of [...dirs]) if (d === from || d.startsWith(from + '/')) { dirs.delete(d); dirs.add(to + d.slice(from.length)) }
          addParents(to + '/x')
          return null
        }
        if (!files.has(from)) fail('ENOENT rename ' + from)
        if (dirs.has(to)) fail('EISDIR rename onto folder ' + to)
        files.set(to, files.get(from)); files.delete(from); return null
      }
      case 'plugin:fs|exists': { const p = norm(args.path); return files.has(p) || dirs.has(p) }
      case 'plugin:fs|mkdir': { const p = norm(args.path); dirs.add(p); addParents(p); return null }
      case 'plugin:fs|remove': {
        const p = norm(args.path)
        files.delete(p)
        for (const f of [...files.keys()]) if (f.startsWith(p + '/')) files.delete(f)
        for (const d of [...dirs]) if (d === p || d.startsWith(p + '/')) dirs.delete(d)
        return null
      }
      case 'plugin:fs|copy_file': { files.set(norm(args.toPath), files.get(norm(args.fromPath)) ?? 'binary'); return null }
      case 'plugin:fs|read_dir': {
        const p = norm(args.path)
        if (!dirs.has(p)) fail('ENOENT dir ' + p)
        const kids = new Map()
        for (const f of files.keys()) if (f.startsWith(p + '/')) { const rest = f.slice(p.length + 1); const name = rest.split('/')[0]; kids.set(name, (kids.get(name) || false) || rest.includes('/')) }
        for (const d of dirs) if (d.startsWith(p + '/')) kids.set(d.slice(p.length + 1).split('/')[0], true)
        return [...kids].map(([name, isDirectory]) => ({ name, isDirectory, isFile: !isDirectory, isSymlink: false }))
      }
      case 'plugin:dialog|open': { const r = E2E.dialogResult ?? window.__VROOT__; E2E.dialogResult = null; return r }
      case 'plugin:event|listen': { if (!listeners.has(args.event)) listeners.set(args.event, []); listeners.get(args.event).push(args.handler); return args.handler }
      case 'plugin:event|unlisten': return null
      case 'plugin:event|emit': emit(args.event, args.payload); return null
      // Like Tauri: if the page listens for close-requested, closing asks the page first.
      case 'plugin:window|close': { if ((listeners.get('tauri://close-requested') || []).length) emit('tauri://close-requested', null); else E2E.destroyed = true; return null }
      case 'plugin:window|destroy': E2E.destroyed = true; return null
      // Pandoc stand-in: records the call; "-o file" writes a placeholder, otherwise
      // the input comes back as rough HTML. Set E2E.pandocFail to make it fail.
      case 'pandoc_run': {
        E2E.shell.push({ args: args.args })
        if (!ai.components.pandoc) fail('pandoc not installed')
        if (E2E.pandocFail) return { code: 1, stdout: '', stderr: E2E.pandocFail }
        const list = args.args || [], out = list.indexOf('-o')
        if (out >= 0) { const p = norm(list[out + 1]); files.set(p, 'pandoc:' + list[list.indexOf('-t') + 1]); addParents(p); return { code: 0, stdout: '', stderr: '' } }
        const source = files.get(norm(list[list.length - 1])) || ''
        const html = source.split(/\n\s*\n/).map((b) => b.startsWith('# ') ? '<h1>' + b.slice(2) + '</h1>' : '<p>' + b + '</p>').join('\n')
        return { code: 0, stdout: html, stderr: '' }
      }
      // --- the Rust side's settings, downloads, components and model servers (src-tauri/src) ---
      case 'settings_get': return JSON.parse(JSON.stringify(ai.settings))
      case 'settings_set': ai.settings = JSON.parse(JSON.stringify(args.settings)); return null
      case 'models_default_dir': return ai.defaultDir
      case 'models_list': {
        const dir = norm(args.dir)
        if (ai.unreadable.has(dir)) throw 'Couldn\'t read ' + dir
        return [...ai.models].filter(([p]) => p.startsWith(dir + '/')).map(([p, bytes]) => ({ file: p.slice(dir.length + 1), path: p, bytes }))
      }
      case 'models_remove': ai.models.delete(norm(args.dir) + '/' + args.file); return null
      case 'model_download': {
        await fakeDownload(args.id, args.bytes)
        const p = norm(args.dir) + '/' + args.file
        ai.models.set(p, args.bytes)
        ai.downloaded.push(args)
        return p
      }
      case 'download_cancel': ai.cancel.add(args.id); return null
      case 'component_status': return { installed: !!ai.components[args.name], version: 'test', bytes: 1000 }
      case 'component_install': {
        if (ai.components[args.name]) return null
        await fakeDownload(args.name, 1000)
        ai.components[args.name] = true
        return null
      }
      case 'llm_start': {
        if (!ai.components.engine) throw 'The AI engine isn\'t installed'
        ai.started.push(args)
        return 5555
      }
      case 'llm_request': {
        ai.requests.push({ path: args.path, body: args.body })
        await new Promise((r) => setTimeout(r, ai.replyMs))
        if (ai.cancelled.includes(args.requestId)) return null
        const reply = args.path === '/completion' ? { content: ai.suggestion } : { choices: [{ delta: { content: ai.suggestion } }] }
        callbacks.get(args.onEvent.id)?.({ message: reply, index: 0 })
        callbacks.get(args.onEvent.id)?.({ end: true, index: 1 })
        return null
      }
      case 'llm_cancel': ai.cancelled.push(args.requestId); return null
      case 'llm_stop': ai.stopped.push(args.model); return null
      default: return null
    }
  }
  window.__TAURI_INTERNALS__ = {
    invoke,
    transformCallback(cb, once) { const id = nextId++; callbacks.set(id, (d) => { if (once) callbacks.delete(id); return cb && cb(d) }); return id },
    unregisterCallback: (id) => callbacks.delete(id),
    runCallback: (id, d) => callbacks.get(id)?.(d),
    callbacks,
    convertFileSrc: (p) => 'data:image/gif;base64,R0lGODlhAQABAAAAACw=',
    metadata: { currentWindow: { label: 'main' }, currentWebview: { windowLabel: 'main', label: 'main' } },
  }
  window.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener: () => {} }
})()
`

// Helpers every driver gets: say/check, sleep/until, typing through CodeMirror,
// opening the project, reading files off the fake disk.
const DRIVER_PRELUDE = String.raw`
  const lines = []
  const say = (m) => lines.push(m)
  const check = (ok, what) => say((ok ? 'ok   ' : 'FAIL ') + what)
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  const until = async (fn, ms = 10000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const v = fn(); if (v) return v; await sleep(50) } return null }
  const E = window.__E2E__
  const ROOT = window.__VROOT__
  const file = (rel) => E.files.get(ROOT + '/' + rel)
  const filesUnder = (rel) => [...E.files.keys()].filter((k) => k.startsWith(ROOT + '/' + rel)).map((k) => k.slice(ROOT.length + 1))
  const viewOf = (cm) => cm.cmView?.rootView?.view || cm.cmTile?.root?.view || null
  const typeInto = (cm, text) => {
    const view = viewOf(cm)
    if (!view) throw new Error('CodeMirror view not reachable from the DOM')
    view.focus()
    view.dispatch({ changes: { from: view.state.doc.length, insert: text }, userEvent: 'input.type' })
  }
  const click = (el) => { if (!el) throw new Error('nothing to click'); el.click() }
  const byText = (selector, text) => [...document.querySelectorAll(selector)].find((el) => el.textContent.trim().includes(text))
  const setInput = (el, value) => { el.value = value; el.dispatchEvent(new Event('input', { bubbles: true })) }
  const pressEnter = (el) => el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
  async function openProject() {
    const openBtn = await until(() => byText('.launch-item', 'Open project'))
    if (!openBtn) throw new Error('launcher never rendered')
    openBtn.click()
    const cm = await until(() => document.querySelector('.cm-content'))
    if (!cm) throw new Error('first chapter never opened')
    await sleep(300)
    return cm
  }
  function finish() {
    check(E.console.length === 0, 'no errors in the app console' + (E.console.length ? ': ' + [...new Set(E.console)].join(' | ') : ''))
    check(E.errors.length === 0, 'no failed disk operations' + (E.errors.length ? ': ' + E.errors.join(' | ') : ''))
  }
`

// `screenshot`: also save a PNG of the page after the driver ran (a second run).
export function runE2E(driverBody, { budgetMs = 60000, screenshot = null, size = '1440,900' } = {}) {
  const chrome = CHROME_PATHS.find((p) => fs.existsSync(p))
  if (!chrome) { console.error('No Chrome/Edge found for the headless run.'); process.exit(1) }
  execSync(`npx vite build --base=./ --outDir "${OUT_DIR}" --emptyOutDir --logLevel error`, { cwd: ROOT, stdio: 'inherit' })
  const safeJson = (value) => JSON.stringify(value).replace(/</g, '\\u003c')
  const driver = `(async () => {\n${DRIVER_PRELUDE}\ntry {\n${driverBody}\n} catch (err) { say('FAIL ' + (err && err.stack || err)) }\nconst pre = document.createElement('pre'); pre.id = 'e2e-result'; pre.textContent = lines.join('\\n'); document.body.appendChild(pre)\n})()`
  const index = fs.readFileSync(path.join(OUT_DIR, 'index.html'), 'utf8').replace(/\scrossorigin/g, '')
  const page = index
    .replace('<head>', `<head><script>window.__FIXTURE__=${safeJson(readFixture(PROJECT_DIR))};window.__VROOT__=${safeJson(VIRTUAL_ROOT)}</script><script>${TAURI_MOCK}</script>`)
    .replace('</body>', `<script>${driver}</script></body>`)
  const pagePath = path.join(OUT_DIR, 'e2e.html')
  fs.writeFileSync(pagePath, page)
  const run = spawnSync(chrome, ['--headless=new', '--disable-gpu', '--allow-file-access-from-files', `--virtual-time-budget=${budgetMs}`, '--window-size=1440,900', '--dump-dom', pathToFileURL(pagePath).href], { encoding: 'utf8', maxBuffer: 200 * 1024 * 1024 })
  if (screenshot) spawnSync(chrome, ['--headless=new', '--disable-gpu', '--allow-file-access-from-files', `--virtual-time-budget=${budgetMs}`, `--window-size=${size}`, `--screenshot=${screenshot}`, pathToFileURL(pagePath).href], { encoding: 'utf8' })
  const result = (run.stdout || '').match(/<pre id="e2e-result">([\s\S]*?)<\/pre>/)
  if (!result) { console.error('No result from the page.\n', (run.stderr || '').slice(-2000)); process.exit(1) }
  const text = result[1].replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&')
  console.log(text)
  process.exit(/^FAIL/m.test(text) ? 1 : 0)
}

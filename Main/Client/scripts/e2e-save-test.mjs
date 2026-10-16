// End-to-end save test — runs the REAL frontend headlessly, no Tauri window needed.
//
// Builds the app into a temp folder, then loads it in headless Chrome with Tauri's
// IPC replaced by an in-memory disk seeded from `test project/`. It repeats the
// author's manual check: open a chapter, type, (wait or) close the window — then
// reads the chapter file back off the fake disk.
//
//   node scripts/e2e-save-test.mjs
//
// No dev server: `vite build` + a file:// page. Exits 1 on any failure.
import { execSync, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const PROJECT_DIR = path.resolve(ROOT, '../../test project/Strongest World.project')
const OUT_DIR = path.join(os.tmpdir(), 'authors-notes-e2e')
const VIRTUAL_ROOT = '/proj/Strongest World.project'
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
  const files = new Map(Object.entries(window.__FIXTURE__))
  const original = new Set(files.keys())
  const dirs = new Set()
  const norm = (p) => String(p).replace(/\\/g, '/').replace(/\/+$/, '')
  const addParents = (p) => { let d = norm(p); while (d.includes('/')) { d = d.slice(0, d.lastIndexOf('/')); if (d) dirs.add(d) } }
  for (const p of files.keys()) addParents(p)
  const enc = new TextEncoder(), dec = new TextDecoder()
  const callbacks = new Map(), listeners = new Map()
  let nextId = 1
  const E2E = window.__E2E__ = { files, original, dirs, destroyed: false, errors: [], console: [] }
  // surface app errors (CodeMirror logs crashed extensions with console.error)
  const realError = console.error.bind(console)
  console.error = (...a) => { E2E.console.push(a.map((x) => (x && x.message) || String(x)).join(' ').slice(0, 300)); realError(...a) }
  window.addEventListener('error', (e) => E2E.console.push('uncaught: ' + e.message))
  const fail = (msg) => { E2E.errors.push(msg); throw new Error(msg) }
  function emit(event, payload) { for (const id of listeners.get(event) || []) callbacks.get(id)?.({ event, id, payload }) }
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
      case 'plugin:fs|copy_file': { files.set(norm(args.toPath), files.get(norm(args.fromPath)) ?? ''); return null }
      case 'plugin:fs|read_dir': {
        const p = norm(args.path)
        if (!dirs.has(p)) fail('ENOENT dir ' + p)
        const kids = new Map()
        for (const f of files.keys()) if (f.startsWith(p + '/')) { const rest = f.slice(p.length + 1); kids.set(rest.split('/')[0], (kids.get(rest.split('/')[0]) || false) || rest.includes('/')) }
        for (const d of dirs) if (d.startsWith(p + '/')) kids.set(d.slice(p.length + 1).split('/')[0], true)
        return [...kids].map(([name, isDirectory]) => ({ name, isDirectory, isFile: !isDirectory, isSymlink: false }))
      }
      case 'plugin:dialog|open': return window.__VROOT__
      case 'plugin:event|listen': { if (!listeners.has(args.event)) listeners.set(args.event, []); listeners.get(args.event).push(args.handler); return args.handler }
      case 'plugin:event|unlisten': return null
      case 'plugin:event|emit': emit(args.event, args.payload); return null
      // Like Tauri: if the page listens for close-requested, closing asks the page first.
      case 'plugin:window|close': { if ((listeners.get('tauri://close-requested') || []).length) emit('tauri://close-requested', null); else E2E.destroyed = true; return null }
      case 'plugin:window|destroy': E2E.destroyed = true; return null
      default: return null
    }
  }
  window.__TAURI_INTERNALS__ = {
    invoke,
    transformCallback(cb, once) { const id = nextId++; callbacks.set(id, (d) => { if (once) callbacks.delete(id); return cb && cb(d) }); return id },
    unregisterCallback: (id) => callbacks.delete(id),
    runCallback: (id, d) => callbacks.get(id)?.(d),
    callbacks,
    convertFileSrc: (p) => p,
    metadata: { currentWindow: { label: 'main' }, currentWebview: { windowLabel: 'main', label: 'main' } },
  }
  window.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener: () => {} }
})()
`

// --- the author's manual test, scripted ---
const DRIVER = String.raw`
(async () => {
  const lines = []
  const say = (m) => lines.push(m)
  const check = (ok, what) => say((ok ? 'ok   ' : 'FAIL ') + what)
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  const until = async (fn, ms = 10000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const v = fn(); if (v) return v; await sleep(50) } return null }
  const E = window.__E2E__
  const manifest = JSON.parse(E.files.get(window.__VROOT__ + '/project.json'))
  const chapterPath = window.__VROOT__ + '/chapters/' + manifest.tree[0].children[0].file
  // CodeMirror keeps its view on the content element; typing through it runs the
  // same update path as a keystroke (extensions, Yjs binding, update listeners).
  const viewOf = (cm) => cm.cmView?.rootView?.view || cm.cmTile?.root?.view || null
  const typeAtEnd = (cm, text) => {
    const view = viewOf(cm)
    if (!view) throw new Error('CodeMirror view not reachable from the DOM')
    view.focus()
    view.dispatch({ changes: { from: view.state.doc.length, insert: text }, userEvent: 'input.type' })
  }
  const status = () => (document.querySelector('.status .save')?.textContent || '').trim()
  try {
    const openBtn = await until(() => [...document.querySelectorAll('.launch-item')].find((b) => b.textContent.includes('Open project')))
    if (!openBtn) throw new Error('launcher never rendered')
    openBtn.click()
    const cm = await until(() => document.querySelector('.cm-content'))
    if (!cm) throw new Error('chapter editor never opened')
    await sleep(300)

    // 1. type, then just wait (autosave)
    typeAtEnd(cm, ' E2E-WAITED')
    await sleep(80)
    check(viewOf(cm).state.doc.toString().includes('E2E-WAITED'), 'typing reaches the editor state')
    await sleep(7000)
    check((E.files.get(chapterPath) || '').includes('E2E-WAITED'), 'text is on disk a few seconds after typing stops')
    say('     status after the wait: "' + status() + '"')

    // 2. type, then close the window straight away (title-bar ✕)
    typeAtEnd(cm, ' E2E-CLOSED')
    await sleep(80)
    document.querySelector('.wc.close').click()
    await until(() => E.destroyed, 6000)
    const saved = E.files.get(chapterPath) || ''
    check(saved.includes('E2E-CLOSED'), 'text typed right before closing is on disk')
    check(E.destroyed, 'window actually closes after saving')
    check(saved.startsWith('---') && saved.includes('id: '), 'chapter frontmatter survives the save')

    // 3. nothing written to the wrong place
    const strays = [...E.files.keys()].filter((p) => !E.original.has(p) && !p.startsWith(window.__VROOT__ + '/chapters/.drafts/'))
    check(strays.length === 0, 'no stray files written' + (strays.length ? ': ' + strays.join(', ') : ''))
    check(E.console.length === 0, 'no errors in the app console' + (E.console.length ? ': ' + [...new Set(E.console)].join(' | ') : ''))
    check(E.errors.length === 0, 'no failed disk operations' + (E.errors.length ? ': ' + E.errors.join(' | ') : ''))
  } catch (err) {
    say('FAIL ' + (err && err.stack || err))
  }
  const pre = document.createElement('pre'); pre.id = 'e2e-result'; pre.textContent = lines.join('\n'); document.body.appendChild(pre)
})()
`

// --- build, assemble, run ---
const chrome = CHROME_PATHS.find((p) => fs.existsSync(p))
if (!chrome) { console.error('No Chrome/Edge found for the headless run.'); process.exit(1) }
execSync(`npx vite build --base=./ --outDir "${OUT_DIR}" --emptyOutDir --logLevel error`, { cwd: ROOT, stdio: 'inherit' })
const safeJson = (value) => JSON.stringify(value).replace(/</g, '\\u003c')
const index = fs.readFileSync(path.join(OUT_DIR, 'index.html'), 'utf8').replace(/\scrossorigin/g, '')
const page = index
  .replace('<head>', `<head><script>window.__FIXTURE__=${safeJson(readFixture(PROJECT_DIR))};window.__VROOT__=${safeJson(VIRTUAL_ROOT)}</script><script>${TAURI_MOCK}</script>`)
  .replace('</body>', `<script>${DRIVER}</script></body>`)
const pagePath = path.join(OUT_DIR, 'e2e.html')
fs.writeFileSync(pagePath, page)
const run = spawnSync(chrome, ['--headless=new', '--disable-gpu', '--allow-file-access-from-files', '--virtual-time-budget=40000', '--window-size=1440,900', '--dump-dom', pathToFileURL(pagePath).href], { encoding: 'utf8', maxBuffer: 200 * 1024 * 1024 })
const result = (run.stdout || '').match(/<pre id="e2e-result">([\s\S]*?)<\/pre>/)
if (!result) { console.error('No result from the page.\n', (run.stderr || '').slice(-2000)); process.exit(1) }
const text = result[1].replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&')
console.log(text)
process.exit(/^FAIL/m.test(text) ? 1 : 0)

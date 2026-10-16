import { Show, createEffect, createSignal, on, onCleanup } from 'solid-js'

// Animated reveal boxes. Opening: the height grows to fit while the contents
// stay transparent, then the contents fade in. Closing: the contents fade out,
// then the height shrinks away. A toggle mid-animation picks up from wherever
// the box had got to. With "reduce motion" set in the OS, it just snaps.
//
// Animations are driven frame by frame (requestAnimationFrame + inline styles),
// so every step is plain DOM state that can be read back and tested.

const FADE_IN_MS = 150
const FADE_OUT_MS = 90
const easeOut = (t) => 1 - (1 - t) ** 3
const easeIn = (t) => t * t

const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

// Taller boxes take a little longer, so a long list doesn't snap open.
const heightDuration = (distance) => Math.min(320, 160 + Math.abs(distance) * 0.15)

// ------------------------------------------------------------------ tweens
const running = new WeakMap() // element → Map(property → tween)

function stop(element, property) {
  const tween = running.get(element)?.get(property)
  if (!tween) return
  tween.cancelled = true
  running.get(element).delete(property)
  tween.resolve(false)
}

// Stop an element's animations, leaving it where they had got to.
function settle(element) {
  const tweens = element && running.get(element)
  if (tweens) for (const property of [...tweens.keys()]) stop(element, property)
}

// Animate one inline style from → to. Resolves true when done, false if stopped.
function tween(element, property, from, to, duration, easing) {
  stop(element, property)
  const unit = property === 'height' ? 'px' : ''
  const write = (value) => { element.style[property] = `${value}${unit}` }
  return new Promise((resolve) => {
    write(from)
    if (duration <= 0 || from === to) { write(to); resolve(true); return }
    const record = { cancelled: false, resolve }
    if (!running.has(element)) running.set(element, new Map())
    running.get(element).set(property, record)
    const start = performance.now()
    const step = () => {
      if (record.cancelled) return
      const t = Math.min(1, Math.max(0, (performance.now() - start) / duration))
      write(from + (to - from) * easing(t))
      if (t < 1) { requestAnimationFrame(step); return }
      running.get(element)?.delete(property)
      resolve(true)
    }
    requestAnimationFrame(step)
  })
}

const opacityNow = (element) => Number(element.style.opacity || getComputedStyle(element).opacity)
const fadeOutOf = (element) => tween(element, 'opacity', opacityNow(element), 0, FADE_OUT_MS * opacityNow(element), easeIn)
function fadeIn(element, from) {
  return tween(element, 'opacity', from, 1, FADE_IN_MS * (1 - from), easeOut).then((done) => {
    if (done) element.style.opacity = ''
    return done
  })
}

// ------------------------------------------------------------------ layout changes
// Animate a layout change across several boxes (FLIP): fade `fadeOut` away,
// apply the change, then move each box from its old height to its new one and
// fade `fadeIn()` (queried after the change) in once the heights have arrived.
//   boxes: () => elements whose height may change
//   apply: () => void — must update the DOM synchronously
//   done:  () => void — called once everything has settled
export function morph({ boxes, apply, fadeOut = [], fadeIn: arriving = () => [], done = () => {} }) {
  if (reducedMotion()) { apply(); done(); return }
  const leaving = fadeOut.filter(Boolean)
  Promise.all(leaving.map(fadeOutOf)).then(() => {
    const targets = boxes().filter(Boolean)
    targets.forEach(settle)
    const before = targets.map((element) => element.getBoundingClientRect().height)
    targets.forEach((element) => { element.style.height = ''; element.style.flex = ''; element.style.overflow = '' })
    apply()
    leaving.forEach((element) => { element.style.opacity = '' })
    const shown = arriving().filter(Boolean)
    shown.forEach((element) => { settle(element); element.style.opacity = '0' })
    const after = targets.map((element) => element.getBoundingClientRect().height)
    const moves = targets.map((element, i) => {
      if (Math.abs(before[i] - after[i]) < 1) return true
      element.style.flex = '0 0 auto'
      element.style.overflow = 'hidden'
      return tween(element, 'height', before[i], after[i], heightDuration(after[i] - before[i]), easeOut).then((finished) => {
        if (finished) { element.style.height = ''; element.style.flex = ''; element.style.overflow = '' }
      })
    })
    return Promise.all(moves).then(() => Promise.all(shown.filter((element) => element.isConnected).map((element) => fadeIn(element, 0))))
  }).then(done)
}

// A right-panel pane (.pane with .pbar and .pbody): panes share the column's
// height, so opening one also resizes its neighbours.
const busyPanes = new WeakSet()
export function togglePane(pane, apply) {
  if (busyPanes.has(pane)) return
  busyPanes.add(pane)
  const opening = pane.classList.contains('collapsed')
  const body = () => pane.querySelector(':scope > .pbody')
  morph({
    boxes: () => [...pane.parentElement.children].filter((element) => element.classList.contains('pane')),
    apply,
    fadeOut: opening ? [] : [body()],
    fadeIn: () => (opening ? [body()] : []),
    done: () => busyPanes.delete(pane),
  })
}

// ------------------------------------------------------------------ component
// Children that animate in and out with `when`. They stay mounted while closing.
export default function Reveal(props) {
  // 1. Refs
  let box
  let inner

  // 2. Signals
  const [Mounted, SetMounted] = createSignal(Boolean(props.when))
  let turn = 0 // the latest toggle; an older animation chain stops when this moves on
  let enterHidden = false // newly mounted contents start transparent (set before the first paint)

  // 4. Effects
  createEffect(on(() => Boolean(props.when), (open) => (open ? expand() : collapse()), { defer: true }))
  onCleanup(() => { turn++; settle(box); settle(inner) })

  // 5. Handlers
  function rest() {
    box.style.height = ''
    box.style.overflow = ''
    if (inner) inner.style.opacity = ''
  }
  function expand() {
    const mine = ++turn
    settle(box)
    settle(inner)
    if (reducedMotion()) { SetMounted(true); rest(); return }
    const wasMounted = Mounted()
    const from = box.getBoundingClientRect().height
    box.style.height = `${from}px`
    box.style.overflow = 'hidden'
    enterHidden = !wasMounted // read by the ref when Show creates the contents
    SetMounted(true)
    queueMicrotask(() => {
      enterHidden = false
      if (mine !== turn || !inner) return
      const opacity = wasMounted ? opacityNow(inner) : 0
      inner.style.opacity = String(opacity)
      const to = inner.offsetHeight
      tween(box, 'height', from, to, heightDuration(to - from), easeOut).then((finished) => {
        if (!finished || mine !== turn) return
        box.style.height = ''
        box.style.overflow = ''
        fadeIn(inner, opacity)
      })
    })
  }
  function collapse() {
    const mine = ++turn
    settle(box)
    settle(inner)
    if (reducedMotion() || !inner) { SetMounted(false); inner = null; rest(); return }
    const from = box.getBoundingClientRect().height
    box.style.height = `${from}px`
    box.style.overflow = 'hidden'
    fadeOutOf(inner).then((faded) => {
      if (!faded || mine !== turn) return
      return tween(box, 'height', from, 0, heightDuration(from), easeOut).then((finished) => {
        if (!finished || mine !== turn) return
        SetMounted(false)
        inner = null
        rest()
      })
    })
  }

  // 7. JSX
  return (
    <div class="reveal" ref={box}>
      <Show when={Mounted()}>
        <div class="reveal-in" ref={(element) => { inner = element; if (enterHidden) element.style.opacity = '0'; enterHidden = false }}>{props.children}</div>
      </Show>
    </div>
  )
}

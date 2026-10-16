import { Show, createSignal } from 'solid-js'

// One app-wide toast: a short message, optionally with Undo. Any module can call
// showToast(); <ToastHost/> (rendered once in the Shell) displays it.
const [TOAST, SET_TOAST] = createSignal(null)
let TOAST_TIMER

export function showToast(message, undo) {
  clearTimeout(TOAST_TIMER)
  SET_TOAST({ message, undo })
  TOAST_TIMER = setTimeout(() => SET_TOAST(null), undo ? 6000 : 3000)
}

export default function ToastHost() {
  // 5. Handlers
  async function handleUndo() {
    const toast = TOAST()
    SET_TOAST(null)
    await toast?.undo?.()
  }

  // 7. JSX
  return (
    <Show when={TOAST()}>
      {(toast) => (
        <div class="toast" role="status">
          <span>{toast().message}</span>
          <Show when={toast().undo}>
            <button onClick={handleUndo}>Undo</button>
          </Show>
        </div>
      )}
    </Show>
  )
}

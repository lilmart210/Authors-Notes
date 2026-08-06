# Coding Conventions

House rules for all frontend work — Solid components, plain JS modules, CSS,
anything under `Main/Client/`. These are binding; code that doesn't follow them
gets corrected.

## Naming

Names are verbose. Describe purpose, not type — `OrderQuantity`, not `Q` or `qty`.

- **Global / module constants** → `ALL_CAPS_SNAKE` (`MAXIMUM_SPEED`, `SOME_LIMIT`)
- **Element refs** → `PascalCase` + `Ref` suffix (`ParentDivRef`, `CanvasRef`)
- **Signal getters** → `PascalCase`. Setter is `Set` + getter name (`[Position, SetPosition]`)
- **Event handlers** → `handle` + Event (`handleMouseMove`)

## Component layout

Inside `function App()`, sections appear in this order:

```jsx
import './style.css'

// Module-level constants
const MAXIMUM_SPEED = 100
const [SOME_LIMIT, SET_SOME_LIMIT] = createSignal(23243243)

function App() {
  // 1. Refs
  let ParentDivRef

  // 2. Signals
  const [Position, SetPosition] = createSignal({ x: 0, y: 0 })

  // 3. onMount
  onMount(() => {})

  // 4. Effects
  createEffect(() => {})

  // 5. Functions / handlers
  function handleMouseMove(event) {
    SetPosition({ x: event.clientX, y: event.clientY })
  }

  // 6. JSX-helper builders (className, formatting)
  const cardClass = () => `card ${IsActive() ? 'active' : ''}`

  // 7. return JSX
  return (
    <div ref={ParentDivRef} onMouseMove={handleMouseMove} class={cardClass()}>
      The mouse position is {Position().x} x {Position().y}

      {/* Iterables always go inside <For> */}
      <For each={Items()}>
        {(item, index) => <Row item={item} index={index()} />}
      </For>
    </div>
  )
}
```

## Functions vs arrows

- `function` keyword for named definitions.
- Arrow functions for short calcs or inline callbacks (inside `.map()`, `<For>`, event props).

## Long / complex JSX values

Anything passed into a JSX prop that's more than a trivial expression gets
extracted to a helper above `return`. Don't inline ugly computations into
`<Component prop={...long thing...}>`.

- Trivial → arrow returning the value.
- Complex → multi-line function.

ClassName is the most common case:

```js
// trivial
const cardClass = () => `card ${IsActive() ? 'active' : ''}`

// complex
function cardClass() {
  const names = ['card']
  if (IsActive()) names.push('active')
  if (HasError()) names.push('error')
  return names.join(' ')
}
```

Same rule applies to any other prop — `style`, `data-*`, computed text, `each`, etc.

## CSS

- **Reuse components, recolor them** — if a button needs a new color, pass it in
  via props or CSS variables. Don't fork the component.
- **Global styling lives in `index.css`** — colors, spacing tokens, shared
  selectors. Use CSS variables (`--color-accent`, etc.) so components pull from
  the same source.
- **Component-specific CSS** goes in its own file next to the component, but only
  for things that can't be expressed via global tokens. Keep it small and tidy.

## Contexts

Context providers return **objects with named keys, never positional arrays**.
Consumers destructure by name.

```jsx
// good
export function UserProvider(props) {
    const [LoggedIn] = createSignal(false)
    async function Login(email, password) { /* ... */ }

    const userInfo = { LoggedIn, Login }
    return <UserContext.Provider value={userInfo}>{props.children}</UserContext.Provider>
}

// consumer
const { LoggedIn, Login } = useUser()
```

```jsx
// bad — positional destructure breaks the moment you add or remove a field
const [LoggedIn, User, { Login }] = useUser()
```

## Positioning floating UI

Use CSS `position: relative` (wrapper) + `position: absolute` (body) for
dropdowns, popovers, tooltips. Do **not** read `getBoundingClientRect()` and
write `top` / `left` style values from JS.

```jsx
// good — declarative, self-correcting
<div class="wrapper">                    {/* position: relative */}
    <button>Trigger</button>
    <Show when={Open()}>
        <div class="dropdown">...</div>   {/* position: absolute; top: calc(100% + 8px); right: 0 */}
    </Show>
</div>
```

Reach for `<Portal>` only when the floating element actually needs to escape an
`overflow: hidden` ancestor — not by default.

## Reuse before reinventing

If a generic component already exists (e.g. `<DropDown>`, `<Modal>`), build on it
instead of hand-rolling the same open/close/positioning logic for every consumer.
A second use site is the moment to make sure the first one is generic enough to be
reused, not the moment to write a parallel implementation.

## External classes

Non-component classes (broker clients, data adapters): constructor holds initial
state and method binds. Methods below.

```js
class BrokerClient {
  constructor() {
    // variables and initializations
    this.connected = false

    // bind the functions here
    this.connect = this.connect.bind(this)
    this.handleMessage = this.handleMessage.bind(this)
  }

  connect() { /* ... */ }
  handleMessage(msg) { /* ... */ }
}
```

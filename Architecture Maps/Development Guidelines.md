# Development Guidelines

How work is carried out on this project (process, not code style — for code style
see [Coding Conventions](./Coding%20Conventions.md)).

## Dev servers and ports

- **Do not start long-running dev servers** (`npm run dev`, `vite`, etc.). The
  author runs their own; a second one causes port/state conflicts and disrupts
  their workflow.
- **Never kill ports or processes** (`taskkill`, `pkill`, killing PIDs bound to a
  port). Other things are running on the machine.
- The client's Vite dev server is pinned to **port 1420** (Tauri convention) with
  `strictPort: true`, kept clear of Vite's default 5173. `tauri.conf.json`'s
  `devUrl` matches. Don't change this without a reason.

## Verifying changes

- **Verify headlessly.** Prefer `npm run build`, type/lint checks, unit tests, or
  one-shot scripts over booting a server and probing it.
- If a runtime or browser check is genuinely required, ask the author to run it —
  don't spin up a server to do it.

## Application principles

- **Self-contained / offline-first.** The app must fully work with **no internet
  connection**. All core features — writing, the project format, export — run locally
  with no external services or network calls. The *only* permitted network use is
  **checking for updates** (and downloading an update the user opts into). This means
  export tooling must be bundled (e.g. a Pandoc sidecar or in-app libraries), never a
  cloud API; fonts/assets ship with the app. "Downloadable marking packs" should also
  degrade gracefully offline (bundle a default set).

## Documentation

- Conventions, guides, and design decisions live here in **`Architecture Maps/`** —
  the durable source of truth. Any new standing rule the author gives goes into a
  doc here, not just held loosely.

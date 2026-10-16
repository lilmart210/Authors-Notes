# Nothing is bundled here anymore

Pandoc used to ship inside the installer as a Tauri sidecar (`bundle.externalBin`).
It is now **downloaded on first use**, like the AI engine:

- `src-tauri/src/components.rs` pins each program (version, download URL, size,
  SHA-256). The app downloads the zip, checks the hash, and unpacks it into the
  app's local data folder (`components/<name>/<version>/`).
- Export (EPUB, Word, Print PDF) and the rendered preview download Pandoc the first
  time they need it. The export dialog lists "Pandoc · downloads on first export".
- The URLs point at the projects' own GitHub releases for now; switching to the
  author's own server only means changing them in `components.rs`.

No binary is needed to run `tauri dev` or `tauri build`. Anything placed in this
folder is ignored by git.

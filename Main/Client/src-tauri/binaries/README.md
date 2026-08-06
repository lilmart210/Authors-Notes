# Pandoc sidecar binaries

The DOCX / EPUB / HTML export profiles shell out to **Pandoc**, bundled as a
Tauri sidecar (`bundle.externalBin: ["binaries/pandoc"]` in `tauri.conf.json`).

Tauri looks for the binary named with the **Rust target triple** of the machine
you build on:

```
binaries/pandoc-<target-triple>[.exe]
```

## One-time setup (per platform you build for)

1. **Find your target triple:**
   ```
   rustc -Vv
   ```
   Read the `host:` line. On this Windows machine it is almost certainly
   `x86_64-pc-windows-msvc`.

2. **Download Pandoc** for your OS from https://github.com/jgm/pandoc/releases
   (grab the standalone `pandoc.exe` from the Windows zip).

3. **Copy + rename** it into this folder using the triple, e.g. on Windows:
   ```
   src-tauri/binaries/pandoc-x86_64-pc-windows-msvc.exe
   ```
   (macOS: `pandoc-aarch64-apple-darwin` / `pandoc-x86_64-apple-darwin`, no
   extension. Linux: `pandoc-x86_64-unknown-linux-gnu`.)

## ⚠ Important

`externalBin` makes Tauri **require** this file to exist for the current target.
Until you drop the binary in, `npm run tauri dev` **and** `tauri build` will fail
with *"external binary not found"*. Place the binary first, then run as usual.

The native **Web serial / Markdown / Plain** export profiles need none of this —
they're pure JS and always work. Only the *(Pandoc)* profiles use this binary.

This folder is intentionally kept in the repo for the README; the binaries
themselves are large and platform-specific — don't commit them.

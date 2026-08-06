# AI / LLM Integration Research

Can Authors Notes include local AI (autocomplete, checking, rewriting) — hosted by our
server as downloadable add-ons — in a JavaScript/Tauri app, without Python and without
being stuck on CPU? **Yes.** This doc explains how, and fits it to the app's
[self-contained/offline principle](./Development%20Guidelines.md).

## The premise, corrected

Two common assumptions are out of date as of 2026:

- **"AI is a Python thing."** Python dominates *training*. For *inference* (just running
  a trained model), there is a mature C++/Rust/JS ecosystem that needs **no Python at
  runtime**. We do not bundle a Python interpreter.
- **"JS models are CPU-only."** Not anymore. **WebGPU** gives GPU-accelerated inference
  inside the webview (3–10× faster than the old WASM path), and the Rust host can use the
  GPU **natively** (CUDA / DirectML / Vulkan) via bundled inference engines. HuggingFace
  models *do* run in JS — that's exactly what **Transformers.js** is.

## Two places to run a model in a Tauri app

Tauri = a web frontend (SolidJS) + a native **Rust host**. A model can run in either.

### A. Rust host side — the powerful path (recommended for heavy work)

Bundle a native inference engine as a **Tauri sidecar** (an external binary shipped inside
the app) or via Rust crates, and expose it to the SolidJS UI through Tauri commands (IPC).

- **llama.cpp** — the standard local-LLM engine. Loads **GGUF** model files; runs on CPU
  and GPU (CUDA for Nvidia, **DirectML** for any Windows GPU, Vulkan, Metal). Ship the
  `llama-server` binary as a sidecar, or use Rust bindings.
- **Candle** — HuggingFace's pure-**Rust** ML framework (CUDA/Metal). Runs HuggingFace
  models natively in our Rust host — directly answers "can we use HuggingFace models."
- **candle-vllm / mistral.rs** — Rust inference servers bundleable as sidecars; compiled
  with the right GPU feature (`cuda`, etc.).
- Pros: full native GPU access, largest models, best throughput (100+ tok/s on GPU).
- Cons: per-platform compiled binaries; larger install.

### B. Webview side — the simple path (good for light features)

Run the model in JavaScript inside the WebView (Windows WebView2 supports WebGPU):

- **Transformers.js** (HuggingFace, official) — runs 1,200+ HF models via ONNX Runtime,
  **WebGPU** accelerated. Great for embeddings, classification, NER, short summarization,
  autocomplete.
- **WebLLM** (MLC) — full chat LLMs (Llama, Phi, Mistral, Qwen…) entirely in-browser on
  WebGPU.
- **wllama** — llama.cpp compiled to WASM for GGUF models in-browser.
- Pros: no native binary, cross-platform "for free," simplest to ship.
- Cons: bounded by webview/WebGPU limits; best for smaller models and high-frequency,
  low-complexity tasks.

**2026 rule of thumb:** browser/WebGPU for high-frequency light tasks (autocomplete,
classify, embed, short summarize); native host engine for heavy reasoning / big models.

## The "server hosts AI, downloaded as add-ons" architecture

This fits the app's existing update-server plan perfectly and stays offline-first:

- **The server does NOT run inference.** It's a **model registry** — it hosts the model
  files (GGUF / ONNX / safetensors) + a JSON manifest (name, size, hash, task, min-VRAM,
  license). Same shape as the update/download server already planned.
- **The client downloads a model add-on once**, verifies the hash, stores it locally, then
  loads it into the local engine (A or B). After download, everything runs **offline** —
  the only network use is the initial fetch, exactly like checking for updates. ✅
- Add-ons can be tiered by hardware (a 1–3B quantized model for modest machines, larger for
  GPUs). The manifest lets the app recommend what the user's machine can run.

## Important: not everything called "AI" needs an LLM

The user framed features as "type checking and autocompletion." Worth separating, because
half of it is cheaper, faster, and 100% reliable **without** a model:

- **Deterministic / rule-based (no model):**
  - **Spell check** — a dictionary (e.g. Hunspell), already offline.
  - **Name / terminology consistency** — the glossary-driven checker (flag *ShouShan* vs
    *Shoushan*) runs off the entity index we already designed. This is the writing-app
    analog of a compiler's "type checking": validate the prose against the story bible.
  - **Structure/lint** — missing scene breaks, POV tag mismatches, chapter-order gaps.
  - These are exact, instant, and need no download. Much of the author's
    "parse characters per chapter / autocomplete names" idea is *retrieval*, not ML.
- **Generative (needs a local LLM):**
  - **Prose autocomplete** (next-sentence continuation) — a small quantized LLM.
  - **Rewrite / expand / tighten**, brainstorming, summarizing a chapter, "describe this
    character in the established voice."
  - **Semantic search** over the manuscript — an embedding model (small, fast, WebGPU-ok).

## Recommendation for Authors Notes

1. **Build the deterministic layer first** — spell check, glossary consistency, structure
   lint, name autocomplete from the entity index. Biggest value, zero model cost, fully
   offline. (Matches the author's actual pain points from the case study.)
2. **Design AI as an optional add-on subsystem** behind a clean interface, so models are
   downloadable and swappable and the core app never depends on them.
3. **Start generative features in the WebView** with **Transformers.js/WebLLM + WebGPU**
   (embeddings for semantic search; a small LLM for autocomplete) — simplest, cross-platform.
4. **Add a Rust-side llama.cpp/Candle sidecar later** for heavier local models and best GPU
   throughput, if demand warrants.
5. **Server = model registry** (manifest + files), reusing the planned update server. No
   cloud inference; nothing breaks offline once a model is downloaded.

## Sources

- [Transformers.js (HuggingFace)](https://github.com/huggingface/transformers.js/) ·
  [Transformers.js v3: WebGPU support](https://huggingface.co/blog/transformersjs-v3)
- [Running LLMs in the browser: WebGPU, Transformers.js, Chrome built-in AI](https://pockit.tools/blog/run-llms-browser-webgpu-transformers-js-chrome-built-in-ai-guide/) ·
  [WebGPU vs WASM inference benchmarks](https://www.sitepoint.com/webgpu-vs-webasm-transformers-js/)
- [Building a Private AI Desktop App with Rust, Tauri, and llama.cpp](https://explore.n1n.ai/blog/building-private-ai-desktop-app-rust-tauri-llamacpp-2026-06-09) ·
  [A Technical Blueprint for Local-First AI with Rust and Tauri](https://medium.com/@Musbell008/a-technical-blueprint-for-local-first-ai-with-rust-and-tauri-b9211352bc0e)
- [Building Local LM Desktop Applications with Tauri](https://medium.com/@dillon.desilva/building-local-lm-desktop-applications-with-tauri-f54c628b13d9) ·
  [Local voice-to-text with Tauri 2, whisper.cpp, llama.cpp](https://dev.to/auratech/i-built-a-local-voice-to-text-app-with-rust-tauri-20-whispercpp-and-llamacpp-heres-how-32h5)
- [Candle (Rust ML framework)](https://github.com/huggingface/candle) ·
  [WebLLM (MLC)](https://github.com/mlc-ai/web-llm) ·
  [llama.cpp](https://github.com/ggml-org/llama.cpp)

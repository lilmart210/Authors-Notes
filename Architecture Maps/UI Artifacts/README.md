# UI Artifacts

The agreed UI **design mockups** — self-contained HTML (open any in a browser). These are the
pixel-level spec the real app (`Main/Client`) is built to match. Kept here so they survive.

| File | What it designs | Published Artifact |
| ---- | --------------- | ------------------ |
| `01 - Main UI.html` | Main writing workspace — chrome, explorer (arcs), page editor, right dock (cast + chapter plan + topics), scoped search | https://claude.ai/code/artifact/4de7ef64-50f0-4569-a89d-1b18e99a0f7b |
| `02 - Plotline Timeline.html` | Timeline / plotline editor — arc-grouped chapter spine, typed notes, future-ideas lane | https://claude.ai/code/artifact/78062c30-38f4-4d5c-b023-7823c6290407 |
| `03 - Entities and Mentions.html` | Entity/mentions model — typed browser, entity page (aliases, infobox, sections, relationships), consistency banner, mentions | https://claude.ai/code/artifact/8b1cb357-c8ca-4ddf-8056-0e6604c2c921 |
| `04 - Groups Attributes Graph.html` | Groups + inheritable attributes + relationship graph ("character creator") | https://claude.ai/code/artifact/2c0afea5-c1ad-48fc-8577-a6bece8d30c9 |

**Rule:** when building UI, port these files' CSS/DOM verbatim and wire real data — don't
re-derive the look. See `../UI Design.md` for the written spec.

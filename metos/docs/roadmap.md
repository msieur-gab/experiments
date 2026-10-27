# Roadmap

Goal: the knowledge base usable from any hardware, with as few dependencies as possible, living on a USB stick, an SD card or a very cheap board. The KB format (Markdown entries + `vocab.txt`) stays the same on every target.

## Runtime layers

Each layer covers what the one before cannot.

| # | Option | Runs on | Needs | Status |
|---|---|---|---|---|
| 0 | **The files themselves** + `CONTENTS.md` | anything that shows text | nothing | working |
| 1 | **Browser page** (`index.html` + `kb.js`) | almost any computer | a browser; unreliable from USB on phones | working |
| 2 | **Self-running USB package**: `metos.com` (redbean) serving the stick, saving onto it | Windows, macOS, Linux, BSDs; x86-64 and 64-bit ARM | nothing installed; Apple Silicon needs Apple's command line tools once | built; real-hardware tests next (`HANDOFF.md`) |
| 3 | **One portable binary**: engine in C, built with Cosmopolitan | Linux, macOS, Windows, BSDs on x86-64 and Arm64 | nothing installed | planned |
| 4 | **ESP32 knowledge beacon**: board + SD card makes its own Wi-Fi and serves the page; phones join and ask | any phone or laptop with Wi-Fi | €5–10 board, battery | idea |
| 5 | **Bootable stick / Forth**: tiny Linux or Dusk OS booting into metos | old PCs, Pi | the most work | later |

Notes:
- Cosmopolitan "actually portable executables" run on Linux, macOS, FreeBSD, OpenBSD, NetBSD and Windows, on x86-64 and Arm64, with no emulator. The file rewrites its header for the system it runs on, so keep a spare copy. 32-bit ARM is not covered.
- On the ESP32 beacon, the phone's browser runs the engine; the board only serves files. Adding knowledge = copying `.md` files to the SD card.

## Done

- Engine, entry format, vocabulary, 17 seed entries (water, plants, vegetables, fire, shelter)
- Browser page from `file://`, terminal version, offline PWA over http
- Pictures as text (`pic` blocks) with a photo-to-picture tool
- Guided editor: new and edit, findability test, save to folder
- Departure Mono typeface

## Open questions

- Which seed entries need checking against primary sources (those marked "verify" in `source`).
- Multilingual: one entry per language, or `aka` in several languages (works today), or translated sections?
- Picture size limits per entry, and whether to keep SVG at all.
- How to share knowledge between sticks: merge folders, or a simple sync?
- Hand-drawn pictures: photo of a pen drawing → `doc-scan` straightening → `pic` block.

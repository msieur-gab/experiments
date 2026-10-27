# Decisions

Newest last. Each entry: what was decided, why, and what was rejected.

## 2026-10-27

**Dusk OS is a reference and a later target, not the base.** Dusk is a 32-bit Forth OS with no networking, concurrency or crypto. It fits a bare-metal Pi Zero 2W (the Pi 1–3 target), not the Orange Pi's H618. metos borrows its ethos (operators, not users; small enough to understand) and may run on it later in Forth.

**Name: metos.** From *mētis*, Greek for practical, cunning know-how, + OS. Rejected *xero* (Greek *xērós* means "dry").

**Engine: JS offline PWA to start, C as the target, Forth also a target.** JS gives a head start and runs on any browser; the engine is written to port (whole-number scores, word lists, no libraries). First device: laptop.

**Seed topics:** water, wild edible plants, vegetable growing, fire and shelter.

**Files: one flat folder, structure inside each file.** Entries get copied one at a time; a category in a folder path is lost on the first copy. Many topics belong to several categories (nettle is food, medicine and fibre). Tags in the file instead. Folders may exist for browsing but never carry meaning.

**Header: plain `key: value` lines, not YAML.** Easy to parse in any language, including Forth. Keys: title, aka, tags, warn, see, source.

**Markdown over plain text.** Markdown can carry drawings (ASCII diagrams in code blocks, images) and sections; plain `.txt` still loads.

**Abstain below a threshold, ask when two entries tie.** A named subject must score at least 10; two named entries within 3 points get "which one do you mean?".

**Lives in `msieur-gab/experiments`, folder `metos/`, branch `metos`.**

**Runtime layers recorded** (see `roadmap.md`): files themselves → browser page → portable binary → ESP32 beacon → bootable/Forth.

**SVG is portable as text but not as a picture.** It needs a large renderer that microcontrollers and Dusk don't have. If kept, limit to a subset (line, polyline, polygon, rect, circle, ellipse, text).

**Pictures as text: the `pic` block.** A photo is converted into a palette (up to 16 colours) plus one character per pixel, characters ordered by brightness so the raw text reads as ASCII art. Chosen over ASCII-only, Braille and PBM because one block serves every target: colour in browsers, half-blocks in terminals, raw text anywhere, trivial to paint from C or Forth. Tested with a dandelion: recognisable from 48 px wide (≈2.5 KB); 96 px (≈10 KB) is the sweet spot. Pictures must not be abstract: you should recognise the plant.

**A picture in the summary is the entry's portrait** and shows on every card for that entry. Pixels are excluded from search; the caption is searchable.

**No stock images in the repo.** The test dandelion looked like a stock illustration and was not committed.

**Guided editor for writing entries by hand.** Chosen over a plain text template in the app. Includes editing existing entries, a "try a question" box that checks the entry can be found, saving into the kb folder on desktop Chrome (refreshing `kb.js`), and `kb/_template.md` for any text editor. Files starting with `_` are never entries.

**Typeface: Departure Mono, everywhere.** A pixel monospace (SIL OFL), matching the pixel pictures and the terminal spirit. Embedded as a data URI so it loads from `file://`. Sizes snapped to its 11 px grid (11, 16.5, 22).

**Project memory lives in the repo** (`CLAUDE.md`, `docs/`) so any Claude instance can pick up the context.

**USB stick: redbean app with a plain-file fallback.** Gab chose this from four options (plain stick, redbean app, C terminal program, bootable stick). `metos.com` is redbean with `server/init.lua` inside. It serves the stick's own folder, reads `kb/` live, saves entries from the editor onto the stick in any browser, and refreshes `kb.js` and `CONTENTS.md` so opening `index.html` without the program still works. Only the computer itself may save; other devices can read. The C terminal program comes next as the no-browser layer.

**redbean built from source** (Cosmopolitan 4.0.2) as one file for x86-64 and 64-bit ARM, because an x86-only build refuses to start on Apple Silicon and ARM Linux. On Apple Silicon the first run needs Apple's command line tools.

**Handoff to Claude Code on the desktop** for real-hardware tests: `HANDOFF.md`.

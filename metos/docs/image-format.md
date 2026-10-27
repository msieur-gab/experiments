# Pictures and drawings

How entries carry pictures so they survive on every target: browser, phone via an ESP32 beacon, C binary, Forth.

## Current answer: pictures as text, inside the entry

Code: `pic.js`. A photo goes through the pipeline and comes out as a ```` ```pic ```` block in the entry's Markdown:

- first line `WxH`
- a palette: one character + one colour (hex) per line, darkest first, up to 16
- a blank line, then one row of characters per row of pixels

Characters come from the ramp `@#%&8B$W*o+=~-:.` (dense to light), so the raw block already reads as ASCII art. No spaces, because editors strip trailing spaces and would shorten rows.

| target | shows |
|---|---|
| browser, phone, ESP32 beacon | full colour picture |
| colour terminal (`cli.js`) | coloured half blocks, two pixels per character |
| any text display | the raw rows, a rough ASCII picture |
| C or Forth with a screen | palette + one pixel per character, a trivial parser |

Pipeline: decode (the browser reads any format) → crop (whole, centre square, close-up) → shrink in halving steps → median-cut palette refined by k-means → optional Floyd–Steinberg dithering → characters by brightness.

## Findings from the dandelion test (2026-10-27)

- Recognisable at every size tried: 48 px wide ≈ 2.5 KB of text, 64 px ≈ 4.4 KB, 96 px ≈ 10 KB, 128 px ≈ 17 KB. 96 px shows the seed clock and the leaf teeth clearly.
- 16 vs 8 colours: little visible difference. Flat looks cleaner than dithered at 16; dithering helps at 4.
- 2 colours gives a silhouette, still recognisable as the plant.
- In raw text only brightness survives, so bright yellow flowers look pale on white.
- Pictures must not be abstract: the point is to recognise the plant. But identification must never rest on the picture alone; the written description and warnings carry the safety.

## Placement

A picture in the summary is the entry's portrait and shows on every card for that entry. Its caption is searchable; its pixels are excluded from search. Every picture needs a caption that works without the picture.

## Other levels, still useful

1. **Caption**: always, works everywhere.
2. **ASCII diagram** in a code block for essential how-to drawings (fire lay, filter layers). Hand-made beats automatic for diagrams.
3. **SVG**: browsers draw it natively, but full SVG needs a large renderer that microcontrollers and Dusk OS don't have. If kept, limit it to a subset: `line`, `polyline`, `polygon`, `rect`, `circle`, `ellipse`, `text`; no curves, markers, CSS, filters or external fonts. `kb/img/fire-lay.svg` currently breaks this subset.

## Why not other formats

- **PNG / JPEG**: universal in browsers, but decoding needs compression code, and not readable as text.
- **PBM / BMP**: trivial to decode, but browsers don't show PBM, and PBM has no colour. The pic block covers the same need, with colour, and stays readable.
- **Braille / Unicode blocks** as the stored format: sharper than ASCII in text, but need fonts with those glyphs. Departure Mono, the app's typeface, has half blocks but no Braille.

## Sources of pictures

Own photos of plants, or pen drawings on paper, photographed and straightened with the `doc-scan` experiment in this repo, then converted. No stock images in the repo.

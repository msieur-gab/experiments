# metos

A small knowledge base for when things break down: water, wild plants, growing food, fire and shelter. You ask in plain words. It finds the entry and shows what the entry says, word for word, or tells you it doesn't know. It never makes up an answer.

The name joins *mētis*, the Greek word for practical, hands-on know-how, and *OS*.

## Try it

**From a USB stick or SD card, no server:** open `index.html` in any browser.

**In a terminal:**

```
node cli.js "how do I make water safe"
node cli.js                      # interactive
node cli.js --why "is wild garlic safe"
```

**As an installable offline app:** serve the folder over http (`python3 -m http.server`) and open it once. A service worker keeps it working offline.

Things to ask:

- how do I make water safe
- is wild garlic safe
- what plants can I eat
- how to grow potatoes
- sodis on a cloudy day
- what does hemlock look like
- hypothermia symptoms

## Adding knowledge

Drop a `.md` or `.txt` file into `kb/`. Then either:

- run `node build.js` so `index.html` picks it up from the stick, or
- in the browser, use **open folder** and pick the `metos` or `kb` folder, or
- use the terminal version, which reads `kb/` directly.

**add entries** in the browser (or dragging files onto the page) adds them for the session only.

## Entry format

```
title: Stinging nettle
aka: nettle, nettles, urtica, ortie
tags: plant wild food fibre
warn: Wear gloves to pick. Do not eat raw unless crushed or dried.
see: foraging-rules
source: where this comes from

One or two sentences: the summary.

## identify
...

## eat
...
```

**Header** — plain `key: value` lines at the top, ended by a blank line. No YAML, so it is easy to parse in any language, including Forth.

| key | what it does |
|---|---|
| `title` | The entry's name. Required in practice; without a header, the first line is used. |
| `aka` | Other names people use, comma-separated. This is the main way questions find the entry, so add the names people actually say, in any language. |
| `tags` | Topics, space-separated. Used for "what plants can I eat" style questions. |
| `warn` | Always shown first, before any answer. |
| `see` | Related entries, by file name without `.md`. |
| `source` | Where the information comes from. Say plainly when it still needs checking. |

**Sections** — `## name` blocks. Questions point to them: "how to grow potatoes" opens `## grow`. The section names metos knows are listed as `aspect` lines in `vocab.txt`: `how`, `identify`, `eat`, `cook`, `grow`, `harvest`, `store`, `safety`, `use`, `symptoms`. Use any of them, in any order.

**Files are self-describing.** Everything that matters is inside the file, so an entry can be copied on its own to another machine and still work. There are no folders to sort into.

## Drawings

Markdown keeps drawings possible, at two levels:

- **ASCII diagrams** in a code block. They survive everywhere, including a terminal and a future Forth version with no graphics. Prefer these for anything essential.
- **Images** with `![caption](img/name.svg)`, stored in `kb/img/`. The browser shows the picture; text-only versions show the caption instead, so always write a caption that explains the picture on its own.

`kb/fire.md` and `kb/water-filter.md` show both.

## Teaching it words

`vocab.txt` holds everything metos understands about intent: which words mean "how to", which mean "is it safe", which point to which section, which words count as which tag, and which words to ignore. It is plain text, one list per line. When a question goes wrong, tick **why this answer** (or use `--why` in the terminal) to see the scores, then fix the entry's `aka` or a line in `vocab.txt`.

## How it decides

1. Split the question into words, lowercase, strip accents and simple plurals.
2. **Intent** (`how`, `safety`, `list`, `about`) and **aspect** (a section) from the longest matching phrase in `vocab.txt`.
3. **Subject**: score every entry. A name or `aka` in the question gives 10 points plus 1 per word, so longer names win. Each matching tag gives 3. Other question words found in the text give 1 each, capped at 4.
4. Decide:
   - a topic with no clear subject, or an explicit list request → list the entries with those tags
   - best score below 10, or no name matched → "I don't have that", with the closest entries
   - two named entries within 3 points → ask which one
   - otherwise → answer from the asked section, else the section the intent implies, else the section containing most of the remaining words, else the summary

Whole numbers only, no model, no floats.

## Files

| file | role |
|---|---|
| `kb/` | the knowledge, one entry per file, images in `kb/img/` |
| `vocab.txt` | the words metos understands |
| `engine.js` | understanding and answering. No DOM, runs in browser and Node. |
| `app.js`, `index.html` | browser shell |
| `cli.js` | terminal shell |
| `build.js` | packs `kb/` and `vocab.txt` into `kb.js` for `file://` use |
| `sw.js`, `manifest.json` | offline install over http |

## Towards C and Forth

`engine.js` is the part to port. It was written for that: integer scores, word lists, no libraries, and only a few simple text patterns. The KB format stays the same on every target, so the same stick can carry the browser version, a C binary and a Forth version side by side.

In Forth, an intent can become a word and the entry the value it acts on; `vocab.txt` maps naturally onto Forth's own dictionary.

## Status

Prototype. The seed entries were written for testing the idea. Those marked "verify before relying on it" in their `source` line have not been checked against a primary source yet, and none of this replaces local, expert knowledge.

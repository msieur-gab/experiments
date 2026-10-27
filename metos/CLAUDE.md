# metos — context for Claude

Read this first, then `docs/`. They hold what has been decided and why, so you don't have to rediscover it or reopen settled questions.

## What this is

metos is an offline knowledge base for when things break down: water, wild plants, growing food, fire and shelter. People ask in plain words; metos finds the right entry and shows what it says, word for word, or says it doesn't know. It never generates an answer.

The name joins *mētis*, the Greek word for practical, hands-on know-how, and *OS*.

Owner: Gab (msieur-gab). It's a sibling of his ptiLU / TermNL work on small, authorable intent engines, and of his interest in permacomputing (Collapse OS, Dusk OS, Forth).

## Where things are

| path | what |
|---|---|
| `README.md` | how to use it, the entry format, how it decides |
| `docs/vision.md` | why it exists, principles, what it must never do |
| `docs/decisions.md` | dated log of decisions, with the reason for each |
| `docs/roadmap.md` | runtime layers (browser, USB, C, ESP32, Forth) and what's next |
| `docs/image-format.md` | how pictures are stored as text, findings from tests |
| `docs/sessions/` | condensed records of design conversations |
| `kb/` | the knowledge: one Markdown entry per file, `kb/img/` for images |
| `vocab.txt` | every word metos understands about intent and sections |
| `engine.js` | understanding and answering; the part to port to C and Forth |

## Rules that hold everywhere

- **Extractive only.** Show entry text as written. Never paraphrase, summarise or generate an answer.
- **Abstain rather than guess.** Below threshold, say "I don't have that", and offer close entries.
- **Warnings first.** An entry's `warn` line is shown before anything else.
- **Self-describing files.** Everything an entry needs is inside its file; no meaning in folder names.
- **One format for every target.** Browser, terminal, C, Forth and microcontrollers all read the same `kb/` and `vocab.txt`.
- **Port-friendly engine.** Whole-number scores, plain word lists, no libraries, few and simple text patterns.
- **Pictures as text.** ```` ```pic ```` blocks (palette + one character per pixel); every picture has a caption that works without it.
- **Safety content needs sources.** Numbers (doses, times) come from a named source; anything unverified says "verify before relying on it".
- **No stock images in the repo.** It's public. Use own photos and drawings, or clearly licensed ones.

## Working with Gab

- Propose options and let him choose before building anything new.
- Commit as `msieur-gab`. Never mention Claude in commit messages.
- Keep replies concise and human-readable; lead with the result.
- When revising something he approved, change only what he asked.
- Test before saying it works: `node cli.js --why "question"`, and a headless browser for the page.

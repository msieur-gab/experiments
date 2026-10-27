# Handoff: metos on a USB stick

For Claude Code on Gab's desktop, picking this up for the first time. Written 2026-10-27, at the end of the session that built metos.

## Read first

1. `CLAUDE.md`: what metos is and the rules that hold everywhere. The important ones: answers are **extractive only** (entry text as written, never generated), metos **abstains** when unsure, **warnings come first**, and **safety numbers need a named source**. A wrong answer about a wild plant or water treatment can hurt someone; that's the stake behind every rule.
2. `docs/decisions.md`: what was decided and why. Don't reopen these without asking Gab.
3. `docs/sessions/2026-10-27.md`: how we got here.

Working with Gab: propose options and let him choose before building anything new; commit as `msieur-gab` and never mention Claude in commit messages; keep replies short and human.

## Where things stand

Everything works in the cloud sandbox where it was built (Linux x86-64, headless). It has **not yet been tried on a real stick, a real Windows PC or a real Mac**. That's the next step.

The stick package:

```
METOS/
  metos.com            double-click: starts metos, opens the browser
  index.html + *.js    the app as plain files; also the fallback (open index.html)
  kb/                  the knowledge, one Markdown file per entry
  vocab.txt            the words metos understands
  kb.js, CONTENTS.md   generated; kept current by metos.com and build.js
  fonts/               Departure Mono, embedded
  READ-ME-FIRST.txt    instructions for whoever finds the stick
```

Build it with `sh package.sh` (needs node and zip). It writes `dist/METOS/`; copy that folder onto the stick.

`metos.com` is redbean (single-file web server, Cosmopolitan) with `server/init.lua` packed inside as `/.init.lua`. See `server/README.md` for what it does and where the binary comes from. `server/bin/redbean.com` was built from Cosmopolitan 4.0.2 source in the sandbox because redbean.dev was blocked there.

## Verified in the sandbox

- Serves its own folder when started from elsewhere; `GET /api/kb` returns all entries live from disk.
- Saving from the editor writes `kb/<name>.md` on the stick and refreshes `kb.js` and `CONTENTS.md`.
- Saving is refused from another machine on the network (403), including with a forged `X-Forwarded-For: 127.0.0.1` header.
- Bad file names are refused: `../x.md`, `_t.md`, `.x.md`, `a/b.md`, `x.exe`.
- A `.md` file copied into `kb/` by hand appears on reload.
- The app through the server shows "on this stick", the editor's button reads "Save to stick", and a saved entry is found after reload.
- Opening `index.html` as a plain file still works, using `kb.js`.

## To test on real machines

Do these with a real USB stick, and note what happens on each:

1. **Windows 10/11**: double-click `metos.com`. Expect a SmartScreen warning ("More info" → "Run anyway"), a console window, then the browser on `http://127.0.0.1:8080`. Write an entry, save it, check `kb/` on the stick.
2. **Mac, Apple Silicon**: Finder won't run `.com` files on double-click. In Terminal: `sh /Volumes/<stick>/METOS/metos.com`. The first run needs Apple's command line tools (`xcode-select --install`); it should say so if they're missing. Check whether Gatekeeper blocks it.
3. **Mac, Intel**: same as above, without the command line tools step.
4. **Linux**: `./metos.com`, or `sh ./metos.com` if that fails. On systems set up to run Windows programs through Wine, it may launch under Wine instead; the fix is in Cosmopolitan's docs (binfmt_misc).
5. **Read-only or FAT32 stick**: does saving work? (exFAT/FAT32 should; check permissions on Mac and Linux.)
6. **Port 8080 busy**: what happens? redbean may fail to start. Consider choosing a free port in `init.lua` if so.
7. **Fallback**: on each machine, also open `index.html` directly.
8. **Phones**: `./metos.com -l 0.0.0.0`, then open `http://<computer's IP>:8080` on a phone on the same Wi-Fi. Reading should work; saving should be refused.

Record results in `docs/decisions.md` (or a new `docs/tests/` note), and fix `READ-ME-FIRST.txt` wherever the real behaviour differs from what it says.

## Known gaps and next steps

- **Mac double-click**: there's no double-click launcher yet. A small `START-MAC.command` file (`cd "$(dirname "$0")" && sh ./metos.com`) would make it one double-click; check Gatekeeper's reaction.
- **Windows file extension**: `.com` is fine, but some setups prefer `.exe`. A copy named `metos.exe` is an option if `.com` causes trouble.
- **32-bit systems** (old Raspberry Pi OS, old PCs) can't run `metos.com`; they use `index.html`.
- **Next layer (planned)**: the engine in C as a terminal program, built with Cosmopolitan (no browser at all), then Forth. `engine.js` was written to port: whole-number scores, word lists, no libraries.
- **Seed content**: entries marked "verify before relying on it" in their `source` line still need checking against primary sources.

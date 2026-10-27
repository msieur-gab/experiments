# metos server (metos.com)

`metos.com` is [redbean](https://redbean.dev), a single-file web server from the Cosmopolitan project, with `init.lua` packed inside it as `/.init.lua`. `package.sh` does the packing.

## What it does

- Serves the folder it sits in, so the app and `kb/` come from the stick itself, never from a copy inside the program.
- `GET /api/kb`: every entry in `kb/` plus `vocab.txt`, read live from disk. An entry dropped into `kb/` appears on reload, with no build step.
- `POST /api/entry?name=x.md`: writes the entry into `kb/`, then refreshes `kb.js` and `CONTENTS.md` so the no-program fallback stays current. Only accepted from the same computer (loopback, checked with `GetClientAddr`); phones on the network can read, not write.
- Refreshes `kb.js` and `CONTENTS.md` at start, in case entries were added by hand.
- Opens the browser.

The page detects the server by calling `api/kb`. Opened as a plain file, it falls back to `kb.js`.

## Where `bin/redbean.com` comes from

Built from source, Cosmopolitan release 4.0.2, because redbean.dev and cosmo.zip were not reachable from the build environment:

```sh
git clone --depth 1 --branch 4.0.2 https://github.com/jart/cosmopolitan
cd cosmopolitan
make -j o//tool/net/redbean                      # x86-64 (about 6 min on 2 cores)
make -j m=aarch64 o/aarch64/tool/net/redbean     # 64-bit ARM
make -j m=aarch64 o/aarch64/ape/ape.elf          # ARM launcher
# join both into one file that runs on either, then copy redbean's bundled files in
B=.cosmocc/3.9.2/bin
$B/apelink -l o//ape/ape.elf -l o/aarch64/ape/ape.elf -M ape/ape-m1.c \
  -o redbean.com o//tool/net/redbean.dbg o/aarch64/tool/net/redbean.dbg
$B/zipcopy o//tool/net/redbean.dbg redbean.com
```

The make step downloads its own compiler (cosmocc 3.9.2) from the project's GitHub releases. The result is 6.8 MB; its SHA-256 is in `bin/redbean.com.sha256`.

An x86-only build is not enough: its launcher refuses to start on Apple Silicon and ARM Linux.

On a normal connection, the simpler route is to download the official build from https://redbean.dev and use it as `bin/redbean.com`.

redbean is under the ISC licence (`bin/LICENSE-redbean.txt`).

## Where it runs

One file for Windows, macOS, Linux, FreeBSD, OpenBSD and NetBSD, on x86-64 and 64-bit ARM.

Known limits:
- **Apple Silicon Macs**: the first run needs Apple's command line developer tools (`xcode-select --install`), which the program asks for if missing. Intel Macs don't.
- **Windows / macOS** warn about an unsigned program on first run.
- **32-bit systems** (old Raspberry Pi OS, very old PCs) are not supported. Use `index.html` there.
- The file adapts itself to the system on first run; keep a spare copy on the stick.

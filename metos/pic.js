/*
 * metos pictures: a photo turned into text that any device can show.
 *
 * Format (lives inside an entry, in a ```pic code block):
 *
 *   64x43                  width x height in pixels
 *   @ 1b2a12               palette: one character and one colour per line,
 *   # 3d5a1f               darkest first, up to 16 colours
 *   ...
 *                          blank line
 *   @@##%%&&...            one row of characters per row of pixels
 *
 * Characters are picked by brightness (dense for dark, light for pale), so
 * the raw block already reads as ASCII art. A browser paints it in colour,
 * a colour terminal with half blocks, and C or Forth can paint it pixel by
 * pixel: read the palette, then one character = one pixel.
 *
 * No libraries, integers only. Works in a browser and in Node.
 */
(function (root) {
  'use strict';

  // 16 characters from dense (dark) to light. No spaces: editors strip
  // trailing spaces, which would shorten rows.
  var RAMP = '@#%&8B$W*o+=~-:.';

  // ---- resizing (box filter), for Node; browsers use canvas instead -------

  function resize(src, sw, sh, tw, th) {
    var out = new Uint8ClampedArray(tw * th * 4);
    for (var y = 0; y < th; y++) {
      var y0 = Math.floor(y * sh / th), y1 = Math.max(y0 + 1, Math.floor((y + 1) * sh / th));
      for (var x = 0; x < tw; x++) {
        var x0 = Math.floor(x * sw / tw), x1 = Math.max(x0 + 1, Math.floor((x + 1) * sw / tw));
        var r = 0, g = 0, b = 0, n = 0;
        for (var yy = y0; yy < y1; yy++) for (var xx = x0; xx < x1; xx++) {
          var i = (yy * sw + xx) * 4;
          r += src[i]; g += src[i + 1]; b += src[i + 2]; n++;
        }
        var o = (y * tw + x) * 4;
        out[o] = r / n; out[o + 1] = g / n; out[o + 2] = b / n; out[o + 3] = 255;
      }
    }
    return out;
  }

  // ---- palette -------------------------------------------------------------

  function luma(c) { return (c[0] * 299 + c[1] * 587 + c[2] * 114) / 1000; }

  // Perceptual-ish distance: green matters most, blue least.
  function dist(a, b) {
    var dr = a[0] - b[0], dg = a[1] - b[1], db = a[2] - b[2];
    return 2 * dr * dr + 4 * dg * dg + 3 * db * db;
  }

  // Median cut: split the box of colours with the widest spread, at its
  // median, until there are n boxes. Each box's average is a palette colour.
  function medianCut(pixels, n) {
    var boxes = [pixels];
    while (boxes.length < n) {
      var bi = -1, best = 0, ch = 0;
      for (var i = 0; i < boxes.length; i++) {
        var box = boxes[i];
        if (box.length < 2) continue;
        for (var c = 0; c < 3; c++) {
          var lo = 255, hi = 0;
          for (var j = 0; j < box.length; j++) { var v = box[j][c]; if (v < lo) lo = v; if (v > hi) hi = v; }
          var score = (hi - lo) * box.length;
          if (score > best) { best = score; bi = i; ch = c; }
        }
      }
      if (bi < 0) break;
      var target = boxes[bi].slice().sort(function (a, b) { return a[ch] - b[ch]; });
      var mid = target.length >> 1;
      boxes.splice(bi, 1, target.slice(0, mid), target.slice(mid));
    }
    return boxes.map(function (box) {
      var r = 0, g = 0, b = 0;
      for (var i = 0; i < box.length; i++) { r += box[i][0]; g += box[i][1]; b += box[i][2]; }
      return [Math.round(r / box.length), Math.round(g / box.length), Math.round(b / box.length)];
    });
  }

  function nearest(pal, c) {
    var bi = 0, bd = Infinity;
    for (var i = 0; i < pal.length; i++) { var d = dist(pal[i], c); if (d < bd) { bd = d; bi = i; } }
    return bi;
  }

  // A few rounds of k-means to settle the median-cut colours.
  function refine(pixels, pal, rounds) {
    for (var r = 0; r < rounds; r++) {
      var sum = pal.map(function () { return [0, 0, 0, 0]; });
      for (var i = 0; i < pixels.length; i++) {
        var k = nearest(pal, pixels[i]), s = sum[k];
        s[0] += pixels[i][0]; s[1] += pixels[i][1]; s[2] += pixels[i][2]; s[3]++;
      }
      pal = pal.map(function (c, k) {
        var s = sum[k];
        return s[3] ? [Math.round(s[0] / s[3]), Math.round(s[1] / s[3]), Math.round(s[2] / s[3])] : c;
      });
    }
    return pal;
  }

  // ---- encoding ------------------------------------------------------------

  // rgba: pixels already at the final size. opts.colors (2..16), opts.dither.
  function encode(rgba, w, h, opts) {
    opts = opts || {};
    var n = Math.max(2, Math.min(16, opts.colors || 16));
    var pixels = [];
    for (var i = 0; i < w * h; i++) pixels.push([rgba[i * 4], rgba[i * 4 + 1], rgba[i * 4 + 2]]);

    var pal = refine(pixels, medianCut(pixels, n), 4);
    // remove duplicates, sort darkest first so characters follow brightness
    var seen = {};
    pal = pal.filter(function (c) { var k = c.join(','); if (seen[k]) return false; seen[k] = 1; return true; });
    pal.sort(function (a, b) { return luma(a) - luma(b); });

    // spread the ramp across however many colours there are
    var chars = pal.map(function (c, i) {
      return RAMP[pal.length === 1 ? 0 : Math.round(i * (RAMP.length - 1) / (pal.length - 1))];
    });

    var idx = new Array(w * h);
    if (opts.dither) {
      // Floyd–Steinberg, on a working copy
      var work = pixels.map(function (p) { return p.slice(); });
      for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) {
        var p = work[y * w + x];
        var c = [clamp(p[0]), clamp(p[1]), clamp(p[2])];
        var k = nearest(pal, c);
        idx[y * w + x] = k;
        var e = [c[0] - pal[k][0], c[1] - pal[k][1], c[2] - pal[k][2]];
        spread(work, w, h, x + 1, y, e, 7);
        spread(work, w, h, x - 1, y + 1, e, 3);
        spread(work, w, h, x, y + 1, e, 5);
        spread(work, w, h, x + 1, y + 1, e, 1);
      }
    } else {
      for (var m = 0; m < pixels.length; m++) idx[m] = nearest(pal, pixels[m]);
    }

    var lines = [w + 'x' + h];
    pal.forEach(function (c, i) { lines.push(chars[i] + ' ' + hex(c)); });
    lines.push('');
    for (var row = 0; row < h; row++) {
      var s = '';
      for (var col = 0; col < w; col++) s += chars[idx[row * w + col]];
      lines.push(s);
    }
    return lines.join('\n');
  }

  function clamp(v) { return v < 0 ? 0 : v > 255 ? 255 : v; }
  function spread(work, w, h, x, y, e, f) {
    if (x < 0 || x >= w || y >= h) return;
    var p = work[y * w + x];
    p[0] += e[0] * f / 16; p[1] += e[1] * f / 16; p[2] += e[2] * f / 16;
  }
  function hex(c) {
    return c.map(function (v) { return ('0' + v.toString(16)).slice(-2); }).join('');
  }

  // ---- decoding ------------------------------------------------------------

  function parse(text) {
    var lines = String(text).replace(/\r/g, '').split('\n');
    var m = /^(\d+)x(\d+)/.exec(lines[0] || '');
    if (!m) return null;
    var w = +m[1], h = +m[2], colors = {}, i = 1;
    for (; i < lines.length && lines[i].trim(); i++) {
      var pm = /^(\S)\s+#?([0-9a-fA-F]{6})/.exec(lines[i]);
      if (pm) {
        var v = parseInt(pm[2], 16);
        colors[pm[1]] = [(v >> 16) & 255, (v >> 8) & 255, v & 255];
      }
    }
    var rows = lines.slice(i + 1, i + 1 + h);
    return { w: w, h: h, colors: colors, rows: rows };
  }

  // RGBA buffer, for a canvas or a framebuffer
  function toRGBA(pic) {
    var out = new Uint8ClampedArray(pic.w * pic.h * 4), grey = [128, 128, 128];
    for (var y = 0; y < pic.h; y++) {
      var row = pic.rows[y] || '';
      for (var x = 0; x < pic.w; x++) {
        var c = pic.colors[row[x]] || grey, o = (y * pic.w + x) * 4;
        out[o] = c[0]; out[o + 1] = c[1]; out[o + 2] = c[2]; out[o + 3] = 255;
      }
    }
    return out;
  }

  // Colour terminal: each character cell shows two pixels, top and bottom,
  // with the upper half block in the top colour over the bottom colour.
  function toAnsi(pic) {
    var out = [], grey = [128, 128, 128];
    for (var y = 0; y < pic.h; y += 2) {
      var top = pic.rows[y] || '', bot = pic.rows[y + 1] || '', s = '';
      for (var x = 0; x < pic.w; x++) {
        var a = pic.colors[top[x]] || grey, b = y + 1 < pic.h ? (pic.colors[bot[x]] || grey) : a;
        s += '\x1b[38;2;' + a.join(';') + 'm\x1b[48;2;' + b.join(';') + 'm▀';
      }
      out.push(s + '\x1b[0m');
    }
    return out.join('\n');
  }

  var api = { RAMP: RAMP, resize: resize, encode: encode, parse: parse, toRGBA: toRGBA, toAnsi: toAnsi };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.metosPic = api;
})(this);

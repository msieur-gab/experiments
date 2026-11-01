/*
 * metos browser shell. All understanding happens in engine.js; this file
 * only loads entries, shows answers and renders a small subset of Markdown.
 */
(function () {
  'use strict';

  var log = document.getElementById('log');
  var input = document.getElementById('q');
  var countEl = document.getElementById('count');

  var files = [];        // [{ name, text }]
  var vocabText = '';
  var images = {};       // "img/x.svg" -> object URL, when a folder was opened
  var kb = null;
  var model = window.METOS_MODEL || null;   // the learned layer (learn.js)
  var outOfScope = '';                     // kb/_out-of-scope.md, teaches "I don't have that"
  var learning = false;

  var EXAMPLES = [
    'how do I make water safe',
    'is wild garlic safe',
    'what plants can I eat',
    'how to grow potatoes',
    'sodis on a cloudy day',
    'how to make a fire'
  ];

  // ---- loading -------------------------------------------------------------

  function rebuild() {
    kb = metos.buildKB(files, vocabText, model);
    countEl.textContent = kb.entries.length + ' entries';
    relearnIfNeeded();
  }

  // metos relearns where it runs: when the entries no longer match what the
  // model was taught (an entry saved, a folder opened), it learns again here,
  // in the browser, from the same files. It takes a few seconds.
  function relearnIfNeeded() {
    if (!window.metosLearn || learning || !files.length) return;
    var oos = metosLearn.bullets(outOfScope);
    var fp = metosLearn.fingerprint(metosLearn.examples(kb, oos));
    if (model && model.fingerprint === fp) return;
    learning = true;
    countEl.textContent = kb.entries.length + ' entries · learning…';
    setTimeout(function () {
      var m = metosLearn.learn(metos.buildKB(files, vocabText, null), oos);
      learning = false;
      model = m;
      kb = metos.buildKB(files, vocabText, model);
      countEl.textContent = kb.entries.length + ' entries · learnt';
      say('note', 'Learnt again from ' + m.examples + ' sentences in ' + m.seconds + ' s.');
    }, 60);
  }

  function readFile(f) {
    return new Promise(function (resolve) {
      var r = new FileReader();
      r.onload = function () { resolve(r.result); };
      r.onerror = function () { resolve(''); };
      r.readAsText(f);
    });
  }

  function upsert(name, text) {
    for (var i = 0; i < files.length; i++) {
      if (files[i].name === name) { files[i].text = text; return; }
    }
    files.push({ name: name, text: text });
  }

  // A picked folder replaces the KB. Expected layout: entries at the top of
  // the folder (or in a kb/ subfolder), images in img/, optional vocab.txt.
  function openFolder(list) {
    var top = [], inKb = [], vocabFile = null, jobs = [];
    var newImages = {};
    Array.prototype.forEach.call(list, function (f) {
      var rel = (f.webkitRelativePath || f.name).split('/').slice(1).join('/');
      var rel2 = rel.replace(/^kb\//, '');
      if (/(^|\/)vocab\.txt$/i.test(rel)) { vocabFile = f; return; }
      // files starting with _ (like _template.md) are not entries
      if (/\.(md|txt)$/i.test(f.name) && rel2.indexOf('/') < 0 && !/^(readme\.|_)/i.test(f.name)) {
        (rel !== rel2 ? inKb : top).push(f);
      }
      if (/\.(svg|png|jpe?g|gif|webp)$/i.test(f.name)) newImages[rel2] = URL.createObjectURL(f);
    });
    // picked the whole metos folder: use its kb/ subfolder
    var entries = inKb.length ? inKb : top;
    if (!entries.length) { say('note', 'No .md or .txt entries found in that folder.'); return; }
    files = [];
    entries.forEach(function (f) {
      jobs.push(readFile(f).then(function (t) { files.push({ name: f.name, text: t }); }));
    });
    if (vocabFile) jobs.push(readFile(vocabFile).then(function (t) { vocabText = t; }));
    Promise.all(jobs).then(function () {
      images = newImages;
      rebuild();
      say('note', 'Opened folder: ' + kb.entries.length + ' entries' + (vocabFile ? ', with its own vocab.txt.' : '.'));
    });
  }

  function addFiles(list) {
    var jobs = [], added = [];
    Array.prototype.forEach.call(list, function (f) {
      if (/^vocab\.txt$/i.test(f.name)) {
        jobs.push(readFile(f).then(function (t) { vocabText = t; added.push('vocabulary'); }));
      } else if (/\.(md|txt)$/i.test(f.name)) {
        jobs.push(readFile(f).then(function (t) { upsert(f.name, t); added.push(f.name); }));
      }
    });
    Promise.all(jobs).then(function () {
      if (!added.length) return;
      rebuild();
      say('note', 'Added ' + added.join(', ') + '. These stay until you reload; to keep them, put the files in kb/ and run build.js.');
    });
  }

  // ---- markdown (small subset) --------------------------------------------

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function inline(s) {
    return esc(s)
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/`([^`]+)`/g, '<code>$1</code>');
  }

  function imageSrc(src) {
    if (/^(https?:|data:|blob:)/.test(src)) return src;
    return images[src] || ('kb/' + src);
  }

  // A ```pic block becomes a real picture: paint its pixels on a canvas.
  function picToCanvas(p) {
    var c = document.createElement('canvas');
    c.width = p.w; c.height = p.h;
    c.getContext('2d').putImageData(new ImageData(metosPic.toRGBA(p), p.w, p.h), 0, 0);
    return c;
  }

  function picToImg(text, caption) {
    var p = window.metosPic && metosPic.parse(text);
    if (!p) return null;
    return '<figure class="pic"><img src="' + picToCanvas(p).toDataURL() + '" alt="' + esc(caption || 'picture') +
      '" style="aspect-ratio:' + p.w + '/' + p.h + '">' + (caption ? '<figcaption>' + esc(caption) + '</figcaption>' : '') + '</figure>';
  }

  function md(text) {
    var lines = String(text).split('\n'), html = [], i = 0;
    while (i < lines.length) {
      var l = lines[i];
      if (/^```/.test(l)) {
        var code = [], picCaption = /^```pic\b\s*(.*)$/.exec(l);
        i++;
        while (i < lines.length && !/^```/.test(lines[i])) code.push(lines[i++]);
        i++;
        var drawn = picCaption && picToImg(code.join('\n'), picCaption[1]);
        html.push(drawn || '<pre>' + esc(code.join('\n')) + '</pre>');
        continue;
      }
      var img = /^!\[([^\]]*)\]\(([^)]+)\)\s*$/.exec(l);
      if (img) {
        html.push('<figure><img src="' + esc(imageSrc(img[2])) + '" alt="' + esc(img[1]) + '" loading="lazy"><figcaption>' + esc(img[1]) + '</figcaption></figure>');
        i++;
        continue;
      }
      if (/^\s*[-*]\s+/.test(l) || /^\s*\d+\.\s+/.test(l)) {
        var ordered = /^\s*\d+\./.test(l), items = [];
        while (i < lines.length && (ordered ? /^\s*\d+\.\s+/ : /^\s*[-*]\s+/).test(lines[i])) {
          items.push('<li>' + inline(lines[i].replace(/^\s*([-*]|\d+\.)\s+/, '')) + '</li>');
          i++;
        }
        html.push((ordered ? '<ol>' : '<ul>') + items.join('') + (ordered ? '</ol>' : '</ul>'));
        continue;
      }
      if (!l.trim()) { i++; continue; }
      var para = [];
      while (i < lines.length && lines[i].trim() && !/^```/.test(lines[i]) && !/^!\[/.test(lines[i]) &&
             !/^\s*([-*]|\d+\.)\s+/.test(lines[i])) para.push(lines[i++]);
      html.push('<p>' + inline(para.join(' ')) + '</p>');
    }
    return html.join('');
  }

  // ---- rendering -----------------------------------------------------------

  function el(tag, cls, html) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  }

  function chip(label, onClick, extra) {
    var b = el('button', 'chip' + (extra ? ' ' + extra : ''));
    b.type = 'button';
    b.textContent = label;
    b.addEventListener('click', onClick);
    return b;
  }

  function firstLine(e) {
    var s = e.sections.summary || '';
    return s.split('\n')[0];
  }

  function byId(id) {
    for (var i = 0; i < kb.entries.length; i++) if (kb.entries[i].id === id) return kb.entries[i];
    return null;
  }

  function whyText(u) {
    if (!u) return '';
    var lines = ['intent: ' + u.intent + '   aspect: ' + (u.aspect || '-') + '   tags: ' + (u.tags.join(' ') || '-')];
    if (u.model) {
      lines.push('model: ' + u.model.map(function (m) { return m.id + ' ' + m.p + '%'; }).join(', '));
      if (u.clues) lines.push('clues: ' + u.clues.map(function (c) { return c[0] + ' ' + (c[1] >= 0 ? '+' : '') + c[1].toFixed(2); }).join(', '));
      lines.push('answers at ' + Math.round(metos.SURE * 100) + '%, asks from ' + Math.round(metos.MAYBE * 100) + '%, danger entries shown from ' + Math.round(metos.DANGER * 100) + '%');
      lines.push('word lists:');
    }
    u.ranked.slice(0, 5).forEach(function (r) {
      lines.push(r.score + '  ' + r.entry.id + '  (' + r.why.join(', ') + ')');
    });
    return lines.join('\n');
  }

  function addWhy(card, u) {
    if (!u) return;
    var d = el('details');
    d.appendChild(el('summary', null, 'why this answer'));
    var pre = el('pre');
    pre.textContent = whyText(u);
    d.appendChild(pre);
    card.appendChild(d);
  }

  function showEntry(r) {
    var e = r.entry, card = el('div', 'card');
    card.appendChild(el('h2', null, esc(e.title)));
    if (r.section !== 'summary') card.appendChild(el('div', 'sec', esc(r.section)));
    if (e.warn) card.appendChild(el('div', 'warn', esc(e.warn)));
    // a danger entry the question also comes close to: shown before the answer
    (r.check || []).forEach(function (d) {
      var box = el('div', 'warn check');
      var b = el('button', 'link');
      b.type = 'button';
      b.textContent = 'Check also: ' + d.title;
      b.addEventListener('click', function () { show(metos.open(kb, d.id), d.title); });
      box.appendChild(b);
      if (d.warn) box.appendChild(el('div', null, esc(d.warn)));
      card.appendChild(box);
    });
    if (r.missing) card.appendChild(el('p', 'note', 'This entry has nothing on “' + esc(r.missing) + '”. Here is the summary.'));
    // A picture in the summary is the entry's portrait: show it on every card.
    var portrait = r.section !== 'summary' && /(^|\n)(```pic[^\n]*\n[\s\S]*?\n```)/.exec(e.sections.summary || '');
    if (portrait) card.appendChild(el('div', 'body', md(portrait[2])));
    card.appendChild(el('div', 'body', md(r.text)));
    if (r.list && r.list.length) card.appendChild(entryList(r.list));

    var chips = el('div', 'chips');
    e.order.forEach(function (s) {
      if (s === r.section) return;
      chips.appendChild(chip(s, function () { show(metos.open(kb, e.id, s), e.title + ' / ' + s); }));
    });
    e.see.forEach(function (id) {
      var other = byId(id);
      if (other) chips.appendChild(chip('→ ' + other.title, function () { show(metos.open(kb, id), other.title); }, 'see'));
    });
    if (window.metosEditor) chips.appendChild(chip('edit', function () { metosEditor.open(e.id); }, 'edit'));
    if (chips.childNodes.length) card.appendChild(chips);
    if (e.source) card.appendChild(el('div', 'src', 'Source: ' + esc(e.source)));
    addWhy(card, r.u);
    return card;
  }

  function entryList(entries) {
    var ul = el('ul', 'list');
    entries.forEach(function (e) {
      var li = el('li');
      var b = el('button');
      b.type = 'button';
      b.textContent = e.title;
      b.addEventListener('click', function () { show(metos.open(kb, e.id), e.title); });
      li.appendChild(b);
      if (e.tags.indexOf('danger') >= 0 && e.warn) li.appendChild(el('span', 'first danger', esc(e.warn)));
      else li.appendChild(el('span', 'first', esc(firstLine(e))));
      ul.appendChild(li);
    });
    return ul;
  }

  function render(r) {
    if (r.type === 'answer') return showEntry(r);
    var card = el('div', 'card');
    if (r.type === 'list') {
      card.appendChild(el('h2', null, esc(r.u.tags.join(' + '))));
      card.appendChild(entryList(r.entries));
    } else if (r.type === 'choose') {
      card.appendChild(el('p', null, r.options.length === 1 ? 'Do you mean this?' : 'Which one do you mean?'));
      card.appendChild(entryList(r.options));
    } else {
      card.appendChild(el('p', null, 'I don’t have that in the knowledge base.'));
      if (r.closest.length) {
        card.appendChild(el('p', 'note', 'Closest entries:'));
        card.appendChild(entryList(r.closest));
      }
    }
    addWhy(card, r.u);
    return card;
  }

  // ---- screens: home -> topic -> entry ----------------------------------------
  //
  // metos is browsed first and asked second: five topics, then short lists,
  // then the entry. Typing a question is a shortcut to the same entries.
  // A topic's groups are tag filters, so new entries find their place alone.

  var TOPICS = [
    { id: 'danger', title: 'Danger', hint: 'know these first', groups: [
      { title: 'Know these first', tags: ['danger'] }] },
    { id: 'water', title: 'Water', hint: 'find, clean, store', groups: [
      { title: 'Water', tags: ['water'] }] },
    { id: 'warmth', title: 'Warmth & fire', hint: 'fire, shelter, cold', groups: [
      { title: 'Fire', tags: ['fire'] },
      { title: 'Shelter and cold', tags: ['shelter'], not: ['fire'] }] },
    { id: 'food', title: 'Food & plants', hint: 'what you can eat', groups: [
      { title: 'Read first', tags: ['plant', 'danger'] },
      { title: 'Wild greens and roots', tags: ['wild', 'food'], not: ['berry', 'nut', 'danger', 'index'] },
      { title: 'Berries and fruit', tags: ['berry'] },
      { title: 'Nuts and trees', tags: ['nut'] },
      { title: 'Growing food', tags: ['garden'] }] },
    { id: 'health', title: 'Health', hint: 'care without a doctor', groups: [
      { title: 'By problem', tags: ['health', 'index'] },
      { title: 'Home care', tags: ['remedy'] },
      { title: 'Medicinal plants', tags: ['medicinal'], not: ['index'] }] },
    { id: 'crisis', title: 'Blackout & crisis', hint: 'power cuts, sirens, supplies', wide: true, groups: [
      { title: 'Power cut', tags: ['blackout'] },
      { title: 'Alerts and war', tags: ['conflict'], not: ['blackout'] }] }
  ];

  function inGroup(e, g) {
    return g.tags.every(function (t) { return e.tags.indexOf(t) >= 0; }) &&
      !(g.not || []).some(function (t) { return e.tags.indexOf(t) >= 0; });
  }

  function groupEntries(g) {
    var list = kb.entries.filter(function (e) { return inGroup(e, g); });
    list.sort(function (a, b) {
      var da = a.tags.indexOf('danger') >= 0, db = b.tags.indexOf('danger') >= 0;
      if (da !== db) return da ? -1 : 1;
      return a.title.toLowerCase() < b.title.toLowerCase() ? -1 : 1;
    });
    return list;
  }

  function topicCount(t) {
    var seen = {};
    t.groups.forEach(function (g) { groupEntries(g).forEach(function (e) { seen[e.id] = true; }); });
    return Object.keys(seen).length;
  }

  var trail = [];   // screens visited, for back

  function go(screen, replace) {
    if (replace) trail.pop();
    trail.push(screen);
    draw();
  }

  function back() {
    if (trail.length > 1) trail.pop();
    draw();
  }

  function draw() {
    var screen = trail[trail.length - 1];
    log.innerHTML = '';
    if (trail.length > 1) {
      var nav = el('nav', 'crumbs');
      nav.appendChild(chip('← back', back));
      nav.appendChild(chip('home', function () { trail = []; go({ type: 'home' }); }));
      log.appendChild(nav);
    }
    if (screen.type === 'home') drawHome();
    else if (screen.type === 'topic') drawTopic(screen.id);
    else {
      if (screen.label) log.appendChild(el('div', 'q', esc(screen.label)));
      log.appendChild(render(screen.result));
    }
    window.scrollTo(0, 0);
  }

  function drawHome() {
    var grid = el('div', 'tiles');
    TOPICS.forEach(function (t) {
      var b = el('button', 'tile' + (t.id === 'danger' ? ' tile-danger' : '') + (t.wide ? ' tile-wide' : ''));
      b.type = 'button';
      b.appendChild(el('span', 'tile-title', esc(t.title)));
      b.appendChild(el('span', 'tile-hint', esc(t.hint) + ' · ' + topicCount(t)));
      b.addEventListener('click', function () { go({ type: 'topic', id: t.id }); });
      grid.appendChild(b);
    });
    log.appendChild(grid);
    log.appendChild(el('p', 'note', 'Or describe what you need below. metos only shows what its entries say, and tells you when it doesn’t know.'));
  }

  function drawTopic(id) {
    var t = TOPICS.filter(function (x) { return x.id === id; })[0];
    log.appendChild(el('h2', 'topic-title', esc(t.title)));
    t.groups.forEach(function (g) {
      var list = groupEntries(g);
      if (!list.length) return;
      var sec = el('section', 'group');
      sec.appendChild(el('h3', null, esc(g.title)));
      sec.appendChild(entryList(list));
      log.appendChild(sec);
    });
  }

  function show(result, label) {
    if (!result) return;
    go({ type: 'result', result: result, label: label });
  }

  function say(cls, text) {
    var p = el('p', 'note', esc(text));
    log.appendChild(p);
    p.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }

  function intro() {
    trail = [];
    go({ type: 'home' });
  }

  function ask(q) {
    q = q.trim();
    if (!q || !kb) return;
    show(metos.ask(q, kb), q);
  }

  // ---- pictures: photo in, text picture out ----------------------------------

  var FRAMES = {
    whole: { label: 'Whole photo', crop: function (w, h) { return [0, 0, w, h]; } },
    square: { label: 'Centre square', crop: function (w, h) { var s = Math.min(w, h); return [(w - s) / 2, (h - s) / 2, s, s]; } },
    close: { label: 'Close-up', crop: function (w, h) { var s = Math.min(w, h) * 0.6; return [(w - s) / 2, (h - s) / 2, s, s]; } }
  };

  // Shrink in halving steps: a single big jump makes jagged, noisy pixels.
  function sample(img, frame, tw) {
    var c = FRAMES[frame].crop(img.naturalWidth, img.naturalHeight);
    var th = Math.max(1, Math.round(tw * c[3] / c[2]));
    var src = document.createElement('canvas');
    src.width = Math.round(c[2]); src.height = Math.round(c[3]);
    src.getContext('2d').drawImage(img, c[0], c[1], c[2], c[3], 0, 0, src.width, src.height);
    while (src.width / 2 > tw) {
      var half = document.createElement('canvas');
      half.width = Math.round(src.width / 2); half.height = Math.round(src.height / 2);
      var hx = half.getContext('2d');
      hx.imageSmoothingQuality = 'high';
      hx.drawImage(src, 0, 0, half.width, half.height);
      src = half;
    }
    var out = document.createElement('canvas');
    out.width = tw; out.height = th;
    var ox = out.getContext('2d');
    ox.imageSmoothingQuality = 'high';
    ox.drawImage(src, 0, 0, tw, th);
    return { rgba: ox.getImageData(0, 0, tw, th).data, w: tw, h: th };
  }

  // Put the picture block at the end of the entry's summary, so it becomes
  // the entry's portrait.
  function insertPic(text, block) {
    var lines = text.replace(/\r/g, '').split('\n'), inCode = false, at = lines.length, pastHead = false;
    for (var i = 0; i < lines.length; i++) {
      if (!pastHead) { if (!lines[i].trim()) pastHead = true; continue; }
      if (/^```/.test(lines[i])) inCode = !inCode;
      if (!inCode && /^##\s/.test(lines[i])) { at = i; break; }
    }
    while (at > 0 && !lines[at - 1].trim()) at--;
    lines.splice(at, 0, '', block);
    return lines.join('\n').replace(/\n{3,}/g, '\n\n');
  }

  function download(name, text) {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: 'text/markdown' }));
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  // opts.onUse(block): called instead of adding to an entry (used by the
  // entry editor); opts.container: where to show the tool (default: the log)
  function pictureTool(file, opts) {
    opts = opts || {};
    var url = URL.createObjectURL(file), img = new Image();
    img.onload = function () {
      var card = el('div', 'card tool');
      card.appendChild(el('h2', null, 'New picture'));
      card.appendChild(el('p', 'note', esc(file.name) + ' · ' + img.naturalWidth + ' × ' + img.naturalHeight));

      var form = el('div', 'controls');
      function select(id, label, options, value) {
        var wrap = el('label', null, '<span>' + label + '</span>');
        var s = el('select');
        s.id = id;
        options.forEach(function (o) {
          var opt = el('option', null, esc(o[1]));
          opt.value = o[0];
          if (String(o[0]) === String(value)) opt.selected = true;
          s.appendChild(opt);
        });
        wrap.appendChild(s);
        form.appendChild(wrap);
        return s;
      }
      var frame = select('pic-frame', 'Framing', Object.keys(FRAMES).map(function (k) { return [k, FRAMES[k].label]; }), 'square');
      var width = select('pic-width', 'Width', [[48, '48 px'], [64, '64 px'], [96, '96 px'], [128, '128 px']], 96);
      var colours = select('pic-colours', 'Colours', [[16, '16'], [8, '8'], [4, '4'], [2, '2']], 16);
      var dither = select('pic-dither', 'Shading', [['0', 'Flat'], ['1', 'Dithered']], '0');
      var entry = opts.onUse ? null : select('pic-entry', 'Entry', kb.entries.map(function (e) { return [e.id, e.title]; }).sort(function (a, b) { return a[1].localeCompare(b[1]); }), guessEntry(file.name));
      var capWrap = el('label', 'wide', '<span>Caption</span>');
      var caption = el('input');
      caption.id = 'pic-caption';
      caption.type = 'text';
      caption.placeholder = 'What the picture shows, in words';
      capWrap.appendChild(caption);
      form.appendChild(capWrap);
      card.appendChild(form);

      var views = el('div', 'views');
      var colourView = el('figure', 'pic');
      var rawView = el('pre', 'raw');
      views.appendChild(colourView);
      views.appendChild(rawView);
      card.appendChild(views);
      var size = el('p', 'note');
      card.appendChild(size);

      var block = '';
      function update() {
        var s = sample(img, frame.value, +width.value);
        var text = metosPic.encode(s.rgba, s.w, s.h, { colors: +colours.value, dither: dither.value === '1' });
        var p = metosPic.parse(text);
        colourView.innerHTML = '';
        var shown = picToCanvas(p);
        shown.style.aspectRatio = p.w + '/' + p.h;
        colourView.appendChild(shown);
        colourView.appendChild(el('figcaption', null, 'As browsers and screens draw it'));
        rawView.textContent = p.rows.join('\n');
        requestAnimationFrame(function () {
          // Departure Mono characters are 0.636 em wide: fit the row to the box
          rawView.style.fontSize = ((rawView.clientWidth - 8) / (p.w * 0.636)) + 'px';
        });
        block = '```pic ' + caption.value.trim() + '\n' + text + '\n```';
        size.textContent = 'Right: the same picture as raw text, as a device with no graphics shows it. ' +
          p.w + ' × ' + p.h + ' px, ' + Object.keys(p.colors).length + ' colours, ' + block.length.toLocaleString() + ' characters.';
      }
      [frame, width, colours, dither].forEach(function (s) { s.addEventListener('change', update); });
      caption.addEventListener('input', function () { block = block.replace(/^```pic[^\n]*/, '```pic ' + caption.value.trim()); });
      update();

      var actions = el('div', 'chips');
      if (opts.onUse) {
        actions.appendChild(chip('Use this picture', function () { opts.onUse(block); card.remove(); }));
        actions.appendChild(chip('Cancel', function () { card.remove(); }));
        card.appendChild(actions);
        (opts.container || log).appendChild(card);
        card.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
      }
      actions.appendChild(chip('Add to entry', function () {
        var id = entry.value, f = files.filter(function (x) { return x.name.replace(/\.[^.]+$/, '') === id; })[0];
        if (!f) return;
        f.text = insertPic(f.text, block);
        rebuild();
        show(metos.open(kb, id), byId(id).title + ' (with picture)');
        if (server) {
          saveEntry(f.name, f.text).then(function () { say('note', 'Saved kb/' + f.name + ' on the stick.'); },
            function (err) { say('note', 'Could not save on the stick: ' + err.message + ' Use Download entry instead.'); });
        } else {
          say('note', 'Added for this session. Download the entry to keep it, and replace the file in kb/.');
        }
      }));
      actions.appendChild(chip('Download entry', function () {
        var id = entry.value, f = files.filter(function (x) { return x.name.replace(/\.[^.]+$/, '') === id; })[0];
        if (!f) return;
        download(f.name, /```pic/.test(f.text) ? f.text : insertPic(f.text, block));
      }));
      actions.appendChild(chip('Copy text', function (ev) {
        var btn = ev.target;
        function fallback() {
          var t = el('textarea', 'copybox');
          t.value = block;
          t.readOnly = true;
          card.appendChild(t);
          t.select();
          btn.textContent = 'Selected below';
        }
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(block).then(function () { btn.textContent = 'Copied'; }, fallback);
        } else fallback();
      }));
      card.appendChild(actions);

      log.appendChild(card);
      card.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };
    img.onerror = function () { say('note', 'That file could not be read as a picture.'); };
    img.src = url;
  }

  // "dandelion.jpg" -> the Dandelion entry, when the name matches
  function guessEntry(name) {
    var words = metos.tokens(name.replace(/\.[^.]+$/, ''));
    for (var i = 0; i < kb.entries.length; i++) {
      var e = kb.entries[i];
      for (var k = 0; k < e.names.length; k++) {
        if (e.names[k].length === 1 && words.indexOf(e.names[k][0]) >= 0) return e.id;
      }
    }
    return kb.entries.length ? kb.entries[0].id : '';
  }

  // ---- wiring --------------------------------------------------------------

  document.getElementById('ask').addEventListener('submit', function (ev) {
    ev.preventDefault();
    ask(input.value);
    input.value = '';
  });
  document.getElementById('folder').addEventListener('change', function (ev) { openFolder(ev.target.files); ev.target.value = ''; });
  document.getElementById('files').addEventListener('change', function (ev) { addFiles(ev.target.files); ev.target.value = ''; });
  document.getElementById('photo').addEventListener('change', function (ev) {
    if (ev.target.files[0]) pictureTool(ev.target.files[0]);
    ev.target.value = '';
  });

  // Dropped photos go to the picture tool, dropped text files become entries.
  function handleDrop(list) {
    var text = [];
    Array.prototype.forEach.call(list, function (f) {
      if (/^image\//.test(f.type)) pictureTool(f);
      else text.push(f);
    });
    if (text.length) addFiles(text);
  }

  document.addEventListener('dragover', function (ev) { ev.preventDefault(); document.body.classList.add('drop'); });
  document.addEventListener('dragleave', function (ev) { if (!ev.relatedTarget) document.body.classList.remove('drop'); });
  document.addEventListener('drop', function (ev) {
    ev.preventDefault();
    document.body.classList.remove('drop');
    handleDrop(ev.dataTransfer.files);
  });

  // ---- the stick's own server (metos.com) ---------------------------------
  // When metos.com serves the page, entries come live from kb/ on the stick
  // and saving writes back to it. Opened as a plain file, the page uses kb.js.

  var server = false;

  function saveEntry(name, text) {
    return fetch('api/entry?name=' + encodeURIComponent(name), {
      method: 'POST',
      headers: { 'Content-Type': 'text/markdown; charset=utf-8' },
      body: text
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (!r.ok) throw new Error(j.error || ('The stick answered ' + r.status + '.'));
        return j;
      });
    });
  }

  // What the entry editor (editor.js) needs from the app.
  window.metosApp = {
    get kb() { return kb; },
    get files() { return files; },
    get vocabText() { return vocabText; },
    get outOfScope() { return outOfScope; },
    get model() { return model; },
    get server() { return server; },
    upsert: upsert, rebuild: rebuild, show: show, say: say, md: md, el: el, esc: esc, chip: chip,
    pictureTool: pictureTool, download: download, saveEntry: saveEntry
  };

  if (window.METOS_BUNDLE) {
    files = window.METOS_BUNDLE.files.slice();
    vocabText = window.METOS_BUNDLE.vocab;
    outOfScope = window.METOS_BUNDLE.outOfScope || '';
  }

  function start() {
    rebuild();
    if (server) countEl.textContent += ' · on this stick';
    intro();
    if (!files.length) say('note', 'No entries loaded. Use “open folder” to pick the kb folder, or run build.js.');
    input.focus();
  }

  if (/^https?:$/.test(location.protocol)) {
    fetch('api/kb', { cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (b) {
        if (b && b.files) { files = b.files; vocabText = b.vocab || vocabText; outOfScope = b.outOfScope || outOfScope; server = true; }
      })
      .catch(function () {})
      .then(start);
  } else {
    start();
  }

  // Offline install when served over http(s). From a USB stick (file://)
  // everything is already local, so no service worker is needed.
  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    navigator.serviceWorker.register('sw.js').catch(function () {});
  }
})();

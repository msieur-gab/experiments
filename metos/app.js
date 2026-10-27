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
    kb = metos.buildKB(files, vocabText);
    countEl.textContent = kb.entries.length + ' entries';
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
      if (/\.(md|txt)$/i.test(f.name) && rel2.indexOf('/') < 0 && !/^readme\./i.test(f.name)) {
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

  function md(text) {
    var lines = String(text).split('\n'), html = [], i = 0;
    while (i < lines.length) {
      var l = lines[i];
      if (/^```/.test(l)) {
        var code = [];
        i++;
        while (i < lines.length && !/^```/.test(lines[i])) code.push(lines[i++]);
        i++;
        html.push('<pre>' + esc(code.join('\n')) + '</pre>');
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
    if (r.missing) card.appendChild(el('p', 'note', 'This entry has nothing on “' + esc(r.missing) + '”. Here is the summary.'));
    card.appendChild(el('div', 'body', md(r.text)));

    var chips = el('div', 'chips');
    e.order.forEach(function (s) {
      if (s === r.section) return;
      chips.appendChild(chip(s, function () { show(metos.open(kb, e.id, s), e.title + ' / ' + s); }));
    });
    e.see.forEach(function (id) {
      var other = byId(id);
      if (other) chips.appendChild(chip('→ ' + other.title, function () { show(metos.open(kb, id), other.title); }, 'see'));
    });
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
      li.appendChild(el('span', 'first', esc(firstLine(e))));
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
      card.appendChild(el('p', null, 'Which one do you mean?'));
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

  function show(result, label) {
    if (!result) return;
    log.appendChild(el('div', 'q', esc(label)));
    var card = render(result);
    log.appendChild(card);
    card.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function say(cls, text) {
    var p = el('p', 'note', esc(text));
    log.appendChild(p);
    p.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }

  function intro() {
    var box = el('div', 'intro');
    box.appendChild(el('p', null, 'A small knowledge base you can ask in plain words. It only shows what its entries say, and tells you when it doesn’t know.'));
    var chips = el('div', 'chips');
    EXAMPLES.forEach(function (q) { chips.appendChild(chip(q, function () { ask(q); })); });
    box.appendChild(chips);
    log.appendChild(box);
  }

  function ask(q) {
    q = q.trim();
    if (!q || !kb) return;
    show(metos.ask(q, kb), q);
  }

  // ---- wiring --------------------------------------------------------------

  document.getElementById('ask').addEventListener('submit', function (ev) {
    ev.preventDefault();
    ask(input.value);
    input.value = '';
  });
  document.getElementById('folder').addEventListener('change', function (ev) { openFolder(ev.target.files); ev.target.value = ''; });
  document.getElementById('files').addEventListener('change', function (ev) { addFiles(ev.target.files); ev.target.value = ''; });

  document.addEventListener('dragover', function (ev) { ev.preventDefault(); document.body.classList.add('drop'); });
  document.addEventListener('dragleave', function (ev) { if (!ev.relatedTarget) document.body.classList.remove('drop'); });
  document.addEventListener('drop', function (ev) {
    ev.preventDefault();
    document.body.classList.remove('drop');
    addFiles(ev.dataTransfer.files);
  });

  if (window.METOS_BUNDLE) {
    files = window.METOS_BUNDLE.files.slice();
    vocabText = window.METOS_BUNDLE.vocab;
  }
  rebuild();
  intro();
  if (!files.length) say('note', 'No entries loaded. Use “open folder” to pick the kb folder, or run build.js.');
  input.focus();

  // Offline install when served over http(s). From a USB stick (file://)
  // everything is already local, so no service worker is needed.
  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    navigator.serviceWorker.register('sw.js').catch(function () {});
  }
})();

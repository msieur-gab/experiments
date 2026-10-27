/*
 * metos entry editor: a guided form for writing and editing entries by hand.
 *
 * The form always produces the same plain Markdown format as the files in
 * kb/, shown live under the form, so it never hides the format. A test box
 * checks that the entry can actually be found with the words people use.
 */
(function () {
  'use strict';

  var A = window.metosApp;
  var el = A.el, esc = A.esc;

  // Section names metos knows (see the aspect lines in vocab.txt), plus how.
  var KNOWN = [
    ['how', 'how: steps to do it'],
    ['identify', 'identify: how to recognise it'],
    ['eat', 'eat: how it is eaten'],
    ['cook', 'cook: how to prepare it'],
    ['grow', 'grow: how to grow it'],
    ['harvest', 'harvest: when and how to pick'],
    ['store', 'store: how to keep it'],
    ['safety', 'safety: dangers and precautions'],
    ['use', 'use: what else it is good for'],
    ['symptoms', 'symptoms: signs to watch for']
  ];
  var HEAD_KEYS = ['title', 'aka', 'tags', 'warn', 'see', 'source'];

  var sheet = null, state = null, folder = null;

  // ---- reading and writing the entry format --------------------------------

  function slug(s) {
    return String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || '';
  }

  function blank() {
    return { file: '', original: '', title: '', aka: '', tags: '', warn: '', see: '', source: '', extra: [],
             summary: '', picture: '', sections: [{ name: 'identify', text: '' }] };
  }

  function parseFile(text, fileName) {
    var s = blank(), lines = String(text).replace(/\r/g, '').split('\n'), i = 0;
    s.file = fileName; s.original = fileName;
    if (lines[0] && lines[0].trim() === '---') i = 1;
    for (; i < lines.length; i++) {
      if (lines[i].trim() === '---') { i++; break; }
      var m = /^([a-z]+):\s*(.*)$/.exec(lines[i]);
      if (!m) break;
      if (HEAD_KEYS.indexOf(m[1]) >= 0) s[m[1]] = m[2].trim();
      else s.extra.push([m[1], m[2].trim()]);
    }
    var rest = lines.slice(i), cur = null, buf = [], inCode = false, summary = [];
    s.sections = [];
    function flush() {
      if (cur === null) summary = buf.slice();
      else s.sections.push({ name: cur, text: buf.join('\n').trim() });
      buf = [];
    }
    for (var j = 0; j < rest.length; j++) {
      var l = rest[j];
      if (/^```/.test(l)) inCode = !inCode;
      var h = !inCode && /^##\s+(.+)$/.exec(l);
      if (h) { flush(); cur = h[1].trim().toLowerCase(); continue; }
      buf.push(l);
    }
    flush();
    var sum = summary.join('\n');
    if (!s.title) {
      // no header: first line is the title
      var t = sum.trim().split('\n');
      s.title = (t.shift() || '').replace(/^#+\s*/, '');
      sum = t.join('\n');
    }
    // the first picture in the summary is the entry's portrait
    var pm = /(^|\n)(```pic[^\n]*\n[\s\S]*?\n```)[ \t]*(\n|$)/.exec(sum);
    if (pm) { s.picture = pm[2]; sum = sum.replace(pm[2], ''); }
    s.summary = sum.replace(/\n{3,}/g, '\n\n').trim();
    return s;
  }

  function serialize(s) {
    var out = [];
    HEAD_KEYS.forEach(function (k) { if (s[k].trim()) out.push(k + ': ' + s[k].trim().replace(/\s*\n\s*/g, ' ')); });
    s.extra.forEach(function (kv) { out.push(kv[0] + ': ' + kv[1]); });
    out.push('');
    if (s.summary.trim()) out.push(s.summary.trim(), '');
    if (s.picture) out.push(s.picture, '');
    s.sections.forEach(function (sec) {
      if (!sec.name.trim() || !sec.text.trim()) return;
      out.push('## ' + sec.name.trim().toLowerCase(), sec.text.trim(), '');
    });
    return out.join('\n').replace(/\n+$/, '') + '\n';
  }

  function fileName() {
    var name = state.file || (slug(state.title) ? slug(state.title) + '.md' : '');
    return name;
  }

  // ---- the sheet -----------------------------------------------------------

  function field(parent, id, label, hint, multiline, value, oninput) {
    var wrap = el('label', 'ed-field');
    wrap.htmlFor = id;
    wrap.appendChild(el('span', 'ed-label', esc(label)));
    if (hint) wrap.appendChild(el('span', 'ed-hint', esc(hint)));
    var input = el(multiline ? 'textarea' : 'input');
    input.id = id;
    if (!multiline) input.type = 'text';
    else input.rows = multiline;
    input.value = value || '';
    input.addEventListener('input', function () { oninput(input.value); changed(); });
    wrap.appendChild(input);
    parent.appendChild(wrap);
    return input;
  }

  function open(id) {
    if (id) {
      var f = A.files.filter(function (x) { return x.name.replace(/\.[^.]+$/, '') === id; })[0];
      if (!f) return;
      state = parseFile(f.text, f.name);
      if (!state.sections.length) state.sections.push({ name: 'identify', text: '' });
    } else {
      state = blank();
    }
    state.dirty = false;
    build();
  }

  function close() {
    if (!sheet) return;
    sheet.remove();
    sheet = null;
    document.documentElement.classList.remove('sheet-open');
  }

  function build() {
    if (sheet) sheet.remove();
    sheet = el('div', 'sheet');
    sheet.setAttribute('role', 'dialog');
    sheet.setAttribute('aria-label', state.original ? 'Edit entry' : 'New entry');
    document.documentElement.classList.add('sheet-open');

    var bar = el('div', 'sheet-bar');
    var barIn = el('div', 'sheet-in');
    barIn.appendChild(el('h2', null, state.original ? 'Edit entry' : 'New entry'));
    var closeBtn = el('button', 'ghost', 'Close');
    closeBtn.type = 'button';
    closeBtn.addEventListener('click', function () {
      if (state.dirty && closeBtn.dataset.sure !== '1') {
        closeBtn.textContent = 'Discard changes?';
        closeBtn.dataset.sure = '1';
        return;
      }
      close();
    });
    barIn.appendChild(closeBtn);
    bar.appendChild(barIn);
    sheet.appendChild(bar);

    var body = el('div', 'sheet-in sheet-grid');
    var form = el('div', 'ed-form');
    var side = el('div', 'ed-side');
    body.appendChild(form);
    body.appendChild(side);
    sheet.appendChild(body);

    // -- identity
    var g1 = el('fieldset', 'ed-group');
    g1.appendChild(el('legend', null, 'What it is'));
    field(g1, 'ed-title', 'Title', 'The name most people know it by.', 0, state.title, function (v) { state.title = v; });
    field(g1, 'ed-aka', 'Other names', 'Comma-separated: every name people might type, in any language. This is how questions find the entry.', 0, state.aka, function (v) { state.aka = v; });
    var tags = field(g1, 'ed-tags', 'Tags', 'Space-separated topics, for questions like "what plants can I eat".', 0, state.tags, function (v) { state.tags = v; });
    var tagChips = el('div', 'ed-chips');
    var known = Object.keys(A.kb.allTags).sort();
    known.forEach(function (t) {
      var b = el('button', 'chip small', esc(t));
      b.type = 'button';
      b.addEventListener('click', function () {
        var list = tags.value.split(/[\s,]+/).filter(Boolean), at = list.indexOf(t);
        if (at >= 0) list.splice(at, 1); else list.push(t);
        tags.value = list.join(' ');
        state.tags = tags.value;
        changed();
      });
      tagChips.appendChild(b);
    });
    g1.appendChild(tagChips);
    form.appendChild(g1);

    // -- safety and origin
    var g2 = el('fieldset', 'ed-group');
    g2.appendChild(el('legend', null, 'Safety and source'));
    field(g2, 'ed-warn', 'Warning', 'Shown first on every answer. Leave empty if there is none.', 2, state.warn, function (v) { state.warn = v; });
    field(g2, 'ed-source', 'Source', 'Where this comes from. Say so if it still needs checking.', 0, state.source, function (v) { state.source = v; });
    var see = field(g2, 'ed-see', 'Related entries', 'File names without .md, comma-separated.', 0, state.see, function (v) { state.see = v; });
    var seePick = el('select', 'ed-pick');
    seePick.id = 'ed-see-pick';
    seePick.appendChild(el('option', null, 'Add a related entry…'));
    A.kb.entries.slice().sort(function (a, b) { return a.title.localeCompare(b.title); }).forEach(function (e) {
      var o = el('option', null, esc(e.title));
      o.value = e.id;
      seePick.appendChild(o);
    });
    seePick.addEventListener('change', function () {
      if (!seePick.value || seePick.selectedIndex === 0) return;
      var list = see.value.split(',').map(function (x) { return x.trim(); }).filter(Boolean);
      if (list.indexOf(seePick.value) < 0) list.push(seePick.value);
      see.value = list.join(', ');
      state.see = see.value;
      seePick.selectedIndex = 0;
      changed();
    });
    g2.appendChild(seePick);
    form.appendChild(g2);

    // -- summary and picture
    var g3 = el('fieldset', 'ed-group');
    g3.appendChild(el('legend', null, 'Summary'));
    field(g3, 'ed-summary', 'Summary', 'One or two sentences: what someone needs to know first.', 3, state.summary, function (v) { state.summary = v; });
    var picBox = el('div', 'ed-picture');
    g3.appendChild(picBox);
    var picHost = el('div');
    g3.appendChild(picHost);
    function drawPicture() {
      picBox.innerHTML = '';
      if (state.picture) picBox.appendChild(el('div', 'body', A.md(state.picture)));
      var row = el('div', 'ed-chips');
      var pick = el('label', 'chip', state.picture ? 'Replace picture' : 'Add picture');
      var inp = el('input');
      inp.type = 'file';
      inp.accept = 'image/*';
      inp.id = 'ed-photo';
      inp.hidden = true;
      inp.addEventListener('change', function () {
        if (!inp.files[0]) return;
        A.pictureTool(inp.files[0], {
          container: picHost,
          onUse: function (block) { state.picture = block; drawPicture(); changed(); }
        });
      });
      pick.appendChild(inp);
      row.appendChild(pick);
      if (state.picture) {
        row.appendChild(A.chip('Remove picture', function () { state.picture = ''; drawPicture(); changed(); }));
      }
      picBox.appendChild(row);
    }
    drawPicture();
    form.appendChild(g3);

    // -- sections
    var g4 = el('fieldset', 'ed-group');
    g4.appendChild(el('legend', null, 'Sections'));
    g4.appendChild(el('p', 'ed-hint', 'Questions open the matching section: "how to grow potatoes" opens grow. Lists with "- ", steps with "1. ".'));
    var secList = el('div', 'ed-sections');
    g4.appendChild(secList);
    function drawSections() {
      secList.innerHTML = '';
      state.sections.forEach(function (sec, n) {
        var box = el('div', 'ed-section');
        var top = el('div', 'ed-sec-top');
        var sel = el('select');
        sel.id = 'ed-sec-' + n + '-name';
        sel.setAttribute('aria-label', 'Section name');
        var isKnown = KNOWN.some(function (k) { return k[0] === sec.name; });
        KNOWN.forEach(function (k) {
          var o = el('option', null, esc(k[1]));
          o.value = k[0];
          if (k[0] === sec.name) o.selected = true;
          sel.appendChild(o);
        });
        var other = el('option', null, 'other name…');
        other.value = '';
        if (!isKnown) other.selected = true;
        sel.appendChild(other);
        var custom = el('input');
        custom.type = 'text';
        custom.id = 'ed-sec-' + n + '-custom';
        custom.placeholder = 'section name';
        custom.value = isKnown ? '' : sec.name;
        custom.hidden = isKnown;
        sel.addEventListener('change', function () {
          custom.hidden = !!sel.value;
          sec.name = sel.value || custom.value;
          if (!sel.value) custom.focus();
          changed();
        });
        custom.addEventListener('input', function () { sec.name = custom.value; changed(); });
        top.appendChild(sel);
        top.appendChild(custom);
        if (n > 0) {
          var up = el('button', 'ghost small', '↑');
          up.type = 'button';
          up.title = 'Move up';
          up.addEventListener('click', function () {
            state.sections.splice(n - 1, 0, state.sections.splice(n, 1)[0]);
            drawSections(); changed();
          });
          top.appendChild(up);
        }
        var rm = el('button', 'ghost small', 'Remove');
        rm.type = 'button';
        rm.addEventListener('click', function () { state.sections.splice(n, 1); drawSections(); changed(); });
        top.appendChild(rm);
        box.appendChild(top);
        var ta = el('textarea');
        ta.id = 'ed-sec-' + n + '-text';
        ta.rows = 5;
        ta.value = sec.text;
        ta.setAttribute('aria-label', 'Section text');
        ta.addEventListener('input', function () { sec.text = ta.value; changed(); });
        box.appendChild(ta);
        secList.appendChild(box);
      });
    }
    drawSections();
    g4.appendChild(A.chip('+ Add section', function () {
      var used = state.sections.map(function (s) { return s.name; });
      var next = KNOWN.filter(function (k) { return used.indexOf(k[0]) < 0; })[0];
      state.sections.push({ name: next ? next[0] : '', text: '' });
      drawSections();
      changed();
      var last = secList.lastChild && secList.lastChild.querySelector('textarea');
      if (last) last.focus();
    }));
    form.appendChild(g4);

    // -- file
    var g5 = el('fieldset', 'ed-group');
    g5.appendChild(el('legend', null, 'File'));
    var fileIn = field(g5, 'ed-file', 'File name', 'Made from the title. One entry per file in kb/.', 0, state.file, function (v) {
      state.file = v.trim() ? v.trim().replace(/\.md$/i, '') + '.md' : '';
    });
    fileIn.placeholder = 'made from the title';
    if (state.original) fileIn.readOnly = true;
    form.appendChild(g5);

    // -- side: test, checks, preview, markdown, actions
    var test = el('section', 'ed-panel');
    test.appendChild(el('h3', null, 'Try a question'));
    test.appendChild(el('p', 'ed-hint', 'Type what someone would ask. metos checks whether it finds this entry.'));
    var q = el('input');
    q.type = 'text';
    q.id = 'ed-test';
    q.placeholder = 'e.g. can I eat ' + (state.title ? state.title.toLowerCase() : 'this');
    q.addEventListener('input', changed);
    test.appendChild(q);
    var result = el('div', 'ed-result');
    test.appendChild(result);
    side.appendChild(test);

    var checks = el('ul', 'ed-checks');
    side.appendChild(checks);

    var actions = el('div', 'ed-actions');
    // Running from the stick's own server: saving goes straight onto the stick.
    var addBtn = el('button', 'primary', A.server ? 'Save to stick' : 'Add to knowledge base');
    addBtn.type = 'button';
    addBtn.addEventListener('click', A.server ? saveToStick : addToKB);
    actions.appendChild(addBtn);
    actions.appendChild(A.chip('Download .md', function () {
      if (!ready()) return;
      A.download(fileName(), serialize(state));
    }));
    if (window.showDirectoryPicker && !A.server) actions.appendChild(A.chip(folder ? 'Save to folder' : 'Save to folder…', saveToFolder));
    side.appendChild(actions);
    var status = el('p', 'ed-status');
    status.setAttribute('aria-live', 'polite');
    side.appendChild(status);

    var preview = el('section', 'ed-panel');
    preview.appendChild(el('h3', null, 'Preview'));
    var card = el('div', 'card');
    preview.appendChild(card);
    side.appendChild(preview);

    var raw = el('details', 'ed-raw');
    raw.appendChild(el('summary', null, 'Markdown'));
    var rawPre = el('pre');
    raw.appendChild(rawPre);
    side.appendChild(raw);

    sheet._parts = { result: result, checks: checks, card: card, rawPre: rawPre, q: q, status: status, addBtn: addBtn };
    document.body.appendChild(sheet);
    var first = sheet.querySelector('#ed-title');
    if (first && !state.original) first.focus();
    refresh();
  }

  // ---- live updates --------------------------------------------------------

  var timer = null;
  function changed() {
    state.dirty = true;
    if (sheet) sheet.querySelector('.sheet-bar button').textContent = 'Close';
    if (sheet) delete sheet.querySelector('.sheet-bar button').dataset.sure;
    clearTimeout(timer);
    timer = setTimeout(refresh, 120);
  }

  // The KB as it would be with this entry added or replaced.
  function draftKB(text) {
    var name = fileName() || '_draft.md';
    var list = A.files.filter(function (f) { return f.name !== name && f.name !== state.original; });
    list.push({ name: name, text: text });
    return { kb: metos.buildKB(list, A.vocabText), id: name.replace(/\.[^.]+$/, '') };
  }

  function refresh() {
    if (!sheet) return;
    var p = sheet._parts, text = serialize(state);
    var entry = metos.parseEntry(text, fileName() || 'draft.md');

    // preview: the whole entry, as a card shows it
    p.card.innerHTML = '';
    p.card.appendChild(el('h2', null, esc(state.title || 'Untitled')));
    if (state.warn.trim()) p.card.appendChild(el('div', 'warn', esc(state.warn.trim())));
    if (entry.sections.summary) p.card.appendChild(el('div', 'body', A.md(entry.sections.summary)));
    entry.order.forEach(function (s) {
      if (s === 'summary') return;
      p.card.appendChild(el('div', 'sec', esc(s)));
      p.card.appendChild(el('div', 'body', A.md(entry.sections[s])));
    });
    if (state.source.trim()) p.card.appendChild(el('div', 'src', 'Source: ' + esc(state.source.trim())));
    p.rawPre.textContent = text;
    var fileIn = sheet.querySelector('#ed-file');
    if (fileIn && !state.file) fileIn.placeholder = fileName() || 'made from the title';

    // checks
    var notes = [], name = fileName();
    if (!state.title.trim()) notes.push(['c-bad', 'Add a title.']);
    if (!state.summary.trim()) notes.push(['c-bad', 'Add a summary.']);
    if (state.title.trim() && !state.aka.trim()) notes.push(['c-warn', 'No other names yet: questions can only find it by its exact title.']);
    if (!state.source.trim()) notes.push(['c-warn', 'No source: say where this comes from.']);
    if (!state.original && name && A.files.some(function (f) { return f.name === name; })) {
      notes.push(['c-bad', 'An entry named ' + name + ' already exists. Edit that one, or change the file name.']);
    }
    var badSee = state.see.split(',').map(function (x) { return x.trim(); }).filter(function (x) {
      return x && !A.kb.entries.some(function (e) { return e.id === x; });
    });
    if (badSee.length) notes.push(['c-warn', 'Related entries not found: ' + badSee.join(', ') + '.']);
    if (!notes.length) notes.push(['c-ok', 'Ready to add.']);
    p.checks.innerHTML = '';
    notes.forEach(function (n) { p.checks.appendChild(el('li', n[0], esc(n[1]))); });

    // test question
    var qv = p.q.value.trim();
    p.result.className = 'ed-result';
    if (!qv) { p.result.textContent = ''; return; }
    var d = draftKB(text), r = metos.ask(qv, d.kb), msg, cls;
    var mine = r.u.ranked.filter(function (x) { return x.entry.id === d.id; })[0];
    if (r.type === 'answer' && r.entry.id === d.id) {
      cls = 'c-ok'; msg = 'Finds this entry' + (r.section !== 'summary' ? ', section ' + r.section : '') + '.';
    } else if (r.type === 'answer') {
      cls = 'c-warn'; msg = 'Answers with “' + r.entry.title + '” instead.';
    } else if (r.type === 'choose' && r.options.some(function (e) { return e.id === d.id; })) {
      cls = 'c-warn'; msg = 'Asks which one: ' + r.options.map(function (e) { return e.title; }).join(' or ') + '.';
    } else if (r.type === 'list' && r.entries.some(function (e) { return e.id === d.id; })) {
      cls = 'c-ok'; msg = 'Lists it among: ' + r.u.tags.join(' + ') + '.';
    } else {
      cls = 'c-bad'; msg = 'Does not find it. Add the words from the question to Other names.';
    }
    p.result.className = 'ed-result ' + cls;
    p.result.innerHTML = esc(msg) + (mine ? '<span class="ed-why">score ' + mine.score + ': ' + esc(mine.why.join(', ')) + '</span>' : '');
  }

  // ---- saving --------------------------------------------------------------

  function ready() {
    var p = sheet._parts;
    if (!state.title.trim() || !state.summary.trim() || !fileName()) {
      p.status.textContent = 'Add at least a title and a summary first.';
      return false;
    }
    if (!state.original && A.files.some(function (f) { return f.name === fileName(); })) {
      p.status.textContent = 'That file name is taken. Change it in File.';
      return false;
    }
    return true;
  }

  function commit() {
    var name = fileName(), text = serialize(state);
    A.upsert(name, text);
    A.rebuild();
    state.original = name;
    state.file = name;
    state.dirty = false;
    return name.replace(/\.[^.]+$/, '');
  }

  function addToKB() {
    if (!ready()) return;
    var id = commit(), title = state.title;
    close();
    A.show(metos.open(A.kb, id), title);
    A.say('note', 'Added for this session. Use Download or Save to folder in the editor to keep it.');
  }

  function saveToStick() {
    if (!ready()) return;
    var p = sheet._parts, name = fileName(), text = serialize(state), title = state.title;
    p.addBtn.disabled = true;
    p.status.textContent = 'Saving…';
    A.saveEntry(name, text).then(function () {
      var id = commit();
      close();
      A.show(metos.open(A.kb, id), title);
      A.say('note', 'Saved kb/' + name + ' on the stick.');
    }, function (err) {
      p.addBtn.disabled = false;
      p.status.textContent = 'Could not save on the stick: ' + err.message + ' Use Download .md instead.';
    });
  }

  // Desktop Chrome and Edge: write straight into the folder. Pick the metos
  // folder to also refresh kb.js (no build step), or the kb folder alone.
  function saveToFolder() {
    if (!ready()) return;
    var p = sheet._parts, name = fileName(), text = serialize(state);
    var pick = folder ? Promise.resolve(folder) : window.showDirectoryPicker({ id: 'metos', mode: 'readwrite' });
    pick.then(function (dir) {
      folder = dir;
      return dir.getDirectoryHandle('kb').then(function (kbDir) {
        return writeFile(kbDir, name, text).then(function () { return rebuildBundle(dir, kbDir); })
          .then(function (n) { return 'Saved kb/' + name + ' and refreshed kb.js (' + n + ' entries).'; });
      }, function () {
        return writeFile(dir, name, text).then(function () {
          return 'Saved ' + name + ' in ' + dir.name + '. Run build.js to refresh kb.js, or pick the metos folder next time.';
        });
      });
    }).then(function (msg) {
      commit();
      p.status.textContent = msg;
    }).catch(function (err) {
      if (err && err.name === 'AbortError') return;
      folder = null;
      p.status.textContent = 'Could not save there: ' + (err && err.message ? err.message : err) + '. Use Download instead.';
    });
  }

  function writeFile(dir, name, text) {
    return dir.getFileHandle(name, { create: true }).then(function (fh) {
      return fh.createWritable().then(function (w) {
        return w.write(text).then(function () { return w.close(); });
      });
    });
  }

  function readHandle(dir, name) {
    return dir.getFileHandle(name).then(function (fh) { return fh.getFile(); }).then(function (f) { return f.text(); });
  }

  // Same output as build.js, from the files actually on disk.
  function rebuildBundle(root, kbDir) {
    var entries = [], it = kbDir.values();
    function next() {
      return it.next().then(function (step) {
        if (step.done) return;
        var h = step.value;
        if (h.kind === 'file' && /\.(md|txt)$/i.test(h.name) && !/^_/.test(h.name)) {
          return h.getFile().then(function (f) { return f.text(); }).then(function (t) {
            entries.push({ name: h.name, text: t });
          }).then(next);
        }
        return next();
      });
    }
    return next().then(function () {
      return readHandle(root, 'vocab.txt').catch(function () { return A.vocabText; });
    }).then(function (vocab) {
      entries.sort(function (a, b) { return a.name < b.name ? -1 : a.name > b.name ? 1 : 0; });
      var bundle = { built: new Date().toISOString().slice(0, 10), vocab: vocab, files: entries };
      var out = '// Generated by build.js from kb/ and vocab.txt. Do not edit by hand.\n' +
        'window.METOS_BUNDLE = ' + JSON.stringify(bundle, null, 1) + ';\n';
      return writeFile(root, 'kb.js', out).then(function () { return entries.length; });
    });
  }

  document.addEventListener('keydown', function (ev) {
    if (ev.key === 'Escape' && sheet && !state.dirty) close();
  });

  window.metosEditor = { open: open, close: close, parseFile: parseFile, serialize: serialize };
})();

/*
 * metos engine
 *
 * Pure functions, no DOM, no libraries. Runs in a browser and in Node.
 * Written to be ported to C and Forth later:
 *   - whole-number scores only, no floats
 *   - plain word lists, no regex tricks beyond splitting text
 *   - every decision traceable to a line in vocab.txt or a KB entry
 *
 * It never writes an answer. It finds the entry and shows its text as is,
 * or says it does not know.
 */
(function (root) {
  'use strict';

  var MIN_SCORE = 10; // a subject must score at least this to be answered
  var CLOSE = 3;      // two subjects within this distance: ask which one

  var DEFAULT_SECTION = { about: 'summary', how: 'how', safety: 'safety' };
  var SAID = 'also said';

  // ---- words ---------------------------------------------------------------

  function fold(s) {
    return String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  }

  // Crude English plural stripping. Good enough, and easy to port.
  function stem(w) {
    var n = w.length;
    if (n > 4 && w.slice(-3) === 'ies') return w.slice(0, -3) + 'y';
    if (n > 4 && w.slice(-3) === 'oes') return w.slice(0, -2);
    if (n > 3 && w.slice(-1) === 's' && w.slice(-2) !== 'ss' && w.slice(-2) !== 'us') return w.slice(0, -1);
    return w;
  }

  function tokens(s) {
    var out = [], parts = fold(s).split(/[^a-z0-9]+/);
    for (var i = 0; i < parts.length; i++) if (parts[i]) out.push(stem(parts[i]));
    return out;
  }

  // Does the phrase (array of words) appear in the query words, in order?
  function hasPhrase(words, phrase) {
    if (!phrase.length) return false;
    outer: for (var i = 0; i + phrase.length <= words.length; i++) {
      for (var j = 0; j < phrase.length; j++) if (words[i + j] !== phrase[j]) continue outer;
      return true;
    }
    return false;
  }

  function phraseList(text) {
    var out = [], parts = String(text).split(',');
    for (var i = 0; i < parts.length; i++) {
      var t = tokens(parts[i]);
      if (t.length) out.push(t);
    }
    return out;
  }

  // ---- vocabulary ----------------------------------------------------------

  function parseVocab(text) {
    var v = { intent: {}, aspect: {}, tag: {}, stop: {} };
    var lines = String(text).replace(/\r/g, '').split('\n');
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].trim();
      if (!line || line[0] === '#') continue;
      var colon = line.indexOf(':');
      if (colon < 0) continue;
      var head = line.slice(0, colon).trim().split(/\s+/);
      var body = line.slice(colon + 1);
      if (head[0] === 'stop') {
        var sw = tokens(body.replace(/,/g, ' '));
        for (var k = 0; k < sw.length; k++) v.stop[sw[k]] = true;
      } else if (v[head[0]] && head[1]) {
        v[head[0]][head[1]] = phraseList(body);
      }
    }
    return v;
  }

  function withoutStops(words, vocab) {
    var out = [];
    for (var i = 0; i < words.length; i++) if (!vocab.stop[words[i]]) out.push(words[i]);
    return out;
  }

  // ---- entries -------------------------------------------------------------

  // The text to search: pictures (```pic blocks) are pixels, not words.
  // Their caption, on the opening line, stays searchable.
  function words(text) {
    var out = [], inPic = false, lines = String(text).split('\n');
    for (var i = 0; i < lines.length; i++) {
      var l = lines[i];
      if (inPic) { if (/^```/.test(l)) inPic = false; continue; }
      var m = /^```pic\b\s*(.*)$/.exec(l);
      if (m) { inPic = true; out.push(m[1]); continue; }
      out.push(l);
    }
    return out.join('\n');
  }

  // Header: "key: value" lines at the top, ended by the first blank line.
  // Body: a summary, then "## section" blocks. A file with no header still
  // works: its first line becomes the title and the rest the summary.
  function parseEntry(text, fileName) {
    var lines = String(text).replace(/\r/g, '').split('\n');
    var id = String(fileName || 'entry').replace(/^.*[\\/]/, '').replace(/\.[^.]+$/, '');
    var head = {}, i = 0;
    if (lines[0] && lines[0].trim() === '---') i = 1;
    for (; i < lines.length; i++) {
      var line = lines[i];
      if (line.trim() === '---') { i++; break; }
      var m = /^([a-z]+):\s*(.*)$/.exec(line);
      if (!m) break;
      head[m[1]] = m[2].trim();
    }
    var rest = lines.slice(i);
    if (!head.title) {
      while (rest.length && !rest[0].trim()) rest.shift();
      head.title = rest.length ? rest.shift().replace(/^#+\s*/, '').trim() : id;
    }

    // "## also said" holds what people say when this entry is the answer.
    // It teaches the model (train.js) and is never shown as an answer.
    var sections = {}, order = [], current = 'summary', buf = [], inCode = false;
    var said = [], shown = [];
    function flush() {
      var t = buf.join('\n').trim();
      if (current === SAID) {
        t.split('\n').forEach(function (l) {
          l = l.replace(/^\s*[-*]\s+/, '').trim();
          if (l) said.push(l);
        });
      } else if (t) { sections[current] = t; order.push(current); }
      buf = [];
    }
    for (var j = 0; j < rest.length; j++) {
      var l = rest[j];
      if (/^```/.test(l)) inCode = !inCode;
      var h = !inCode && /^##\s+(.+)$/.exec(l);
      if (h) { flush(); current = fold(h[1]).trim(); if (current !== SAID) shown.push(l); continue; }
      buf.push(l);
      if (current !== SAID) shown.push(l);
    }
    flush();

    var names = [tokens(head.title)].concat(phraseList(head.aka || ''));
    var tags = tokens((head.tags || '').replace(/,/g, ' '));
    var see = (head.see || '').split(',').map(function (s) { return s.trim(); }).filter(Boolean);

    var bodyWords = {};
    var all = tokens(words(shown.join('\n')));
    for (var b = 0; b < all.length; b++) bodyWords[all[b]] = true;

    return {
      id: id,
      title: head.title,
      warn: head.warn || '',
      source: head.source || '',
      see: see,
      tags: tags,
      names: names,
      said: said,
      lists: tokens((head.lists || '').replace(/,/g, ' ')),
      aka: (head.aka || '').split(',').map(function (a) { return a.trim(); }).filter(Boolean),
      licence: head.licence || '',
      sections: sections,
      order: order,
      bodyWords: bodyWords
    };
  }

  function buildKB(files, vocabText, model) {
    var entries = [], allTags = {};
    for (var i = 0; i < files.length; i++) {
      var e = parseEntry(files[i].text, files[i].name);
      entries.push(e);
      for (var t = 0; t < e.tags.length; t++) allTags[e.tags[t]] = true;
    }
    if (model === undefined && typeof root !== 'undefined' && root.METOS_MODEL) model = root.METOS_MODEL;
    return { entries: entries, vocab: parseVocab(vocabText || ''), allTags: allTags, model: model || null };
  }

  // ---- understanding -------------------------------------------------------

  // Pick the best-matching name from a table of phrase lists.
  // Returns { name, used } where used are the words that matched.
  function bestOf(table, words) {
    var best = null, bestLen = 0, used = [];
    for (var name in table) {
      var list = table[name];
      for (var i = 0; i < list.length; i++) {
        if (list[i].length > bestLen && hasPhrase(words, list[i])) {
          best = name; bestLen = list[i].length; used = list[i];
        }
      }
    }
    return { name: best, used: used };
  }

  function understand(query, kb) {
    var v = kb.vocab;
    var words = tokens(query);
    var content = withoutStops(words, v);

    var intent = bestOf(v.intent, words);
    var aspect = bestOf(v.aspect, words);

    // words spent on intent and aspect do not count as subject evidence
    var spent = {};
    intent.used.concat(aspect.used).forEach(function (w) { spent[w] = true; });

    var tags = {};
    for (var tag in v.tag) {
      for (var i = 0; i < v.tag[tag].length; i++) if (hasPhrase(words, v.tag[tag][i])) tags[tag] = true;
    }
    for (var c = 0; c < content.length; c++) if (kb.allTags[content[c]]) tags[content[c]] = true;

    var ranked = [];
    for (var n = 0; n < kb.entries.length; n++) {
      var e = kb.entries[n], score = 0, why = [];
      // 1. names: the strongest signal. Longer names beat shorter ones.
      var nameScore = 0, nameHit = '';
      for (var k = 0; k < e.names.length; k++) {
        var raw = e.names[k], p = withoutStops(raw, v), len = 0;
        if (hasPhrase(words, raw)) len = raw.length;
        // "make a fire" should match "make fire", but "when to plant"
        // must not shrink to just "plant"
        else if (p.length && (p.length > 1 || raw.length === 1) && hasPhrase(content, p)) len = p.length;
        if (len && 10 + len > nameScore) { nameScore = 10 + len; nameHit = raw.join(' '); }
      }
      if (nameScore) { score += nameScore; why.push('name "' + nameHit + '" +' + nameScore); }
      // 2. tags
      for (var t = 0; t < e.tags.length; t++) {
        if (tags[e.tags[t]]) { score += 3; why.push('tag ' + e.tags[t] + ' +3'); }
      }
      // 3. other words found in the text, capped so long entries do not win by size
      var hits = 0;
      for (var w = 0; w < content.length; w++) {
        if (!spent[content[w]] && e.bodyWords[content[w]]) hits++;
      }
      if (hits > 4) hits = 4;
      if (hits) { score += hits; why.push('text +' + hits); }
      if (score) ranked.push({ entry: e, score: score, named: nameScore > 0, nameHit: nameHit, why: why });
    }
    ranked.sort(function (a, b) { return b.score - a.score; });

    return {
      words: words,
      intent: intent.name || 'about',
      aspect: aspect.name,
      tags: Object.keys(tags),
      ranked: ranked
    };
  }

  // ---- the learned layer ----------------------------------------------------
  //
  // A small model trained from each entry's title, aka and "## also said"
  // lines (learn.js). It reads clues, not meaning: each word, each pair of
  // neighbouring words, and 3-4 letter pieces of each word, so "rebot" still
  // looks like "reboot". The same method as TermNL / ptiLU: TF-IDF clues and
  // a logistic regression, weights stored as whole numbers from -127 to 127.
  //
  // It only chooses which entry to open. The answer is still the entry's own
  // text, and below the thresholds metos asks or says it doesn't know.

  var SURE = 0.4;     // at or above: answer (set on tests/messy.md, 1 Nov 2026)
  var MAYBE = 0.15;   // from here to SURE: ask "do you mean...?"
  var DANGER = 0.08;  // a danger entry this likely is always shown too
  var NONE = '_none'; // the label taught by kb/_out-of-scope.md

  function clues(words) {
    var out = [], prev = '<s>';
    for (var i = 0; i < words.length; i++) {
      var t = words[i];
      out.push('w:' + t, 'b:' + prev + '_' + t);
      var p = '<' + t + '>';
      for (var n = 3; n <= 4; n++) {
        for (var j = 0; j + n <= p.length; j++) out.push('c:' + p.slice(j, j + n));
      }
      prev = t;
    }
    out.push('b:' + prev + '_</s>');
    return out;
  }

  // clue -> weight in the sentence (TF-IDF, scaled to length 1)
  function vector(model, words) {
    var counts = {}, cs = clues(words), v = [], norm = 0;
    for (var i = 0; i < cs.length; i++) if (model.clues[cs[i]]) counts[cs[i]] = (counts[cs[i]] || 0) + 1;
    for (var c in counts) {
      var x = (1 + Math.log(counts[c])) * model.clues[c][0] / 1000;
      v.push([c, x]);
      norm += x * x;
    }
    norm = Math.sqrt(norm) || 1;
    for (var k = 0; k < v.length; k++) v[k][1] /= norm;
    return v;
  }

  // -> [{ label, p, clues: [[clue, weight]] }], most likely first
  function predict(model, words) {
    var K = model.labels.length, logit = [], v = vector(model, words), i, k;
    for (k = 0; k < K; k++) logit.push(model.bias[k] * model.scale);
    for (i = 0; i < v.length; i++) {
      var w = model.clues[v[i][0]];
      for (k = 0; k < K; k++) logit[k] += v[i][1] * w[k + 1] * model.scale;
    }
    var max = Math.max.apply(null, logit), sum = 0, out = [];
    for (k = 0; k < K; k++) sum += Math.exp(logit[k] - max);
    for (k = 0; k < K; k++) out.push({ label: model.labels[k], p: Math.exp(logit[k] - max) / sum, k: k });
    out.sort(function (a, b) { return b.p - a.p; });
    // the clues that pushed the top choice most, for --why
    var top = out[0], why = [];
    for (i = 0; i < v.length; i++) why.push([v[i][0], v[i][1] * model.clues[v[i][0]][top.k + 1] * model.scale]);
    why.sort(function (a, b) { return b[1] - a[1]; });
    top.clues = why.slice(0, 6);
    return out;
  }

  // ---- answering -----------------------------------------------------------

  function listByTags(kb, tags) {
    var out = [];
    for (var i = 0; i < kb.entries.length; i++) {
      var e = kb.entries[i], ok = true;
      for (var t = 0; t < tags.length; t++) if (e.tags.indexOf(tags[t]) < 0) { ok = false; break; }
      if (ok) out.push(e);
    }
    return out;
  }

  // Which section answers the question?
  //  1. the aspect asked for ("how to grow" -> grow)
  //  2. else what the intent implies ("is it safe" -> safety)
  //  3. else, for open questions, the section containing most of the
  //     leftover query words ("sodis cloudy" -> the part about clouds)
  //  4. else the summary
  function pickSection(e, u, leftover) {
    var tries = [u.aspect, DEFAULT_SECTION[u.intent]];
    for (var i = 0; i < tries.length; i++) {
      var s = tries[i];
      if (s && s !== 'summary' && e.sections[s]) return { section: s, text: e.sections[s], missing: null };
    }
    if (!u.aspect && leftover.length) {
      var best = 'summary', bestHits = 0;
      for (var j = 0; j < e.order.length; j++) {
        var name = e.order[j], ws = tokens(words(e.sections[name])), seen = {}, hits = 0;
        for (var w = 0; w < ws.length; w++) seen[ws[w]] = true;
        for (var l = 0; l < leftover.length; l++) if (seen[leftover[l]]) hits++;
        if (hits > bestHits) { best = name; bestHits = hits; }
      }
      if (best !== 'summary') return { section: best, text: e.sections[best], missing: null };
    }
    var missing = u.aspect && u.aspect !== 'safety' ? u.aspect : null;
    // safety asked but no section: the warning line, always shown, is the answer
    return { section: 'summary', text: e.sections.summary || '', missing: missing };
  }

  // The word-list engine: the whole of metos when there is no model, and the
  // fallback for entries the model hasn't learnt yet.
  function askWords(query, kb, u) {
    u = u || understand(query, kb);
    var top = u.ranked[0], second = u.ranked[1];
    var strong = top && top.score >= MIN_SCORE && top.named;

    // A topic without a clear subject, or an explicit list request: list.
    if (u.tags.length && (!strong || u.intent === 'list')) {
      var list = listByTags(kb, u.tags);
      if (!list.length && u.tags.length > 1) {
        // relax: any of the tags
        list = kb.entries.filter(function (e) {
          return e.tags.some(function (t) { return u.tags.indexOf(t) >= 0; });
        });
      }
      if (list.length) return { type: 'list', entries: list, u: u };
    }

    if (!strong) {
      return { type: 'none', closest: u.ranked.filter(function (r) { return r.score >= 3; }).slice(0, 3).map(function (r) { return r.entry; }), u: u };
    }

    if (second && second.named && second.score >= MIN_SCORE && top.score - second.score <= CLOSE) {
      var options = u.ranked.filter(function (r) {
        return r.named && r.score >= MIN_SCORE && top.score - r.score <= CLOSE;
      }).map(function (r) { return r.entry; });
      return { type: 'choose', options: options, u: u };
    }

    return answer(top.entry, top.nameHit, u, kb);
  }

  function answer(e, nameHit, u, kb) {
    var nameWords = {}, leftover = [];
    tokens(nameHit || '').forEach(function (w) { nameWords[w] = true; });
    var content = withoutStops(u.words, kb.vocab);
    for (var i = 0; i < content.length; i++) {
      if (!nameWords[content[i]] && kb.allTags[content[i]] === undefined) leftover.push(content[i]);
    }
    var s = pickSection(e, u, leftover);
    if (e.lists && e.lists.length) s.missing = null; // an index answers with its list
    return {
      type: 'answer',
      entry: e,
      section: s.section,
      text: s.text,
      missing: s.missing,
      list: listOf(kb, e),
      u: u
    };
  }

  // An index entry ("lists: wild food") shows every entry with those tags,
  // danger entries first, so new entries of that kind appear in it by themselves.
  function listOf(kb, e) {
    if (!e.lists || !e.lists.length) return null;
    return withDanger(kb, listByTags(kb, e.lists).filter(function (x) { return x !== e; }));
  }

  function byId(kb, id) {
    for (var i = 0; i < kb.entries.length; i++) if (kb.entries[i].id === id) return kb.entries[i];
    return null;
  }

  function isDanger(e) { return e.tags.indexOf('danger') >= 0; }

  // Danger entries the question comes close to, besides the one answered.
  function dangerNear(kb, probs, except) {
    var out = [];
    for (var i = 0; i < probs.length; i++) {
      var e = probs[i].label !== NONE && byId(kb, probs[i].label);
      if (e && e !== except && isDanger(e) && probs[i].p >= DANGER) out.push(e);
    }
    return out;
  }

  // Danger entries first, then the rest; no repeats.
  function dangerFirst(list) {
    var seen = {}, out = [];
    list.filter(isDanger).concat(list.filter(function (e) { return !isDanger(e); })).forEach(function (e) {
      if (!seen[e.id]) { seen[e.id] = true; out.push(e); }
    });
    return out;
  }

  // A list of entries, with every danger entry that shares a tag with them
  // added at the top.
  function withDanger(kb, list) {
    var tags = {};
    list.forEach(function (e) { e.tags.forEach(function (t) { if (t !== 'danger') tags[t] = true; }); });
    var extra = kb.entries.filter(function (e) {
      return isDanger(e) && list.indexOf(e) < 0 && e.tags.some(function (t) { return tags[t]; });
    });
    return dangerFirst(extra.concat(list));
  }

  function ask(query, kb) {
    var u = understand(query, kb);
    if (!kb.model) return askWords(query, kb, u);

    // An entry named outright that the model hasn't learnt yet (just
    // written, not relearnt): the word lists answer for it.
    var named = u.ranked[0];
    if (named && named.named && named.score >= MIN_SCORE && kb.model.labels.indexOf(named.entry.id) < 0) {
      return askWords(query, kb, u);
    }

    var probs = predict(kb.model, u.words).filter(function (x) {
      return x.label === NONE || byId(kb, x.label);
    });
    u.model = probs.slice(0, 5).map(function (x) { return { id: x.label, p: Math.round(x.p * 100) }; });
    u.clues = probs[0] && probs[0].clues;
    var top = probs[0], entries = [];
    for (var i = 0; i < probs.length; i++) {
      if (probs[i].label !== NONE) entries.push({ e: byId(kb, probs[i].label), p: probs[i].p });
    }
    var best = entries[0];

    if (top && top.label !== NONE && top.p >= SURE) {
      var r = answer(best.e, '', u, kb);
      r.check = dangerNear(kb, probs, best.e);
      return r;
    }
    // A question about a kind of thing ("which plants can I eat", "wild
    // food") rather than one thing: list every entry of that kind, most likely
    // first, with the danger entries of that kind on top. An explicit list
    // request always lists; otherwise only when the model has no good guess.
    var topEntry = entries[0] ? entries[0].p : 0;
    if (u.tags.length && !(u.ranked[0] && u.ranked[0].named) && (u.intent === 'list' || topEntry < MAYBE)) {
      var kind = askWords(query, kb, u);
      if (kind.type === 'list' && kind.entries.length >= 2) {
        var rank = {};
        probs.forEach(function (x, i) { rank[x.label] = i; });
        kind.entries.sort(function (a, b) { return rank[a.id] - rank[b.id]; });
        kind.entries = withDanger(kb, kind.entries);
        kind.u = u;
        return kind;
      }
    }
    var maybe = entries.filter(function (x) { return x.p >= MAYBE; }).slice(0, 3).map(function (x) { return x.e; });
    var near = dangerNear(kb, probs, null);
    if (top.label !== NONE && maybe.length) {
      return { type: 'choose', options: dangerFirst(near.concat(maybe)), u: u };
    }
    var closest = entries.filter(function (x) { return x.p >= 0.05; }).slice(0, 3).map(function (x) { return x.e; });
    return { type: 'none', closest: dangerFirst(near.concat(closest)), u: u };
  }

  // Follow-up: show one section of one entry, by id.
  function open(kb, id, section) {
    for (var i = 0; i < kb.entries.length; i++) {
      var e = kb.entries[i];
      if (e.id === id) {
        var s = section && e.sections[section] ? section : 'summary';
        return { type: 'answer', entry: e, section: s, text: e.sections[s] || '', missing: null, list: listOf(kb, e) };
      }
    }
    return null;
  }

  var api = {
    tokens: tokens, parseVocab: parseVocab, parseEntry: parseEntry,
    buildKB: buildKB, understand: understand, ask: ask, askWords: askWords, open: open,
    clues: clues, predict: predict,
    MIN_SCORE: MIN_SCORE, CLOSE: CLOSE, SURE: SURE, MAYBE: MAYBE, DANGER: DANGER, NONE: NONE
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.metos = api;
})(this);

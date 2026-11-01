/*
 * metos learn: teaches the model which entry people mean.
 *
 *   node learn.js            reads kb/, writes model.json and model.js
 *   node learn.js --check    says whether model.js still matches kb/
 *
 * In the browser the same function runs after an entry is saved, so metos
 * relearns wherever it is, with no other machine and no libraries.
 *
 * What it learns from, all inside kb/:
 *   - each entry's title, its aka names and its "## also said" lines
 *   - kb/_out-of-scope.md: questions metos must not answer (label _none)
 *
 * Method (as TermNL and ptiLU): clues are words, word pairs and 3-4 letter
 * pieces (engine.js clues()), kept when they appear in 2 sentences or more;
 * TF-IDF; a logistic regression with a light penalty and balanced classes
 * (a label with few sentences weighs as much as one with many), trained in
 * full batches with Adam from all-zero weights. No
 * randomness: the same files always give the same model. Weights are then
 * stored as whole numbers from -127 to 127 times one scale.
 */
(function (root) {
  'use strict';
  var metos = typeof module !== 'undefined' && module.exports ? require('./engine.js') : root.metos;

  var C = 8;           // how freely weights may grow; TermNL's value
  var ROUNDS = 300;    // full passes over the examples
  var RATE = 0.05;     // Adam step size
  var MIN_DF = 2;      // a clue must appear in at least 2 sentences (TermNL's value)

  // The sentences each label is taught with.
  function examples(kb, outOfScope) {
    var out = [];
    kb.entries.forEach(function (e) {
      [e.title].concat(e.aka, e.said).forEach(function (t) {
        if (t && metos.tokens(t).length) out.push({ text: t, label: e.id });
      });
    });
    (outOfScope || []).forEach(function (t) {
      if (metos.tokens(t).length) out.push({ text: t, label: metos.NONE });
    });
    return out;
  }

  // Bullet lines of a Markdown file ("- question").
  function bullets(text) {
    return String(text || '').split('\n')
      .map(function (l) { return /^\s*[-*]\s+(.+)$/.exec(l); })
      .filter(Boolean).map(function (m) { return m[1].trim(); });
  }

  // FNV-1a over the teaching sentences: tells whether a model still matches.
  function fingerprint(ex) {
    var h = 0x811c9dc5, s = ex.map(function (x) { return x.label + '\t' + x.text; }).sort().join('\n');
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
    return ('0000000' + h.toString(16)).slice(-8);
  }

  function learn(kb, outOfScope, opts) {
    opts = opts || {};
    var started = Date.now();
    var ex = examples(kb, outOfScope);
    var labels = [];
    ex.forEach(function (x) { if (labels.indexOf(x.label) < 0) labels.push(x.label); });
    labels.sort();
    var K = labels.length, N = ex.length;

    // clue counts per sentence, and in how many sentences each clue appears
    var docs = [], df = {};
    ex.forEach(function (x) {
      var c = {};
      metos.clues(metos.tokens(x.text)).forEach(function (f) { c[f] = (c[f] || 0) + 1; });
      docs.push(c);
      for (var f in c) df[f] = (df[f] || 0) + 1;
    });
    var names = Object.keys(df).filter(function (f) { return df[f] >= MIN_DF; }).sort(), index = {}, F = names.length;
    names.forEach(function (f, j) { index[f] = j; });
    // idf kept to 3 decimals, exactly as stored, so training sees what answering sees
    var idf = names.map(function (f) { return Math.round((Math.log((1 + N) / (1 + df[f])) + 1) * 1000) / 1000; });

    // sparse rows: [[clue index, value]], length 1
    var rows = docs.map(function (c) {
      var r = [], norm = 0;
      for (var f in c) {
        if (index[f] === undefined) continue;
        var v = (1 + Math.log(c[f])) * idf[index[f]]; r.push([index[f], v]); norm += v * v;
      }
      norm = Math.sqrt(norm) || 1;
      r.forEach(function (p) { p[1] /= norm; });
      return r;
    });
    var y = ex.map(function (x) { return labels.indexOf(x.label); });
    // balanced classes, as TermNL: each label counts as much as any other in total
    var perLabel = {};
    y.forEach(function (k) { perLabel[k] = (perLabel[k] || 0) + 1; });
    var sw = y.map(function (k) { return N / (K * perLabel[k]); });

    var W = new Float64Array(F * K), b = new Float64Array(K);
    var mW = new Float64Array(F * K), vW = new Float64Array(F * K), mb = new Float64Array(K), vb = new Float64Array(K);
    var gW = new Float64Array(F * K), gb = new Float64Array(K);
    var lambda = 1 / (C * N), b1 = 0.9, b2 = 0.999, eps = 1e-8, loss = 0, t, i, k, j;
    var z = new Float64Array(K);

    for (t = 1; t <= ROUNDS; t++) {
      gW.fill(0); gb.fill(0); loss = 0;
      for (i = 0; i < N; i++) {
        var r = rows[i];
        for (k = 0; k < K; k++) z[k] = b[k];
        for (j = 0; j < r.length; j++) { var off = r[j][0] * K, v = r[j][1]; for (k = 0; k < K; k++) z[k] += v * W[off + k]; }
        var max = -Infinity, sum = 0;
        for (k = 0; k < K; k++) if (z[k] > max) max = z[k];
        for (k = 0; k < K; k++) { z[k] = Math.exp(z[k] - max); sum += z[k]; }
        loss -= sw[i] * Math.log(z[y[i]] / sum + 1e-12);
        for (k = 0; k < K; k++) {
          var d = sw[i] * (z[k] / sum - (k === y[i] ? 1 : 0)) / N;
          gb[k] += d;
          for (j = 0; j < r.length; j++) gW[r[j][0] * K + k] += r[j][1] * d;
        }
      }
      loss /= N;
      var c1 = 1 - Math.pow(b1, t), c2 = 1 - Math.pow(b2, t);
      for (j = 0; j < F * K; j++) {
        var g = gW[j] + lambda * W[j];
        mW[j] = b1 * mW[j] + (1 - b1) * g; vW[j] = b2 * vW[j] + (1 - b2) * g * g;
        W[j] -= RATE * (mW[j] / c1) / (Math.sqrt(vW[j] / c2) + eps);
      }
      for (k = 0; k < K; k++) {
        mb[k] = b1 * mb[k] + (1 - b1) * gb[k]; vb[k] = b2 * vb[k] + (1 - b2) * gb[k] * gb[k];
        b[k] -= RATE * (mb[k] / c1) / (Math.sqrt(vb[k] / c2) + eps);
      }
      if (opts.progress && t % 50 === 0) opts.progress(t / ROUNDS, loss);
    }

    // whole numbers from -127 to 127, one scale for all
    var big = 0;
    for (j = 0; j < F * K; j++) big = Math.max(big, Math.abs(W[j]));
    for (k = 0; k < K; k++) big = Math.max(big, Math.abs(b[k]));
    var scale = big / 127 || 1;
    var clues = {}, kept = 0;
    names.forEach(function (f, n) {
      var w = [], any = false;
      for (k = 0; k < K; k++) { var q = Math.round(W[n * K + k] / scale); w.push(q); if (q) any = true; }
      if (any) { clues[f] = [Math.round(idf[n] * 1000)].concat(w); kept++; }
    });
    var bias = [];
    for (k = 0; k < K; k++) bias.push(Math.round(b[k] / scale));

    var taught = {};
    ex.forEach(function (x) { taught[x.label] = (taught[x.label] || 0) + 1; });
    var model = {
      format: 'metos-model/1',
      trained: new Date().toISOString().slice(0, 19) + 'Z',
      method: 'clues (words, word pairs, 3-4 letter pieces), TF-IDF, logistic regression C=' + C + ', ' + ROUNDS + ' rounds',
      fingerprint: fingerprint(ex),
      examples: N,
      taught: taught,
      labels: labels,
      scale: scale,
      bias: bias,
      clues: clues
    };

    // how many teaching sentences it gets right itself (not a test: a sanity check)
    var right = 0;
    ex.forEach(function (x) { if (metos.predict(model, metos.tokens(x.text))[0].label === x.label) right++; });
    model.selfCheck = right + '/' + N;
    model.seconds = Math.round((Date.now() - started) / 100) / 10;
    model.loss = Math.round(loss * 1000) / 1000;
    model.cluesKept = kept + '/' + F;
    return model;
  }

  var api = { learn: learn, examples: examples, bullets: bullets, fingerprint: fingerprint };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.metosLearn = api;

  // ---- command line ----------------------------------------------------------
  if (typeof module !== 'undefined' && module.exports && require.main === module) {
    var fs = require('fs'), path = require('path');
    var here = __dirname, kbDir = path.join(here, 'kb');
    var files = fs.readdirSync(kbDir)
      .filter(function (f) { return /\.(md|txt)$/i.test(f) && !/^_/.test(f); }).sort()
      .map(function (f) { return { name: f, text: fs.readFileSync(path.join(kbDir, f), 'utf8') }; });
    var oosPath = path.join(kbDir, '_out-of-scope.md');
    var oos = fs.existsSync(oosPath) ? bullets(fs.readFileSync(oosPath, 'utf8')) : [];
    var kb = metos.buildKB(files, fs.readFileSync(path.join(here, 'vocab.txt'), 'utf8'), null);

    if (process.argv.indexOf('--check') >= 0) {
      var have = fs.existsSync(path.join(here, 'model.json')) && JSON.parse(fs.readFileSync(path.join(here, 'model.json'), 'utf8'));
      var now = fingerprint(examples(kb, oos));
      console.log(have && have.fingerprint === now ? 'model.json matches kb/ (' + now + ')' : 'model.json is out of date: run node learn.js');
      process.exit(have && have.fingerprint === now ? 0 : 1);
    }

    var model = learn(kb, oos, { progress: function (f, l) { process.stdout.write('\r  learning ' + Math.round(f * 100) + '%  loss ' + l.toFixed(3)); } });
    process.stdout.write('\n');
    var json = JSON.stringify(model);
    fs.writeFileSync(path.join(here, 'model.json'), json + '\n');
    fs.writeFileSync(path.join(here, 'model.js'), '// Generated by learn.js from kb/. Do not edit by hand.\nwindow.METOS_MODEL = ' + json + ';\n');
    var thin = kb.entries.filter(function (e) { return (model.taught[e.id] || 0) < 15; }).map(function (e) { return e.id + ' (' + (model.taught[e.id] || 0) + ')'; });
    console.log('model.json: ' + model.labels.length + ' labels, ' + model.examples + ' sentences, ' +
      model.cluesKept + ' clues kept, ' + Math.round(json.length / 1024) + ' KB, ' + model.seconds + ' s');
    console.log('self check: ' + model.selfCheck + ' teaching sentences recognised');
    if (thin.length) console.log('few sentences, add "## also said" lines: ' + thin.join(', '));
  }
})(this);

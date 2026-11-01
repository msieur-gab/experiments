#!/usr/bin/env node
/*
 * How well metos understands, on question sets it was never taught with.
 *
 *   node tests/measure.js                 every set in tests/, with and without the model
 *   node tests/measure.js -v              also list every question that went wrong
 *   node tests/measure.js --report        also write tests/REPORT.md
 *
 * A set is a Markdown file with lines "- question => entry". Several
 * acceptable entries are joined with "|"; NONE means metos should say it
 * doesn't know; "!danger" marks questions where missing the entry could hurt.
 *
 * Outcomes, from best to worst:
 *   right      answers with an acceptable entry (or abstains on NONE)
 *   asked      asks "which one?" and an acceptable entry is offered
 *   abstained  says it doesn't know, on a question it should answer
 *   wrong      answers with another entry, offers only wrong ones, or answers a NONE question
 * Danger questions pass when the right entry is shown in any way (answered,
 * offered, or as a "check also"); a NONE danger question passes when metos
 * doesn't answer it.
 */
'use strict';
var fs = require('fs');
var path = require('path');
var root = path.join(__dirname, '..');
var metos = require(path.join(root, 'engine.js'));

var verbose = process.argv.indexOf('-v') >= 0;
var report = process.argv.indexOf('--report') >= 0;

function loadKB(withModel) {
  var kbDir = path.join(root, 'kb');
  var files = fs.readdirSync(kbDir).filter(function (f) { return /\.(md|txt)$/i.test(f) && !/^_/.test(f); }).sort()
    .map(function (f) { return { name: f, text: fs.readFileSync(path.join(kbDir, f), 'utf8') }; });
  var model = withModel ? JSON.parse(fs.readFileSync(path.join(root, 'model.json'), 'utf8')) : null;
  return metos.buildKB(files, fs.readFileSync(path.join(root, 'vocab.txt'), 'utf8'), model);
}

function readSet(file) {
  var out = [];
  fs.readFileSync(file, 'utf8').split('\n').forEach(function (l) {
    var m = /^- (.+?)\s*=>\s*([^!]+?)\s*(!danger)?\s*$/.exec(l);
    if (m) out.push({ q: m[1], want: m[2].split('|').map(function (s) { return s.trim(); }), danger: !!m[3] });
  });
  return out;
}

function judge(kb, t) {
  var r = metos.ask(t.q, kb), none = t.want[0] === 'NONE';
  var shown = [], got;
  if (r.type === 'answer') { shown = [r.entry.id].concat((r.check || []).map(function (e) { return e.id; })); got = r.entry.id; }
  else if (r.type === 'choose') { shown = r.options.map(function (e) { return e.id; }); got = 'asks: ' + shown.join(', '); }
  else if (r.type === 'list') { shown = r.entries.map(function (e) { return e.id; }); got = 'lists ' + shown.length; }
  else { shown = r.closest.map(function (e) { return e.id; }); got = "doesn't know" + (shown.length ? ' (close: ' + shown.join(', ') + ')' : ''); }
  var hit = function (id) { return t.want.indexOf(id) >= 0; };
  var outcome;
  if (none) outcome = r.type === 'answer' ? 'wrong' : r.type === 'none' ? 'right' : 'asked';
  else if (r.type === 'answer') outcome = hit(r.entry.id) ? 'right' : 'wrong';
  else if (r.type === 'choose' || r.type === 'list') outcome = shown.some(hit) ? 'asked' : 'wrong';
  else outcome = 'abstained';
  // for NONE questions, "asked" means it offered entries instead of saying it doesn't know: not wrong, not right
  var dangerOk = t.danger ? (none ? r.type !== 'answer' : shown.some(hit)) : null;
  return { q: t.q, want: t.want.join('|'), got: got, outcome: outcome, danger: t.danger, dangerOk: dangerOk };
}

function run(kb, set) {
  var res = set.map(function (t) { return judge(kb, t); });
  var count = function (o) { return res.filter(function (r) { return r.outcome === o; }).length; };
  var inScope = res.filter(function (r, i) { return set[i].want[0] !== 'NONE'; });
  var oos = res.filter(function (r, i) { return set[i].want[0] === 'NONE'; });
  var d = res.filter(function (r) { return r.danger; });
  return {
    res: res,
    n: res.length,
    right: count('right'), asked: count('asked'), abstained: count('abstained'), wrong: count('wrong'),
    inRight: inScope.filter(function (r) { return r.outcome === 'right'; }).length, inN: inScope.length,
    oosRight: oos.filter(function (r) { return r.outcome === 'right'; }).length, oosN: oos.length,
    oosAnswered: oos.filter(function (r) { return r.outcome === 'wrong'; }).length,
    danger: d.filter(function (r) { return r.dangerOk; }).length, dangerN: d.length
  };
}

var sets = fs.readdirSync(__dirname).filter(function (f) { return /\.md$/.test(f) && f !== 'REPORT.md'; }).sort();
var engines = [['word lists only', loadKB(false)]];
if (fs.existsSync(path.join(root, 'model.json'))) engines.push(['with the model', loadKB(true)]);
var lines = [];

sets.forEach(function (f) {
  var set = readSet(path.join(__dirname, f));
  if (!set.length) return;
  lines.push('## ' + f + ' (' + set.length + ' questions)', '');
  lines.push('| engine | right | asked | abstained | wrong | in scope answered right | out of scope declined | out of scope answered | danger shown |');
  lines.push('|---|---|---|---|---|---|---|---|---|');
  var last;
  engines.forEach(function (en) {
    var s = run(en[1], set);
    last = s;
    lines.push('| ' + en[0] + ' | ' + s.right + ' | ' + s.asked + ' | ' + s.abstained + ' | ' + s.wrong + ' | ' +
      s.inRight + '/' + s.inN + ' | ' + s.oosRight + '/' + s.oosN + ' | ' + s.oosAnswered + ' | ' + s.danger + '/' + s.dangerN + ' |');
  });
  var bad = last.res.filter(function (r) { return r.outcome !== 'right' || r.dangerOk === false; });
  lines.push('');
  if (bad.length) {
    lines.push('Not right with ' + engines[engines.length - 1][0] + ':', '');
    bad.forEach(function (r) {
      lines.push('- ' + (r.dangerOk === false ? '**DANGER** ' : '') + '"' + r.q + '": wanted ' + r.want + ', ' + r.got + ' (' + r.outcome + ')');
    });
    lines.push('');
  }
});

var model = engines.length > 1 && engines[1][1].model;
var head = ['# metos: how well it understands', '',
  'Generated by `node tests/measure.js --report`' + (model ? ', model trained ' + model.trained + ' from ' + model.examples + ' sentences (fingerprint ' + model.fingerprint + ')' : '') + '.',
  'None of these questions were used for training.', ''];
var text = head.concat(lines).join('\n');
if (report) fs.writeFileSync(path.join(__dirname, 'REPORT.md'), text + '\n');
console.log(verbose || report ? text : lines.filter(function (l) { return /^(##|\|)/.test(l); }).join('\n'));

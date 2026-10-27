#!/usr/bin/env node
/*
 * metos in a terminal. Reads the kb folder directly, so dropping a file in
 * is enough: no build step.
 *
 *   node cli.js "how do I make water safe"
 *   node cli.js            (interactive)
 *   node cli.js --why "is wild garlic safe"   (show how it decided)
 */
'use strict';
var fs = require('fs');
var path = require('path');
var readline = require('readline');
var metos = require('./engine.js');

var here = __dirname;
var kbDir = path.join(here, 'kb');

function loadKB() {
  var files = fs.readdirSync(kbDir)
    .filter(function (f) { return /\.(md|txt)$/i.test(f); })
    .map(function (f) { return { name: f, text: fs.readFileSync(path.join(kbDir, f), 'utf8') }; });
  var vocabPath = path.join(here, 'vocab.txt');
  var vocab = fs.existsSync(vocabPath) ? fs.readFileSync(vocabPath, 'utf8') : '';
  return metos.buildKB(files, vocab);
}

// Images cannot show in a terminal: print their caption instead.
function plain(text) {
  return text.replace(/!\[([^\]]*)\]\([^)]*\)/g, '[picture: $1]');
}

function firstLine(e) {
  return (e.sections.summary || '').split('\n')[0];
}

function render(r, why) {
  var out = [];
  if (r.type === 'answer') {
    out.push('== ' + r.entry.title + (r.section !== 'summary' ? ' / ' + r.section : '') + ' ==');
    if (r.entry.warn) out.push('! ' + r.entry.warn);
    if (r.missing) out.push('(This entry has nothing on "' + r.missing + '". Here is the summary.)');
    out.push('');
    out.push(plain(r.text));
    var more = r.entry.order.filter(function (s) { return s !== r.section; });
    if (more.length) out.push('\nalso: ' + more.join(', '));
    if (r.entry.see.length) out.push('see: ' + r.entry.see.join(', '));
    if (r.entry.source) out.push('source: ' + r.entry.source);
  } else if (r.type === 'list') {
    out.push('== ' + r.u.tags.join(' + ') + ' ==');
    r.entries.forEach(function (e) {
      out.push('- ' + e.title + '\n  ' + firstLine(e));
    });
  } else if (r.type === 'choose') {
    out.push('Which one do you mean?');
    r.options.forEach(function (e) { out.push('- ' + e.title); });
  } else {
    out.push("I don't have that in the knowledge base.");
    if (r.closest.length) out.push('Closest: ' + r.closest.map(function (e) { return e.title; }).join(', '));
  }
  if (why) {
    out.push('\n-- why --');
    out.push('intent: ' + r.u.intent + '   aspect: ' + (r.u.aspect || '-') + '   tags: ' + (r.u.tags.join(' ') || '-'));
    r.u.ranked.slice(0, 4).forEach(function (x) {
      out.push(x.score + '  ' + x.entry.id + '  (' + x.why.join(', ') + ')');
    });
  }
  return out.join('\n');
}

var args = process.argv.slice(2);
var why = false;
if (args[0] === '--why') { why = true; args.shift(); }
var kb = loadKB();

if (args.length) {
  console.log(render(metos.ask(args.join(' '), kb), why));
} else {
  console.log('metos: ' + kb.entries.length + ' entries. Ask a question, or empty line to quit.');
  var rl = readline.createInterface({ input: process.stdin, output: process.stdout, prompt: '> ' });
  rl.prompt();
  rl.on('line', function (line) {
    if (!line.trim()) return rl.close();
    console.log(render(metos.ask(line, kb), why) + '\n');
    rl.prompt();
  });
}


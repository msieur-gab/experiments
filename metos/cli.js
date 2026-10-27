#!/usr/bin/env node
/*
 * metos in a terminal. Reads the kb folder directly, so dropping a file in
 * is enough: no build step.
 *
 *   node cli.js "how do I make water safe"
 *   node cli.js            (interactive)
 *   node cli.js --why "is wild garlic safe"   (show how it decided)
 *   --color / --raw    force pictures in colour, or as raw text
 */
'use strict';
var fs = require('fs');
var path = require('path');
var readline = require('readline');
var metos = require('./engine.js');
var pic = require('./pic.js');

var here = __dirname;
var kbDir = path.join(here, 'kb');

function loadKB() {
  var files = fs.readdirSync(kbDir)
    .filter(function (f) { return /\.(md|txt)$/i.test(f) && !/^_/.test(f); })
    .map(function (f) { return { name: f, text: fs.readFileSync(path.join(kbDir, f), 'utf8') }; });
  var vocabPath = path.join(here, 'vocab.txt');
  var vocab = fs.existsSync(vocabPath) ? fs.readFileSync(vocabPath, 'utf8') : '';
  return metos.buildKB(files, vocab);
}

// Image files cannot show in a terminal: print their caption instead.
// ```pic pictures are drawn with coloured half blocks when the terminal
// supports colour; otherwise their raw text is shown, which still reads
// as a rough ASCII picture.
var colour = process.stdout.isTTY && /truecolor|24bit/i.test(process.env.COLORTERM || '') && !process.env.NO_COLOR;
if (process.argv.indexOf('--color') >= 0) colour = true;
if (process.argv.indexOf('--raw') >= 0) colour = false;

function plain(text) {
  var lines = text.split('\n'), out = [], i = 0;
  while (i < lines.length) {
    var m = /^```pic\b\s*(.*)$/.exec(lines[i]);
    if (!m) { out.push(lines[i++].replace(/!\[([^\]]*)\]\([^)]*\)/g, '[picture: $1]')); continue; }
    var block = [];
    i++;
    while (i < lines.length && !/^```/.test(lines[i])) block.push(lines[i++]);
    i++;
    var parsed = pic.parse(block.join('\n'));
    if (colour && parsed) out.push(pic.toAnsi(parsed));
    else if (parsed) out = out.concat(parsed.rows);
    if (m[1]) out.push('[picture: ' + m[1] + ']');
  }
  return out.join('\n');
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
var why = args.indexOf('--why') >= 0;
args = args.filter(function (a) { return !/^--(why|color|raw)$/.test(a); });
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


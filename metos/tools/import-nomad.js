#!/usr/bin/env node
/*
 * Turns Project NOMAD's health datasets into metos entries.
 *
 *   node tools/import-nomad.js            writes kb/<slug>.md for every herb and home remedy
 *   node tools/import-nomad.js --dry      says what it would write
 *
 * Reads sources/nomad/, downloaded from Project NOMAD at commit 54ee30a:
 *   natural_remedies.json  18 herbs, NOMAD's summaries of NIH NCCIH "Herbs at a Glance"
 *   home_remedies.json     20 home measures, NOMAD's summaries of CDC, NIH, MedlinePlus and FDA pages
 *   conditions.json        the conditions each one is used for
 *
 * The text is NOMAD's (Apache-2.0), summarising US government pages (public domain).
 * Every field is copied as written: uses -> summary, how -> ## how, evidence ->
 * ## evidence, cautions -> ## safety, conditions -> ## used for. The warn line is the
 * cautions' own sentences that say what to avoid or when to get help, word for word.
 *
 * Running it again rewrites these entries but keeps their "## also said" lines.
 */
'use strict';
var fs = require('fs');
var path = require('path');

var root = path.join(__dirname, '..');
var src = path.join(root, 'sources', 'nomad');
var kbDir = path.join(root, 'kb');
var COMMIT = '54ee30a';
var dry = process.argv.indexOf('--dry') >= 0;

function load(name) { return JSON.parse(fs.readFileSync(path.join(src, name), 'utf8')); }

var conditions = {};
load('conditions.json').conditions.forEach(function (c) { conditions[c.slug] = c; });

// cautions sentences that warn: copied word for word, never rewritten
var WARNS = /\b(avoid|do not|don't|never|stop|seek|call|emergency|toxic|poison|liver|kidney|pregnan|breastfeed|infant|child|bleed|interact|allerg|serious|harm|severe|cancer)/i;
function warnOf(cautions) {
  var parts = String(cautions || '').split(/(?<=[.!?])\s+(?=[A-Z])/);
  return parts.filter(function (s) { return WARNS.test(s); }).join(' ').trim();
}

function keptSaid(file) {
  if (!fs.existsSync(file)) return '';
  var m = /\n## also said\n([\s\S]*)$/.exec(fs.readFileSync(file, 'utf8'));
  return m ? m[1].trim() : '';
}

function entry(r, kind, sourceName) {
  var oneLine = function (s) { return String(s || '').replace(/\s*\n\s*/g, ' ').trim(); };
  var used = (r.conditions || []).map(function (c) { return conditions[c] ? conditions[c].label : c; });
  var aka = (r.commonNames || []).concat(used.length && kind === 'remedy' ? [] : []);
  var head = [
    'title: ' + r.name,
    aka.length ? 'aka: ' + aka.join(', ') : null,
    'tags: ' + (kind === 'herb' ? 'plant medicinal herb' : 'health remedy'),
    warnOf(r.cautions) ? 'warn: ' + oneLine(warnOf(r.cautions)) : null,
    'source: ' + r.sourceUrl + ', as summarised by Project NOMAD (' + sourceName + ', commit ' + COMMIT + ')',
    'licence: text Apache-2.0 (Project NOMAD), summarising a US government page (public domain)',
    'origin: nomad/' + sourceName + '#' + r.slug
  ].filter(Boolean);
  var body = [head.join('\n'), '', oneLine(r.uses)];
  if (r.how) body.push('', '## how', oneLine(r.how));
  if (r.evidence) body.push('', '## evidence', oneLine(r.evidence));
  if (r.cautions) body.push('', '## safety', oneLine(r.cautions));
  if (used.length) body.push('', '## used for', used.map(function (u) { return '- ' + u; }).join('\n'));
  return body.join('\n') + '\n';
}

var written = [];
[['natural_remedies.json', 'herb'], ['home_remedies.json', 'remedy']].forEach(function (pair) {
  load(pair[0]).remedies.forEach(function (r) {
    var file = path.join(kbDir, r.slug + '.md');
    if (fs.existsSync(file) && !/\norigin: nomad\//.test(fs.readFileSync(file, 'utf8'))) {
      console.log('skipped ' + r.slug + ': kb/' + r.slug + '.md exists and was not imported');
      return;
    }
    var text = entry(r, pair[1], pair[0]);
    var said = keptSaid(file);
    if (said) text += '\n## also said\n' + said + '\n';
    if (!dry) fs.writeFileSync(file, text);
    written.push(r.slug);
  });
});
// Conditions with two or more remedies become index entries: "sore throat"
// shows every entry that helps with it. Their searchTerms are the words people use.
var byCondition = {};
['natural_remedies.json', 'home_remedies.json'].forEach(function (n) {
  load(n).remedies.forEach(function (r) {
    (r.conditions || []).forEach(function (c) { (byCondition[c] = byCondition[c] || []).push(r.slug); });
  });
});
var indexes = [];
load('conditions.json').conditions.forEach(function (c) {
  var ids = byCondition[c.slug] || [];
  if (ids.length < 2) return;
  var file = path.join(kbDir, 'for-' + c.slug + '.md');
  var text = [
    'title: ' + c.label,
    'aka: ' + c.searchTerms.join(', '),
    'tags: health index',
    'includes: ' + ids.join(', '),
    'source: Project NOMAD conditions.json (commit ' + COMMIT + '): the entries in this knowledge base used for ' + c.label.toLowerCase(),
    'licence: Apache-2.0 (Project NOMAD)',
    'origin: nomad/conditions.json#' + c.slug,
    '',
    'These entries say what can help with ' + c.label.toLowerCase() + ' (' + c.category.toLowerCase() + '), what the evidence says and when to get medical help. Open one to read it.'
  ].join('\n') + '\n';
  var said = keptSaid(file);
  if (said) text += '\n## also said\n' + said + '\n';
  if (!dry) fs.writeFileSync(file, text);
  indexes.push('for-' + c.slug);
});
console.log((dry ? 'would write ' : 'wrote ') + written.length + ' entries: ' + written.join(', '));
console.log((dry ? 'would write ' : 'wrote ') + indexes.length + ' condition indexes: ' + indexes.join(', '));

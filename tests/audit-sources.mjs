// Are the Quran references valid, and does each direct reference contain the named expression?
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { names } from '../docs/names.js';
import { verseExcerpt } from '../docs/verses.js';

async function loadCorpus() {
  if (process.argv[2]) return JSON.parse(await readFile(process.argv[2], 'utf8'));
  const response = await fetch('https://api.quran.com/api/v4/quran/verses/imlaei');
  if (!response.ok) throw new Error('Quran.com returned HTTP ' + response.status);
  return response.json();
}
const { verses } = await loadCorpus();
assert.equal(verses.length, 6236);
const verseById = new Map(verses.map(verse => [verse.verse_key, verse.text_imlaei]));

const strip = value => value.replace(/\p{M}|ـ/gu, '').replace(/[أإآٱ]/g, 'ا')
  .replace(/ر[ؤء]وف/g, 'رءوف').replace(/رحمن/g, 'رحمان');
const token = value => /^[وفب]?(?:الله)$/.test(value) ? 'الله'
  : value.replace(/^(?:[وفبلك]?ال|لل)/, '').replace(/ى$/, 'ي');
const tokens = value => (strip(value).match(/\p{L}+/gu) || []).map(token);
const endings = ['ا', 'كم', 'ه', 'ي'];
function matches(word, expected) {
  const stems = [word, word.replace(/^ل/, '')];
  const forms = stems.flatMap(stem => [
    stem, ...endings.filter(ending => stem.endsWith(ending)).map(ending => stem.slice(0, -ending.length))
  ]);
  return forms.includes(expected) || (expected.endsWith('ي') && stems.includes(expected.slice(0, -1)));
}

let verified = 0;
const review = [];
const literal = value => value.normalize('NFC').split(/\s+/).filter(word => /\p{L}/u.test(word));
function hasExcerpt(verse, excerpt) {
  const words = literal(verse);
  const focus = literal(excerpt);
  return words.some((_, index) => focus.every((word, offset) => words[index + offset] === word));
}

for (const name of names) for (const ref of name.refs) {
  if (!/^[=~]/.test(ref)) continue;
  const verse = verseById.get(ref.slice(1));
  assert.ok(verse, 'Missing verse ' + ref);
  const excerpt = verseExcerpt(name, ref.slice(1));
  assert.ok(excerpt?.meaning.every(text => text.length > 0), `${name.latin} ${ref} needs an excerpt and both translations`);
  assert.ok(hasExcerpt(verse, excerpt.ar), `${name.latin} ${ref} has a nonverbatim excerpt: ${excerpt.ar}`);
  verified += 1;
  if (ref[0] === '~') continue;
  let expected = tokens(name.ar);
  if (name.id === 85) expected = expected.slice(1);
  const words = tokens(excerpt.ar);
  if (!words.some((_, index) => expected.every((word, offset) => words[index + offset] && matches(words[index + offset], word)))) {
    review.push(`${name.id} ${name.latin} ${ref} ${excerpt.ar}`);
  }
}
assert.ok(hasExcerpt(verseById.get('7:180'), verseExcerpt(null, '7:180').ar));
assert.deepEqual(review, [], 'Check spelling and inflection of direct references');
console.log(`Verified verse references and literal excerpts: ${verified}`);

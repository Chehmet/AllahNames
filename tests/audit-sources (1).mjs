// Are the Quran references valid, and does each direct reference contain the named expression?
import assert from 'node:assert/strict';
import { names } from '../docs/names.js';

const response = await fetch('https://api.quran.com/api/v4/quran/verses/imlaei');
if (!response.ok) throw new Error('Quran.com returned HTTP ' + response.status);
const { verses } = await response.json();
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
for (const name of names) for (const ref of name.refs) {
  if (!/^[=~]/.test(ref)) continue;
  const verse = verseById.get(ref.slice(1));
  assert.ok(verse, 'Missing verse ' + ref);
  verified += 1;
  if (ref[0] === '~') continue;
  let expected = tokens(name.ar);
  if (name.id === 85) expected = expected.slice(1);
  const words = tokens(verse);
  if (!words.some((_, index) => expected.every((word, offset) => words[index + offset] && matches(words[index + offset], word)))) {
    review.push(`${name.id} ${name.latin} ${ref} ${verse}`);
  }
}
assert.deepEqual(review, [], 'Check spelling and inflection of direct references');
console.log(`Verified verse references: ${verified}`);

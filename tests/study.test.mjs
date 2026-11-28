import assert from 'node:assert/strict';
import test from 'node:test';
import jsQR from 'jsqr';
import { names, byId, groups, related, sourceLink } from '../docs/names.js';
import { due, makeQuiz, nameFragment, schedule, shuffle } from '../docs/quiz.js';
import { matrix } from '../docs/qr.js';
import { gameCSV, invitation, roomErrorMessage } from '../docs/rooms.js';
import { verseExcerpt } from '../docs/verses.js';
import { studyDetails } from '../docs/name-details.js';

test('catalogue has 99 distinct names, complete bilingual cards and useful connections', () => {
  assert.equal(names.length, 99);
  assert.equal(Object.keys(studyDetails).length, names.length);
  for (const key of ['id', 'ar', 'ru', 'latin']) assert.equal(new Set(names.map(name => name[key])).size, 99);
  for (const name of names) {
    const study = studyDetails[name.id];
    assert.ok(study.clue.every(text => text.length > 15));
    assert.equal(study.paragraphs.length, 2);
    assert.ok(study.paragraphs.flat().every(text => text.length > 70));
    assert.match(name.ar, /\p{Script=Arabic}/u);
    assert.match(name.ru, /\p{Script=Cyrillic}/u);
    assert.ok(groups[name.group]);
    for (const key of ['meaning', 'note', 'cue']) assert.ok(name[key].every(value => value?.length > 2));
    name.variants.forEach((alternatives, index) => {
      assert.equal(new Set(alternatives).size, alternatives.length);
      assert.ok(alternatives.every(value => value !== name.meaning[index] && value?.length > 2));
    });
    assert.ok(related(name).length >= 1);
    assert.ok(related(name).every(other => other && other !== name));
    for (const ref of name.refs) {
      assert.match(ref, /^(?:[=~]\d+:\d+|[hk]:(?:muslim|bukhari|abudawud):\d+[a-z]?)$/);
      assert.ok(sourceLink(ref).url.startsWith('https://'));
      if (/^[=~]/.test(ref)) {
        const quote = verseExcerpt(name, ref.slice(1));
        assert.match(quote?.ar, /\p{Script=Arabic}/u, name.latin + ' ' + ref);
        assert.ok(quote.meaning.every(value => value?.length > 2));
      }
    }
  }
});

test('Ar-Rahim keeps Merciful as its main gloss and includes the expression from 33:43', () => {
  const rahim = byId.get(3);
  assert.equal(rahim.meaning[0], 'Милосердный');
  assert.ok(rahim.variants[0].includes('Милующий'));
  assert.deepEqual(verseExcerpt(rahim, '33:43'), {
    ar: 'وَكَانَ بِالْمُؤْمِنِينَ رَحِيمًا',
    meaning: ['Он милосерден к верующим.', 'He is merciful to the believers.']
  });
});

test('room errors name the Supabase setting when guest sign-in is disabled', () => {
  const error = { code: 'anonymous_provider_disabled', message: 'Anonymous sign-ins are disabled' };
  assert.match(roomErrorMessage(error), /Гостевой вход выключен.*Allow anonymous sign-ins/);
  assert.match(roomErrorMessage({ message: 'nickname_taken' }), /Это имя уже занято/);
});

test('quiz samples without replacement and 50/50 keeps the right answer at every difficulty', () => {
  for (const difficulty of ['easy', 'medium', 'hard']) {
    const questions = makeQuiz(names, 99, difficulty);
    assert.equal(questions.length, 99);
    assert.equal(new Set(questions.map(question => question.id)).size, 99);
    for (const question of questions) {
      assert.equal(new Set(question.options).size, 4);
      assert.ok(question.options.includes(question.id));
      assert.equal(question.remove.length, 2);
      assert.equal(question.options.filter(id => !question.remove.includes(id)).length, 2);
      assert.ok(!question.remove.includes(question.id));
    }
  }
  const original = [1, 2, 3, 4];
  assert.deepEqual(shuffle(original, () => 0), [2, 3, 4, 1]);
  assert.deepEqual(original, [1, 2, 3, 4]);
  assert.equal(makeQuiz([byId.get(2)], 10, 'hard').length, 1);
  assert.equal(nameFragment(byId.get(2), 'reverse', 0), 'Рах…');
  assert.ok(!/\p{M}/u.test(nameFragment(byId.get(2), 'arabic', 0)));
});

test('review advances to the next interval, resets on a miss and caps at 30 days', () => {
  const start = 123456;
  assert.equal(due(null, start), true);
  const first = schedule(null, true, start);
  assert.deepEqual(first, { level: 1, next: start + 86400000 });
  assert.equal(due(first, first.next - 1), false);
  assert.equal(due(first, first.next), true);
  assert.equal(schedule(first, false, start).next, start + 600000);
  assert.equal(schedule({ level: 5 }, true, start).next, start + 30 * 86400000);
});

test('invitation QR decodes to the exact GitHub Pages project URL', () => {
  const url = invitation('https://student.github.io/asma-quiz/?old=1#catalog', '3A7B4C2D');
  assert.equal(url, 'https://student.github.io/asma-quiz/?room=3A7B4C2D#room');
  const qr = matrix(url);
  const width = (qr.length + 8) * 5;
  const pixels = new Uint8ClampedArray(width * width * 4).fill(255);
  qr.forEach((row, y) => row.forEach((dark, x) => {
    if (!dark) return;
    for (let v = 0; v < 5; v += 1) for (let u = 0; u < 5; u += 1) {
      const index = ((y + 4) * 5 + v) * width * 4 + ((x + 4) * 5 + u) * 4;
      pixels.fill(0, index, index + 3);
    }
  }));
  assert.equal(jsQR(pixels, width, width)?.data, url);
});

test('CSV includes unanswered questions and treats spreadsheet formulas as plain text', () => {
  const csv = gameCSV([{ nickname: '=1+1', round: 1, id: 2, choice: null, correct: null },
    { nickname: 'Аня "А"', round: 1, id: 2, choice: 3, correct: false }]);
  assert.ok(csv.startsWith('\uFEFF'));
  assert.ok(csv.includes(`"'=1+1","1","Ар-Рахман","","Пропуск"`));
  assert.ok(csv.includes('"Аня ""А"""'));
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { names, byId } from '../docs/names.js';
import { makeQuiz } from '../docs/quiz.js';
import { schema, testDatabase } from './postgres.mjs';

const ids = ['a', 'b', 'c', 'd'].map(value => '00000000-0000-0000-0000-00000000000' + value);
const identities = [false, true, true, false].map((is_anonymous, index) => ({ sub: ids[index], is_anonymous }));

test('Postgres enforces room phases, roles, one answer per player and correct live/final results', async () => {
  const db = await testDatabase();
  try {
    for (const id of ids) await db.query('insert into auth.users values ($1)', [id]);
    await db.exec(await schema());
    async function as(index) {
      await db.exec(index == null ? 'set role anon' : 'set role authenticated');
      await db.query("select set_config('request.jwt.claims', $1, false)", [index == null ? '' : JSON.stringify(identities[index])]);
    }
    async function call(statement, params = []) {
      return (await db.query(`select public.aq_${statement} as result`, params)).rows[0].result;
    }
    const sample = [{ id: 2, mode: 'name', options: [6, 2, 3, 5] },
      { id: 12, mode: 'reverse', options: [12, 13, 14, 18], wording: byId.get(12).meaning }];
    const view = code => call('room_state($1)', [code]);
    const advance = (code, phase, round) => call('advance_room($1,$2,$3)', [code, phase, round]);
    const pick = (code, round, choice) => call('answer($1,$2,$3)', [code, round, choice]);
    const join = (code, nickname) => call('join_room($1,$2)', [code, nickname]);

    await as(null);
    await assert.rejects(view('ABCDEF12'), /permission denied/);
    await as(0);
    await assert.rejects(db.query('select * from asma_private.favorites'), /permission denied/);
    assert.deepEqual(await call('sync_favorites($1)', [[2, 3, 3, 101]]), [2, 3]);
    assert.equal(await call('favorite($1,$2)', [2, false]), false);
    await assert.rejects(call('create_room($1)', [JSON.stringify([sample[0], sample[0]])]), /invalid_questions/);
    const full = makeQuiz(names, 99, 'hard').map(q => ({ ...q, wording: byId.get(q.id).meaning }));
    assert.match(await call('create_room($1)', [JSON.stringify(full)]), /^[A-F0-9]{8}$/);
    const code = await call('create_room($1)', [JSON.stringify(sample)]);
    await assert.rejects(advance(code, 'lobby', 0), /no_players/);
    await as(1);
    await assert.rejects(call('sync_favorites($1)', [[1]]), /sign_in_required/);
    await assert.rejects(call('create_room($1)', [JSON.stringify(sample)]), /sign_in_required/);
    await assert.rejects(view(code), /room_unavailable/);
    assert.equal(await join(code.toLowerCase(), 'Первый'), true);
    await as(2);
    await assert.rejects(join(code, 'первый'), /nickname_taken/);
    assert.equal(await join(code, 'Второй'), true);
    await as(3);
    assert.deepEqual(await call('sync_favorites($1)', [[]]), []);
    await assert.rejects(advance(code, 'lobby', 0), /room_unavailable/);
    await as(0);
    assert.deepEqual(await call('sync_favorites($1)', [[]]), [3]);
    assert.equal((await view(code)).players.length, 2);
    assert.equal(await advance(code, 'lobby', 0), true);
    assert.equal(await advance(code, 'lobby', 0), false);
    await as(3);
    await assert.rejects(join(code, 'Опоздавший'), /game_started/);
    await as(1);
    assert.equal(await join(code, 'Первый'), true);
    assert.equal((await view(code)).question.id, undefined);
    await assert.rejects(pick(code, 0, 99), /invalid_selection/);
    assert.equal(await pick(code, 0, 2), 2);
    assert.equal(await pick(code, 0, 3), 2);
    await as(2);
    assert.equal(await pick(code, 0, 3), 3);
    await as(0);
    assert.equal((await view(code)).answered, 2);
    assert.equal(await advance(code, 'question', 0), true);
    assert.deepEqual((await view(code)).distribution.options.map(option => option.count), [0, 1, 1, 0]);
    await as(1);
    await assert.rejects(pick(code, 0, 2), /round_closed/);
    await as(0);
    await advance(code, 'reveal', 0);
    const second = await view(code);
    assert.equal(second.prompt, null);
    assert.deepEqual(second.question.wording, byId.get(12).meaning);
    assert.equal(second.question.id, undefined);
    await as(2);
    assert.equal(await pick(code, 1, 12), 12);
    await as(0);
    await advance(code, 'question', 1);
    await advance(code, 'reveal', 1);
    const finished = await view(code);
    assert.equal(finished.phase, 'finished');
    assert.deepEqual(finished.leaderboard.map(player => [player.score, player.place]), [[1, 1], [1, 1]]);
    assert.equal(finished.results.length, 2);
    const rows = await call('export_room($1)', [code]);
    assert.equal(rows.length, 4);
    assert.equal(rows.filter(row => row.choice === null).length, 1);
    await as(2);
    await assert.rejects(call('export_room($1)', [code]), /sign_in_required/);
  } finally { await db.close(); }
});

test('live rooms freeze wording, restore membership, accept revisions and advance with private results', async () => {
  const db = await testDatabase();
  try {
    for (const id of ids) await db.query('insert into auth.users values ($1)', [id]);
    const call = async (who, statement, params = []) => db.transaction(async tx => {
      await tx.exec('set local role authenticated');
      await tx.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify(identities[who])]);
      return (await tx.query(`select public.aq_${statement} as result`, params)).rows[0].result;
    });
    const makeQuestion = (id, options, mode) => ({
      id, mode, options, cards: Object.fromEntries(options.map(option => {
        const name = byId.get(option);
        return [option, [name.ar, name.ru, name.latin, 'Текст комнаты · ' + name.meaning[0], name.meaning[1]]];
      }))
    });
    const questions = [{ ...makeQuestion(2, [6, 2, 3, 5], 'name'), language: 0 }, makeQuestion(12, [12, 13, 14, 18], 'reverse')];
    const create = q => call(0, 'create_room($1)', [JSON.stringify(q)]);
    const full = makeQuiz(names, 99, 'hard').map(q => makeQuestion(q.id, q.options, q.mode));
    assert.match(await create(full.map((q, i) => i ? q : { ...q, language: 1 })), /^[A-F0-9]{8}$/);
    await assert.rejects(create([{ ...questions[0], cards: { 2: ['x'] } }]), /invalid_questions/);
    const code = await create(questions);
    const view = who => call(who, 'room_state($1)', [code]);
    const join = (who, nickname) => call(who, 'join_room($1,$2)', [code, nickname]);
    const pick = (who, round, answer) => call(who, 'answer($1,$2,$3)', [code, round, answer]);
    const moveClock = () => db.query("update asma_private.rooms set deadline_at = clock_timestamp() - interval '1 second' where code = $1", [code]);
    assert.equal(await call(1, 'resume_room()'), null);
    for (const [who, nickname] of [[1, 'Лилия'], [2, 'Жасмин'], [3, 'Кедр']]) await join(who, nickname);
    assert.equal(await call(1, 'resume_room()'), code);
    await call(0, 'advance_room($1,$2,$3)', [code, 'lobby', 0]);
    const initial = await view(0);
    assert.equal(initial.language, 0);
    assert.equal(initial.phase, 'question');
    assert.ok(initial.remainingMs > 0 && initial.remainingMs <= 40000);
    assert.deepEqual(initial.question, (await view(1)).question);
    assert.deepEqual(initial.question.labels[2], questions[0].cards[2].slice(3));
    assert.deepEqual(initial.question.promptName, questions[0].cards[2].slice(0, 3));
    assert.equal(initial.distribution, undefined);
    await pick(1, 0, 3);
    await db.query("update asma_private.rooms set opened_at = clock_timestamp() - interval '5 seconds' where code = $1", [code]);
    await pick(2, 0, 2);
    await db.query("update asma_private.rooms set opened_at = clock_timestamp() - interval '20 seconds' where code = $1", [code]);
    assert.equal(await pick(1, 0, 2), 2);
    assert.equal((await view(1)).pick, 2);
    const saved = (await db.query('select points from asma_private.answers where code = $1 and user_id = $2 and round = 0', [code, ids[1]])).rows[0].points;
    assert.equal(await pick(1, 0, 2), 2);
    assert.equal((await view(2)).answered, 2);
    await pick(3, 0, 5);
    const reveal = await view(1);
    assert.equal(reveal.phase, 'reveal');
    assert.equal(reveal.distribution.id, 2);
    assert.equal(reveal.roundPoints, saved);
    assert.ok((await view(2)).roundPoints > saved && saved >= 1000);
    assert.equal((await view(3)).roundPoints, 0);
    assert.deepEqual(reveal.distribution.options.map(option => option.count), [0, 2, 0, 1]);
    await assert.rejects(pick(1, 0, 5), /round_closed/);
    await moveClock();
    const second = await view(2);
    assert.equal(second.round, 1);
    assert.equal(second.phase, 'question');
    assert.equal(second.prompt, null);
    assert.equal(second.question.id, undefined);
    assert.equal(second.question.cards, undefined);
    assert.deepEqual(second.question.labels[12], questions[1].cards[12].slice(0, 3));
    assert.deepEqual(second.question.wording, questions[1].cards[12].slice(3));
    await pick(1, 1, 18);
    await moveClock();
    await assert.rejects(pick(2, 1, 12), /round_closed/);
    assert.equal((await view(1)).phase, 'reveal');
    await moveClock();
    const final = await view(1);
    assert.equal(final.phase, 'finished');
    assert.deepEqual(final.leaderboard.map(player => [player.nickname, player.place]), [['Жасмин', 1], ['Лилия', 2]]);
    assert.deepEqual(final.personal, { correct: 1, submitted: 2, points: saved, review: [12] });
    assert.deepEqual((await view(3)).personal.review, [2, 12]);
    assert.equal((await view(0)).personal, null);
    const rows = await call(0, 'export_room($1)', [code]);
    assert.equal(rows.length, 6);
    assert.equal(rows.filter(row => row.choice === null).length, 2);
    assert.ok(rows.find(row => row.points === saved && row.name === questions[0].cards[2][1]));
    await assert.rejects(call(1, 'export_room($1)', [code]), /sign_in_required/);
  } finally { await db.close(); }
});

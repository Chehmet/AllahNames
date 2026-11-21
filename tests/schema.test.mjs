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

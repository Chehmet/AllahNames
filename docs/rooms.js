import { byId, names } from './names.js';
import { makeQuiz } from './quiz.js';
import * as cloud from './cloud.js';
import { alternateName, ar, btn, cueDisclosure, displayName, empty, esc, heading, language, nameButton, opt, read, save, stat, t } from './ui.js';

const validCode = value => /^[A-F0-9]{8}$/.test(value || '');
const inviteCode = () => (new URL(location.href).searchParams.get('room') || '').trim().toUpperCase();

export function invitation(page, code) {
  const url = new URL(page);
  url.search = '';
  url.searchParams.set('room', code);
  url.hash = 'room';
  return url.href;
}

const answerText = (id, mode) => mode === 'reverse' ? `${ar(byId.get(id))} ${displayName(byId.get(id))}`
  : esc(byId.get(id).meaning[language]);

function prompt(question, contentId) {
  const name = byId.get(contentId);
  return `<div class="quiz-prompt"><p class="eyebrow">${question.mode === 'reverse'
    ? t('Какое это имя?', 'Which name is it?') : t('Что означает имя?', 'What does the name mean?')}</p>
    ${question.mode === 'reverse' ? `<h2>${esc(question.wording[language])}</h2>` : `${ar(name)}
    ${question.mode === 'name' ? `<h2>${displayName(name)}</h2>${alternateName(name)}` : ''}`}</div>`;
}

function distribution(result, count) {
  const name = byId.get(result.id);
  const replied = result.options.reduce((sum, option) => sum + option.count, 0);
  return `<article class="card stack"><h3>${result.round + 1}. ${nameButton(name)} · ${esc(name.meaning[language])}</h3>
    <p class="secondary-language">${t('Ответили', 'Answered')} · ${replied}/${count}</p>
    <div class="table-wrap"><table><thead><tr>
    <th scope="col">${t('Вариант', 'Choice')}</th><th scope="col">${t('Ответов', 'Responses')}</th><th scope="col">${t('Доля', 'Share')}</th>
    </tr></thead><tbody>
    ${result.options.map(option => `<tr><td>${answerText(option.id, result.mode)} ${option.id === result.id ? `<strong class="tag-correct">· ${t('верно', 'correct')}</strong>` : ''}</td>
      <td>${option.count}</td><td>${replied ? Math.round(100 * option.count / replied) : 0}%</td></tr>`).join('')}
    </tbody></table></div>${cueDisclosure(name)}</article>`;
}

function standings(game) {
  const totalPicks = game.leaderboard.reduce((sum, player) => sum + player.submitted, 0);
  const totalCorrect = game.leaderboard.reduce((sum, player) => sum + player.score, 0);
  return `<div class="stats">${stat(game.players.length, t('Игроков', 'Players'))}
    ${stat(totalPicks, t('Ответов', 'Responses'))}${stat(totalPicks ? Math.round(100 * totalCorrect / totalPicks) + '%' : '—', t('Верных среди полученных', 'Correct among submitted answers'))}</div>
    <div class="card stack"><h2>${t('Таблица лидеров', 'Leaderboard')}</h2>
    <div class="table-wrap"><table><thead><tr><th scope="col">${t('Место', 'Rank')}</th><th scope="col">${t('Игрок', 'Player')}</th>
    <th scope="col">${t('Правильно', 'Correct')}</th><th scope="col">${t('Отвечено', 'Answered')}</th></tr></thead><tbody>
    ${game.leaderboard.map(player => `<tr><td>${player.place}</td><td>${esc(player.nickname)}</td><td>${player.score}/${game.total}</td><td>${player.submitted}</td></tr>`).join('')}
    </tbody></table></div>
    ${game.host ? `<div class="actions"><button type="button" class="button outline" data-room-action="export">${t('Скачать все ответы (CSV)', 'Download all responses (CSV)')}</button></div>` : ''}</div>
    <h2>${t('Статистика по вопросам', 'Results by question')}</h2>${game.results.map(result => distribution(result, game.players.length)).join('')}`;
}

const labels = () => ({
  room_unavailable: t('Комната недоступна. Проверь код и открытую сессию.', 'Room unavailable. Check the code and your session.'),
  game_started: t('Игра уже началась. Для новых игроков комната закрыта.', 'The game has started. New players can no longer join.'),
  nickname_taken: t('Это имя уже занято. Введи другое.', 'That nickname is taken. Choose another one.'),
  invalid_nickname: t('Введи имя длиной от 1 до 24 символов.', 'Enter a nickname of 1 to 24 characters.'),
  no_players: t('Подожди, пока подключится хотя бы один игрок.', 'Wait until at least one player has joined.'),
  round_closed: t('Ведущий уже закрыл этот вопрос.', 'The host has already closed this question.'),
  room_limit: t('Достигнут лимит открытых комнат. Заверши одну из игр.', 'You have reached the open-room limit. Finish one of your games.'),
  room_full: t('В комнате уже 60 игроков.', 'This room already has 60 players.')
});
const message = error => labels()[error.message] || t('Не удалось связаться с сервером. Попробуй ещё раз.', 'Could not reach the server. Please try again.');

export function gameCSV(rows) {
  const cell = value => {
    const text = String(value ?? '');
    const safe = /^[\s\uFEFF]*[=+\-@]/.test(text) ? "'" + text : text;
    return '"' + safe.replace(/"/g, '""') + '"';
  };
  const columns = t(['Игрок', 'Вопрос', 'Имя', 'Ответ', 'Результат'], ['Player', 'Question', 'Name', 'Answer', 'Result']);
  const plainName = (id) => language ? byId.get(id).latin : byId.get(id).ru;
  return '\uFEFF' + [columns, ...rows.map(row => [
    row.nickname, row.round, plainName(row.id), row.choice ? plainName(row.choice) : '',
    row.correct == null ? t('Пропуск', 'Skipped') : row.correct ? t('Верно', 'Correct') : t('Неверно', 'Incorrect')
  ])].map(row => row.map(cell).join(',')).join('\r\n');
}

function exportAnswers(rows, code) {
  const data = new Blob([gameCSV(rows)], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(data);
  const download = document.createElement('a');
  download.download = `asma-${code}.csv`;
  download.href = url;
  document.body.append(download);
  download.click();
  download.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export function createRoom(main, { auth, notify }) {
  let game;
  let active = false;
  let timer;
  let polling = false;
  let working = false;
  let issue = '';
  let draftCode = inviteCode();
  let draftNickname = '';
  let count = 10;
  let difficulty = 'easy';
  let stamp = '';
  let currentCode = '';
  let generation = 0;
  const action = (text, name, style = 'outline', disabled = false) => `<button type="button"
    class="button ${style}" data-room-action="${name}" ${disabled ? 'disabled' : ''}>${text}</button>`;

  function screen() {
    const title = heading(t('Игра по QR-коду', 'Live quiz by QR code'),
      t('Ведущий показывает вопросы, а участники отвечают со своих телефонов.', 'The host shows the questions and players answer on their phones.'));
    if (!cloud.enabled) return title + empty(t('Для общей игры нужно подключить Supabase. Инструкция находится в README проекта.', 'Connect Supabase to enable live games. Setup is in the project README.'));
    const status = `<p class="notice" role="status" ${issue ? '' : 'hidden'}>${esc(issue)}</p>`;
    if (!game) return `<div class="narrow">${title}<div class="stack">
      ${status}<form class="card stack form" id="join-room"><h2>${t('Войти в комнату', 'Join a room')}</h2>
      <label>${t('Код комнаты', 'Room code')}<input name="code" value="${esc(draftCode)}" pattern="[A-Fa-f0-9]{8}" maxlength="8" autocapitalize="characters" spellcheck="false" required></label>
      <label>${t('Имя игрока', 'Nickname')}<input name="nickname" value="${esc(draftNickname)}" maxlength="24" required></label>
      <div class="actions"><button type="submit" class="button primary" ${working ? 'disabled' : ''}>${t('Присоединиться', 'Join')}</button>
      ${cloud.identity() && validCode(draftCode) ? action(t('Вернуться в игру', 'Resume game'), 'resume', 'outline', working) : ''}</div></form>
      <div class="card stack"><h2>${t('Для ведущего', 'For the host')}</h2>${cloud.account() ? `<form class="stack" id="create-room">
        <label>${t('Количество вопросов', 'Question count')}<input name="count" type="number" min="1" max="99" value="${count}" required></label>
        <label>${t('Сложность', 'Difficulty')}<select name="difficulty">
        ${opt('easy', t('Лёгкая', 'Easy'), difficulty)}${opt('medium', t('Средняя', 'Medium'), difficulty)}${opt('hard', t('Сложная', 'Hard'), difficulty)}</select></label>
        <div class="actions"><button type="submit" class="button primary" ${working ? 'disabled' : ''}>${t('Создать комнату', 'Create room')}</button></div></form>`
        : `<div class="actions">${btn(t('Войти по почте', 'Sign in by email'), 'auth', 'outline')}</div>`}</div></div></div>`;
    const code = `<p class="countline">${t('Комната', 'Room')} · ${game.code} ${action(t('Покинуть экран игры', 'Leave game screen'), 'leave', 'outline small')}</p>`;
    if (game.phase === 'lobby') return `<div class="narrow">${title}<div class="card stack">${code}${status}
      <div class="room-lobby"><div class="stack"><div><p>${t('Код для входа', 'Join code')}</p><p class="room-code">${game.code}</p></div>
      <div class="actions">${action(t('Копировать ссылку', 'Copy link'), 'copy', 'outline small')}</div>
      <label>${t('Ссылка для входа', 'Join link')}<input readonly aria-label="${t('Ссылка для входа', 'Join link')}" value="${esc(invitation(location.href, game.code))}"></label></div>
      <div class="qr"><canvas id="room-qr" role="img" aria-label="${t('QR-код для входа', 'Join QR code')}"></canvas></div></div>
      <h2>${t('Игроки', 'Players')} · ${game.players.length}</h2>
      ${game.players.length ? `<ul class="players">${game.players.map(player => `<li>${esc(player)}</li>`).join('')}</ul>`
        : `<p class="subtitle">${t('Ждём подключения.', 'Waiting for players.')}</p>`}
      ${game.host ? `<div class="actions">${action(t('Начать игру', 'Start game'), 'advance', 'primary', working || !game.players.length)}</div>`
        : `<p class="note">${t('Ведущий скоро запустит игру.', 'The host will start the game.')}</p>`}
      </div></div>`;
    if (game.phase === 'finished') return `<div class="narrow">${heading(t('Результаты игры', 'Game results'))}
      <div class="stack">${code}${status}${standings(game)}</div></div>`;
    const countline = `<p class="countline">${t('Вопрос', 'Question')} ${game.round + 1}/${game.total}
      <span>${t('Ответили', 'Answered')} · ${game.answered}/${game.players.length}</span></p>`;
    if (game.phase === 'reveal') return `<div class="narrow">${heading(t('Разбор вопроса', 'Question review'))}<div class="stack">${code}${status}${countline}
      ${!game.host ? `<p class="note">${game.pick === game.distribution.id ? t('Твой ответ верный.', 'Your answer is correct.')
        : game.pick ? t('Твой ответ неверный.', 'Your answer is incorrect.') : t('Ответ пропущен.', 'Question skipped.')}</p>` : ''}
      ${distribution(game.distribution, game.players.length)}
      ${game.host ? `<div class="actions">${action(game.round + 1 >= game.total ? t('Показать итоги', 'Show results') : t('Следующий вопрос', 'Next question'), 'advance', 'primary', working)}</div>` : ''}
      </div></div>`;
    return `<div class="narrow">${heading(t('Общий квиз', 'Live quiz'))}<div class="card stack">${code}${status}${countline}
      ${prompt(game.question, game.prompt)}<div class="answer-grid">${game.question.options.map(id =>
        `<button class="answer ${game.pick === id ? 'selected' : ''}" type="button" data-room-answer="${id}"
        ${working || game.host || game.pick ? 'disabled' : ''}>${answerText(id, game.question.mode)}</button>`).join('')}</div>
      ${game.pick ? `<p class="note" role="status">${t('Ответ принят. Ждём разбора.', 'Answer recorded. Waiting for the reveal.')}</p>` : ''}
      ${game.host ? `<div class="actions">${action(t('Закрыть вопрос и показать ответ', 'Close question and reveal answer'), 'advance', 'primary', working)}</div>` : ''}
      </div></div>`;
  }

  function render() {
    if (!active) return;
    const markup = screen();
    if (stamp === markup && main.querySelector('h1')) return;
    const focus = document.activeElement;
    const focusedAction = main.contains(focus) && focus.dataset.roomAction;
    stamp = markup;
    main.innerHTML = markup;
    if (focusedAction) main.querySelector(`[data-room-action="${focusedAction}"]`)?.focus({ preventScroll: true });
    const canvas = main.querySelector('#room-qr');
    if (canvas) import('./qr.js').then(({ drawQR }) => {
      if (canvas.isConnected && game) drawQR(canvas, invitation(location.href, game.code));
    }).catch(() => {});
  }

  function clearPoll() {
    clearTimeout(timer);
  }

  function schedulePoll() {
    clearPoll();
    if (active && currentCode && !working && game?.phase !== 'finished') {
      timer = setTimeout(refresh, document.hidden ? 7000 : 1600);
    }
  }

  async function refresh() {
    if (!active || !currentCode || working || polling) return;
    const version = generation;
    polling = true;
    try {
      const state = await cloud.rpc('room_state', { p_code: currentCode });
      if (version !== generation || working) return;
      game = state;
      issue = '';
      render();
    } catch (error) {
      if (version !== generation || working) return;
      issue = message(error);
      if (error.message === 'room_unavailable' || error.message === 'Sign in required') reset(false);
      render();
    } finally {
      polling = false;
      schedulePoll();
    }
  }

  async function open(code) {
    const version = generation;
    const state = await cloud.rpc('room_state', { p_code: code });
    if (version !== generation) return;
    game = state;
    currentCode = code;
    const url = invitation(location.href, code);
    if (active) history.replaceState(null, '', url);
    save('room.' + cloud.identity(), code);
  }

  async function operate(task) {
    if (working || !active) return;
    working = true;
    generation += 1;
    issue = '';
    clearPoll();
    render();
    try { await task(); }
    catch (error) { issue = message(error); }
    finally {
      working = false;
      render();
      schedulePoll();
    }
  }

  function reset(clearUrl = true) {
    generation += 1;
    clearPoll();
    currentCode = '';
    game = undefined;
    if (clearUrl && active) {
      const url = new URL(location.href);
      url.searchParams.delete('room');
      history.replaceState(null, '', url);
      draftCode = '';
      issue = '';
    }
  }

  main.addEventListener('input', event => {
    if (!active) return;
    const { name, value } = event.target;
    if (name === 'nickname') draftNickname = value;
    if (name === 'code') draftCode = value.toUpperCase();
    if (name === 'count' && /^\d+$/.test(value)) count = Math.max(1, Math.min(99, Number(value)));
    if (name === 'difficulty') difficulty = value;
  });

  main.addEventListener('submit', event => {
    if (!active || !['join-room', 'create-room'].includes(event.target.id)) return;
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.target));
    if (event.target.id === 'join-room') {
      draftCode = data.code.trim().toUpperCase();
      draftNickname = data.nickname;
      operate(async () => {
        await cloud.guest();
        await cloud.rpc('join_room', { p_code: draftCode, p_nickname: draftNickname });
        await open(draftCode);
      });
    } else if (cloud.account()) {
      operate(async () => {
        const questions = makeQuiz(names, data.count, data.difficulty).map(question => ({
          id: question.id, mode: question.mode, options: question.options,
          ...(question.mode === 'reverse' && { wording: byId.get(question.id).meaning })
        }));
        const code = await cloud.rpc('create_room', { p_questions: questions });
        await open(code);
      });
    } else auth();
  });

  main.addEventListener('click', event => {
    if (!active) return;
    const button = event.target.closest('button');
    if (!button) return;
    if (button.dataset.roomAnswer && game && !game.host && !game.pick) {
      const round = game.round;
      return operate(async () => {
        const choice = await cloud.rpc('answer', { p_code: game.code, p_round: round, p_choice: Number(button.dataset.roomAnswer) });
        game = { ...game, pick: choice };
      });
    }
    switch (button.dataset.roomAction) {
      case 'resume':
        if (validCode(draftCode)) operate(() => open(draftCode));
        break;
      case 'copy':
        if (game) Promise.resolve().then(() => navigator.clipboard.writeText(invitation(location.href, game.code)))
          .then(() => notify(t('Ссылка скопирована', 'Link copied')))
          .catch(() => {
            const input = main.querySelector('input[readonly]');
            input?.select();
            notify(t('Выделили ссылку для ручного копирования.', 'Link selected for manual copying.'));
          });
        break;
      case 'advance':
        if (game?.host) operate(async () => {
          await cloud.rpc('advance_room', { p_code: game.code, p_phase: game.phase, p_round: game.round });
          await open(game.code);
        });
        break;
      case 'export':
        if (game?.host) operate(async () => exportAnswers(await cloud.rpc('export_room', { p_code: game.code }), game.code));
        break;
      case 'leave':
        if (working) break;
        reset();
        render();
        break;
    }
  });

  return {
    render,
    enter() {
      if (active) return;
      active = true;
      if (!cloud.enabled) return render();
      if (validCode(inviteCode())) draftCode = inviteCode();
      if (!game && cloud.identity()) {
        const resume = validCode(draftCode) ? draftCode : read('room.' + cloud.identity(), '');
        if (validCode(resume)) {
          draftCode = resume;
          operate(async () => {
            try { await open(resume); }
            catch (error) { if (error.message !== 'room_unavailable') throw error; }
          });
          return;
        }
      }
      render();
      schedulePoll();
    },
    leave() { active = false; stamp = ''; clearPoll(); },
    reset() { reset(false); }
  };
}

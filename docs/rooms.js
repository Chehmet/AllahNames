import { byId, names } from './names.js';
import { makeQuiz } from './quiz.js';
import * as cloud from './cloud.js';
import { ar, btn, cueDisclosure, empty, esc, heading, language, nameButton, opt, read, save, stat, t } from './ui.js';

const validCode = value => /^[A-F0-9]{8}$/.test(value || '');
const inviteCode = () => (new URL(location.href).searchParams.get('room') || '').trim().toUpperCase();

export function invitation(page, code) {
  const url = new URL(page);
  url.search = '';
  url.searchParams.set('room', code);
  url.hash = 'room';
  return url.href;
}

const catalogueCard = id => {
  const name = byId.get(id);
  return [name.ar, name.ru, name.latin, ...name.meaning];
};
const nameText = (card, locale) => esc(card[1 + locale]);
const bothNames = (card, locale) => `${nameText(card, locale)} <small lang="${locale ? 'ru' : 'en'}">${nameText(card, 1 - locale)}</small>`;
const answerText = (label, mode, locale) => mode === 'reverse' ? `${ar({ ar: label[0] })}${bothNames(label, locale)}` : esc(label[locale]);
const optionLabel = (id, question) => question.labels?.[id] || roomLabel(question.cards?.[id] || catalogueCard(id), question.mode);
const roomLabel = (card, mode) => mode === 'reverse' ? card.slice(0, 3) : card.slice(3);

function prompt(question, contentId, locale) {
  const card = question.mode === 'reverse' ? null : question.promptName || catalogueCard(contentId);
  return `<div class="quiz-prompt"><p class="eyebrow">${question.mode === 'reverse'
    ? t('Какое это имя?', 'Which name is it?') : t('Что означает имя?', 'What does the name mean?')}</p>
    ${question.mode === 'reverse' ? `<h2>${esc(question.wording[locale])}</h2>` : `${ar({ ar: card[0] })}
    ${question.mode === 'name' ? `<h2>${bothNames(card, locale)}</h2>` : ''}`}</div>`;
}

const percentage = (value, total) => total ? Math.round(value * 100 / total) + '%' : '0%';
const pointsText = points => {
  const quantity = new Intl.NumberFormat(t('ru', 'en')).format(points);
  if (language) return quantity + (points === 1 ? ' point' : ' points');
  const unit = { one: 'балл', few: 'балла', many: 'баллов' }[new Intl.PluralRules('ru').select(points)];
  return `${quantity} ${unit}`;
};

function distribution(result, count, locale, open = false) {
  const name = byId.get(result.id);
  const replied = result.options.reduce((sum, option) => sum + option.count, 0);
  const correct = result.options.find(option => option.id === result.id).count;
  const wrong = replied - correct;
  const missed = count - replied;
  const card = result.cards?.[result.id] || catalogueCard(result.id);
  return `<article class="card stack"><h3>${result.round + 1}. ${nameButton(name, nameText(card, locale))} · ${esc(card[3 + locale])}</h3>
    <div class="answer-percentages" aria-label="${t('Доля от всех игроков', 'Share of all players')}">
    <span class="correct-share"><strong>${percentage(correct, count)}</strong> ${t('верно', 'correct')} <small>(${correct}/${count})</small></span>
    <span class="wrong-share"><strong>${percentage(wrong, count)}</strong> ${t('неверно', 'incorrect')} <small>(${wrong}/${count})</small></span>
    <span><strong>${percentage(missed, count)}</strong> ${t('пропустили', 'skipped')} <small>(${missed}/${count})</small></span></div>
    <details ${open ? 'open' : ''}><summary>${t('Ответы по вариантам', 'Answers by choice')}</summary><div class="table-wrap"><table><thead><tr>
    <th scope="col">${t('Вариант', 'Choice')}</th><th scope="col">${t('Ответов', 'Responses')}</th><th scope="col">${t('Доля', 'Share')}</th>
    </tr></thead><tbody>
    ${result.options.map(option => `<tr><td>${answerText(optionLabel(option.id, result), result.mode, locale)} ${option.id === result.id ? `<strong class="tag-correct">· ${t('верно', 'correct')}</strong>` : ''}</td>
      <td>${option.count}</td><td>${percentage(option.count, count)}</td></tr>`).join('')}
    </tbody></table></div></details>${cueDisclosure(name)}</article>`;
}

function standings(game) {
  const locale = game.language ?? language;
  const correct = game.results.reduce((total, result) => total + result.options.find(option => option.id === result.id).count, 0);
  const podium = [1, 2, 3].map(place => {
    const winners = game.leaderboard.filter(player => player.place === place && player.score > 0);
    return winners.length ? `<li class="podium-place place-${place}"><strong>${place}</strong>
      <ul>${winners.map(player => `<li>${esc(player.nickname)}</li>`).join('')}</ul>
      <small>${pointsText(winners[0].score)}</small></li>` : '';
  }).join('');
  const stats = game.personal;
  const measurements = stats && `<section class="card stack"><h2>${t('Твой результат', 'Your results')}</h2>
    <div class="stats">${stat(`${stats.correct}/${game.total}`, t('Верных ответов', 'Correct answers'))}
    ${stat(stats.submitted, t('Отвечено', 'Answered'))}${stat(stats.points, t('Баллы', 'Points'))}</div>
    ${stats.review.length ? `<details><summary>${t('Что повторить', 'Names to review')}</summary><ul class="review-names">
      ${stats.review.map(id => `<li>${nameButton(byId.get(id))}</li>`).join('')}</ul></details>`
    : `<p>${t('Все ответы верны. Попробуй вспомнить имена без вариантов ответа.', 'All answers were correct. Try recalling the names without the options.')}</p>`}</section>`;
  return `${measurements}${podium ? `<section class="card stack"><h2>${t('Пьедестал', 'Podium')}</h2>
    <ol class="podium">${podium}</ol></section>` : ''}
    <div class="stats">${stat(game.players.length, t('Игроков', 'Players'))}
    ${stat(percentage(correct, game.total * game.players.length), t('Верных ответов у группы', 'Correct answers across the group'))}</div>
    ${game.host ? `<div class="actions"><button type="button" class="button outline" data-room-action="export">${t('Скачать все ответы (CSV)', 'Download all responses (CSV)')}</button></div>` : ''}
    <h2>${t('Статистика по вопросам', 'Results by question')}</h2>${game.results.map(result => distribution(result, game.players.length, locale)).join('')}`;
}

const labels = () => ({
  room_unavailable: t('Комната недоступна. Проверь код и открытую сессию.', 'Room unavailable. Check the code and your session.'),
  game_started: t('Игра уже началась. Для новых игроков комната закрыта.', 'The game has started. New players can no longer join.'),
  nickname_taken: t('Это имя уже занято. Введи другое.', 'That nickname is taken. Choose another one.'),
  invalid_nickname: t('Введи имя длиной от 1 до 24 символов.', 'Enter a nickname of 1 to 24 characters.'),
  no_players: t('Подожди, пока подключится хотя бы один игрок.', 'Wait until at least one player has joined.'),
  round_closed: t('Это окно ответов уже закрылось.', 'The answer window has closed.'),
  room_limit: t('Достигнут лимит открытых комнат. Заверши одну из игр.', 'You have reached the open-room limit. Finish one of your games.'),
  room_full: t('В комнате уже 60 игроков.', 'This room already has 60 players.')
});
export function roomErrorMessage(error) {
  if (error.code === 'PGRST202') return t('Для новой игры обнови схему Supabase по инструкции в README.', 'Apply the Supabase schema update from the README to start a new game.');
  if (error.code === 'anonymous_provider_disabled') {
    return t('Гостевой вход выключен. Включите Allow anonymous sign-ins в настройках Supabase проекта.',
      'Guest sign-in is disabled. Enable Allow anonymous sign-ins in the project’s Supabase settings.');
  }
  return labels()[error.message] || t('Не удалось связаться с сервером. Попробуй ещё раз.', 'Could not reach the server. Please try again.');
}

export function gameCSV(rows) {
  const cell = value => {
    const text = String(value ?? '');
    const safe = /^[\s\uFEFF]*[=+\-@]/.test(text) ? "'" + text : text;
    return '"' + safe.replace(/"/g, '""') + '"';
  };
  const hasScores = rows.some(row => row.points != null);
  const columns = t(['Игрок', 'Вопрос', 'Имя', 'Ответ', 'Результат'], ['Player', 'Question', 'Name', 'Answer', 'Result']);
  if (hasScores) columns.push(...t(['Баллы', 'Время (мс)'], ['Points', 'Time (ms)']));
  const plainName = (id) => language ? byId.get(id).latin : byId.get(id).ru;
  return '\uFEFF' + [columns, ...rows.map(row => [
    row.nickname, row.round, row.name || plainName(row.id), row.choice ? row.selectedName || plainName(row.choice) : '',
    row.correct == null ? t('Пропуск', 'Skipped') : row.correct ? t('Верно', 'Correct') : t('Неверно', 'Incorrect'),
    ...(hasScores ? [row.points, row.elapsedMs] : [])
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

export function createRoom(main, { auth, notify, onPhaseChange }) {
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
  let phase = '';
  let countdown;
  let endTime;
  const inRound = () => active && ['question', 'reveal'].includes(game?.phase);
  const rememberedCode = () => cloud.identity() && read('room.' + cloud.identity(), '');
  const secondsLeft = () => Math.max(0, Math.ceil((endTime - performance.now()) / 1000));
  const action = (text, name, style = 'outline', disabled = false) => `<button type="button"
    class="button ${style}" data-room-action="${name}" ${disabled ? 'disabled' : ''}>${text}</button>`;

  function screen() {
    const title = heading(t('Игра по QR-коду', 'Live quiz by QR code'),
      t('Ведущий показывает вопросы, а участники отвечают со своих телефонов.', 'The host shows the questions and players answer on their phones.'));
    if (!cloud.enabled) return title + empty(t('Для общей игры нужно подключить Supabase. Инструкция находится в README проекта.', 'Connect Supabase to enable live games. Setup is in the project README.'));
    const status = `<p class="notice" role="status" ${issue ? '' : 'hidden'}>${esc(issue)}</p>`;
    const previous = rememberedCode();
    if (!game) return `<div class="narrow">${title}<div class="stack">
      ${status}${validCode(previous) ? `<section class="card stack"><h2>${t('Последняя комната', 'Last room')} · ${esc(previous)}</h2>
      <div class="actions">${action(t('Вернуться в игру', 'Resume game'), 'resume-last', 'primary', working)}</div></section>` : ''}
      <form class="card stack form" id="join-room"><h2>${t('Войти в комнату', 'Join a room')}</h2>
      <label>${t('Код комнаты', 'Room code')}<input name="code" value="${esc(draftCode)}" pattern="[A-Fa-f0-9]{8}" maxlength="8" autocapitalize="characters" spellcheck="false" required></label>
      <label>${t('Имя игрока', 'Nickname')}<input name="nickname" value="${esc(draftNickname)}" maxlength="24" required></label>
      <div class="actions"><button type="submit" class="button primary" ${working ? 'disabled' : ''}>${t('Присоединиться', 'Join')}</button>
      ${cloud.identity() && validCode(draftCode) && draftCode !== previous ? action(t('Вернуться по коду', 'Resume by code'), 'resume', 'outline', working) : ''}</div></form>
      <div class="card stack"><h2>${t('Для ведущего', 'For the host')}</h2>${cloud.account() ? `<form class="stack" id="create-room">
        <label>${t('Количество вопросов', 'Question count')}<input name="count" type="number" min="1" max="99" value="${count}" required></label>
        <label>${t('Сложность', 'Difficulty')}<select name="difficulty">
        ${opt('easy', t('Лёгкая', 'Easy'), difficulty)}${opt('medium', t('Средняя', 'Medium'), difficulty)}${opt('hard', t('Сложная', 'Hard'), difficulty)}</select></label>
        <div class="actions"><button type="submit" class="button primary" ${working ? 'disabled' : ''}>${t('Создать комнату', 'Create room')}</button></div></form>`
        : `<div class="actions">${btn(t('Войти по почте', 'Sign in by email'), 'auth', 'outline')}</div>`}</div></div></div>`;
    const code = `<p class="countline">${t('Комната', 'Room')} · ${game.code} ${action(t('Выйти из игры', 'Leave game'), 'leave', 'outline small', working)}</p>`;
    const locale = game.language ?? language;
    if (game.phase === 'lobby') return `<div class="narrow">${title}<div class="card stack">${code}${status}
      <div class="room-lobby"><div class="stack"><div><p>${t('Код для входа', 'Join code')}</p><p class="room-code">${game.code}</p></div>
      <div class="actions">${action(t('Копировать ссылку', 'Copy link'), 'copy', 'outline small')}</div>
      <label>${t('Ссылка для входа', 'Join link')}<input readonly aria-label="${t('Ссылка для входа', 'Join link')}" value="${esc(invitation(location.href, game.code))}"></label></div>
      <div class="qr"><canvas id="room-qr" role="img" aria-label="${t('QR-код для входа', 'Join QR code')}"></canvas></div></div>
      <h2>${t('Игроки', 'Players')} · ${game.players.length}</h2>
      ${game.players.length ? `<ul class="players">${game.players.map(player => `<li>${esc(player)}</li>`).join('')}</ul>`
        : `<p class="subtitle">${t('Ждём подключения.', 'Waiting for players.')}</p>`}
      ${game.language != null ? `<p class="secondary-language">${t('За верный ответ — 1000 баллов и до 250 за скорость. Можно менять ответ, пока вопрос открыт.',
        'A correct answer earns 1,000 points plus up to 250 for speed. You can change your answer while the question is open.')}</p>` : ''}
      ${game.host ? `<div class="actions">${action(t('Начать игру', 'Start game'), 'advance', 'primary', working || !game.players.length)}</div>`
        : `<p class="note">${t('Ведущий скоро запустит игру.', 'The host will start the game.')}</p>`}
      </div></div>`;
    if (game.phase === 'finished') return `<div class="narrow">${heading(t('Результаты игры', 'Game results'))}
      <div class="stack">${code}${status}${standings(game)}</div></div>`;
    const countline = `<p class="countline">${t('Вопрос', 'Question')} ${game.round + 1}/${game.total}
      <span>${t('Ответили', 'Answered')} · ${game.answered}/${game.players.length}</span>
      ${game.deadline ? `<span class="round-clock" data-countdown aria-label="${t('Осталось секунд', 'Seconds left')}" role="timer"></span>` : ''}</p>`;
    if (game.phase === 'reveal') return `<div class="narrow">${heading(t('Правильный ответ', 'Correct answer'))}<div class="stack">${code}${status}${countline}
      ${!game.host ? `<p class="note">${game.pick === game.distribution.id ? t('Твой ответ верный.', 'Your answer is correct.')
        : game.pick ? t('Твой ответ неверный.', 'Your answer is incorrect.') : t('Ответ пропущен.', 'Question skipped.')}
        ${game.language != null && game.roundPoints > 0 ? `<strong>+${pointsText(game.roundPoints)}</strong>` : ''}</p>` : ''}
      ${distribution(game.distribution, game.players.length, locale)}
      ${game.host && game.language == null ? `<div class="actions">${action(game.round + 1 >= game.total ? t('Показать итоги', 'Show results') : t('Следующий вопрос', 'Next question'), 'advance', 'primary', working)}</div>` : ''}
      </div></div>`;
    return `<div class="narrow">${heading(t('Общий квиз', 'Live quiz'))}<div class="card stack">${code}${status}${countline}
      ${prompt(game.question, game.prompt, locale)}<div class="answer-grid">${game.question.options.map(id => {
        const text = answerText(optionLabel(id, game.question), game.question.mode, locale);
        return game.host ? `<div class="answer">${text}</div>` : `<button class="answer ${game.pick === id ? 'selected' : ''}" type="button" data-room-answer="${id}"
        aria-pressed="${game.pick === id}" ${working || (game.language == null && game.pick) ? 'disabled' : ''}>${text}</button>`;
      }).join('')}</div>
      ${game.question.hint?.[locale] ? `<details data-room-hint><summary>${t('Подсказка из источника', 'Source context hint')}</summary>
      <p>${esc(game.question.hint[locale])}</p></details>` : ''}
      ${game.pick ? `<p class="note" role="status">${game.language == null
        ? t('Ответ принят. Ждём разбора.', 'Answer recorded. Waiting for the reveal.')
        : t('Ответ принят. Чтобы изменить его, выбери другой вариант.', 'Answer recorded. Select another option to change it.')}</p>` : ''}
      ${game.host ? `<div class="actions">${action(t('Закрыть вопрос и показать ответ', 'Close question and reveal answer'), 'advance', 'primary', working)}</div>` : ''}
      </div></div>`;
  }

  function render() {
    if (!active) return;
    const currentPhase = game ? `${game.phase}:${game.round}` : '';
    const phaseChanged = currentPhase !== phase;
    if (phaseChanged) {
      phase = currentPhase;
      onPhaseChange();
    }
    const markup = screen();
    if (stamp === markup && main.querySelector('h1')) return;
    const focus = document.activeElement;
    const focusedAction = main.contains(focus) && focus.dataset.roomAction;
    const focusedAnswer = main.contains(focus) && focus.dataset.roomAnswer;
    const hintWasOpen = !phaseChanged && main.querySelector('[data-room-hint]')?.open;
    stamp = markup;
    main.innerHTML = markup;
    if (hintWasOpen) main.querySelector('[data-room-hint]').open = true;
    if (phaseChanged && inRound() && !document.hidden) {
      const title = main.querySelector('h1');
      title.tabIndex = -1;
      title.focus();
    } else {
      if (focusedAction) main.querySelector(`[data-room-action="${focusedAction}"]`)?.focus({ preventScroll: true });
      if (focusedAnswer) main.querySelector(`[data-room-answer="${focusedAnswer}"]`)?.focus({ preventScroll: true });
    }
    paintCountdown();
    const canvas = main.querySelector('#room-qr');
    if (canvas) import('./qr.js').then(({ drawQR }) => {
      if (canvas.isConnected && game) drawQR(canvas, invitation(location.href, game.code));
    }).catch(() => {});
  }

  function clearPoll() {
    clearTimeout(timer);
  }

  function paintCountdown() {
    clearTimeout(countdown);
    const target = main.querySelector('[data-countdown]');
    if (!active || !target || endTime == null) return;
    const seconds = secondsLeft();
    target.textContent = t(`${seconds} с`, `${seconds}s`);
    if (seconds) countdown = setTimeout(paintCountdown, 250);
  }

  function applyState(state) {
    game = state;
    endTime = state.remainingMs == null ? undefined : performance.now() + state.remainingMs;
    paintCountdown();
  }

  function schedulePoll() {
    clearPoll();
    if (active && currentCode && !working && game?.phase !== 'finished') {
      timer = setTimeout(refresh, document.hidden ? 5000 : inRound() ? 1000 : 1800);
    }
  }

  async function refresh() {
    if (!active || !currentCode || working || polling) return;
    const version = generation;
    polling = true;
    try {
      const state = await cloud.rpc('room_state', { p_code: currentCode });
      if (version !== generation || working) return;
      applyState(state);
      issue = '';
      render();
    } catch (error) {
      if (version !== generation || working) return;
      issue = roomErrorMessage(error);
      if (error.message === 'room_unavailable' || error.message === 'Sign in required') {
        if (error.message === 'room_unavailable' && rememberedCode() === currentCode) save('room.' + cloud.identity(), null);
        reset(false);
      }
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
    applyState(state);
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
    catch (error) { issue = roomErrorMessage(error); }
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
        await cloud.rpc('resume_room');
        const { studyDetails } = await import('./name-details.js');
        const questions = makeQuiz(names, data.count, data.difficulty).map((question, index) => ({
          id: question.id, mode: question.mode, options: question.options,
          ...(index === 0 && { language }),
          hint: studyDetails[question.id].clue,
          cards: Object.fromEntries(question.options.map(id => [id, catalogueCard(id)])),
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
    if (button.dataset.roomAnswer && game?.phase === 'question' && !game.host) {
      const round = game.round;
      const code = game.code;
      const focus = button.dataset.roomAnswer;
      if (game.pick === Number(focus)) return;
      return operate(async () => {
        try {
          await cloud.rpc('answer', { p_code: code, p_round: round, p_choice: Number(focus) });
        } catch (error) {
          if (error.message !== 'round_closed') throw error;
        }
        await open(code);
      }).then(() => {
        if (game?.phase === 'question' && game.round === round) main.querySelector(`[data-room-answer="${focus}"]`)?.focus({ preventScroll: true });
      });
    }
    switch (button.dataset.roomAction) {
      case 'resume':
        if (validCode(draftCode)) operate(() => open(draftCode));
        break;
      case 'resume-last':
        if (validCode(rememberedCode())) operate(() => open(rememberedCode()));
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

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && active && currentCode) refresh();
  });

  return {
    render,
    inRound,
    enter() {
      if (active) return;
      active = true;
      if (!cloud.enabled) return render();
      if (validCode(inviteCode())) draftCode = inviteCode();
      if (!game && cloud.identity()) {
        operate(async () => {
          const resume = validCode(draftCode) ? draftCode : rememberedCode();
          if (validCode(resume)) {
            try { await open(resume); return; }
            catch (error) {
              if (error.message !== 'room_unavailable') throw error;
              if (resume === rememberedCode()) save('room.' + cloud.identity(), null);
              if (resume === inviteCode()) return;
            }
          }
          try {
            const latest = await cloud.rpc('resume_room', {});
            if (validCode(latest) && latest !== resume) await open(latest);
          } catch (error) {
            if (!['room_unavailable', 'PGRST202'].includes(error.code || error.message)) throw error;
          }
        });
        return;
      }
      render();
      schedulePoll();
    },
    leave() { active = false; phase = ''; stamp = ''; clearPoll(); clearTimeout(countdown); },
    reset() { reset(false); }
  };
}

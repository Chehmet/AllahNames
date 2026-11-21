import { names, byId, groups, related, sourceLink } from './names.js';
import { due, makeQuiz, nameFragment, schedule, shuffle } from './quiz.js';
import { verseExcerpt } from './verses.js';
import * as cloud from './cloud.js';
import {
  alternateName, ar, btn, cueDisclosure, displayName, empty, esc, heading, language, nameButton,
  opt, read, save, secondary, setLanguage, stat, t
} from './ui.js';

const main = document.querySelector('#main');
const topbar = document.querySelector('#topbar');
const footer = document.querySelector('#footer');
const dialog = document.querySelector('#dialog');
const dialogBody = document.querySelector('#dialog-body');
const toast = document.querySelector('#toast');
const systemTheme = matchMedia('(prefers-color-scheme: dark)');
let chosenTheme = read('theme', null);
let toastTimer;
let detail;
let email = '';
let roomView;
let favoriteQueue = Promise.resolve();
const favoriteChanges = new Map();
let route;
let group = 'mercy';
let search = '';
let catalogGroup = '';
let settings = read('settings', {});
let practice = read('practice', {});
let history = read('history', { completed: 0, correct: 0, total: 0 });
let quiz;
let flash;

const routes = ['home', 'quiz', 'cards', 'groups', 'catalog', 'favorites', 'room'];
const labels = () => [
  t('Главная', 'Home'), t('Квиз', 'Quiz'), t('Карточки', 'Flashcards'),
  t('Группы', 'Groups'), t('Имена', 'Names'), t('Избранное', 'Favorites'), t('Игра', 'Live game')
];
const label = page => labels()[routes.indexOf(page)];
const url = page => `#${page}`;
const link = (page, text, classes = '') => `<a class="${classes}" href="${url(page)}">${text}</a>`;
const favoritesKey = () => cloud.account() ? `favorites.${cloud.account().id}` : 'favorites';
const favorites = () => new Set(read(favoritesKey(), []));

function notify(message) {
  toast.textContent = message;
  toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.hidden = true; }, 3500);
}

const isDark = () => chosenTheme ? chosenTheme === 'dark' : systemTheme.matches;
function applyTheme() {
  const dark = isDark();
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  document.querySelector('meta[name="theme-color"]').content =
    getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();
  const button = topbar.querySelector('[data-action="theme"]');
  if (button) {
    const label = dark ? t('Включить светлую тему', 'Switch to light mode') : t('Включить тёмную тему', 'Switch to dark mode');
    button.textContent = dark ? '☀' : '☾';
    button.setAttribute('aria-label', label);
    button.title = label;
  }
}
systemTheme.addEventListener('change', () => { if (!chosenTheme) applyTheme(); });

function favoriteButton(name, compact = false) {
  const active = favorites().has(name.id);
  const text = active ? t('Убрать из избранного', 'Remove from favorites') : t('В избранное', 'Add to favorites');
  const icon = active ? '♥' : '♡';
  return compact
    ? `<button type="button" class="heart" data-favorite="${name.id}" aria-label="${text}" title="${text}" aria-pressed="${active}">${icon}</button>`
    : `<button type="button" class="button outline small" data-favorite="${name.id}" aria-pressed="${active}"><span aria-hidden="true">${icon}</span>${text}</button>`;
}

function tile(name) {
  return `<article class="name-tile">
    <button type="button" data-name="${name.id}">${ar(name)}<strong>${displayName(name)}</strong>
    ${alternateName(name)}<span>${esc(name.meaning[language])}</span></button>
    ${favoriteButton(name, true)}</article>`;
}

function groupTile(id, navigation = false) {
  const count = names.filter(name => name.group === id).length;
  return `<button type="button" class="group-tile" data-group="${id}" ${navigation ? '' : `aria-pressed="${id === group}"`}>
    <strong>${esc(groups[id][language])}</strong><small>${count} · ${esc(groups[id][1 - language])}</small>
  </button>`;
}

function renderChrome() {
  topbar.innerHTML = `<a class="brand" href="#home"><span class="seal" aria-hidden="true">✧</span>${t('Асма', 'Asma')}</a>
    <nav class="nav" aria-label="${t('Разделы', 'Sections')}">${routes.slice(1).map(page =>
      `<a href="${url(page)}" ${page === route ? 'aria-current="page"' : ''}>${label(page)}</a>`).join('')}</nav>
    <div class="tools"><button type="button" class="locale theme-toggle" data-action="theme"></button>
    <button type="button" class="locale" data-action="language" aria-label="${t('Switch to English', 'Переключить на русский')}">${t('EN', 'RU')}</button>
    ${btn(cloud.account() ? t('Профиль', 'Account') : t('Войти', 'Sign in'), 'auth', 'outline small')}</div>`;
  footer.innerHTML = `<span>${t('Асма · Имена Аллаха', 'Asma · Names of Allah')}</span>${btn(t('Источники и перевод', 'Sources and translation'), 'sources', 'outline small')}`;
  document.title = t('Асма — имена Аллаха', 'Asma — Names of Allah');
  document.querySelector('.skip').textContent = t('К содержанию', 'Skip to content');
  applyTheme();
}

function home() {
  const name = byId.get(2);
  const modes = [
    ['quiz', '◈', t('Случайные вопросы, три уровня и подсказки.', 'Random questions, three levels and hints.')],
    ['cards', '▤', t('Читай значения и переворачивай карточки для разбора.', 'Read the meanings and flip cards for explanations.')],
    ['groups', '✧', t('Сравни близкие имена и их оттенки.', 'Compare related names and their nuances.')],
    ['room', '◎', t('Войди с телефона по QR и играй вместе.', 'Join from your phone by QR and play together.')]
  ];
  return `<section class="hero"><div class="hero-copy">
    <p class="eyebrow">${t('Асма уль-хусна', 'Al-Asma al-Husna')}</p>
    <h1>${t('Имена Аллаха', 'Names of Allah')}</h1>
    <p>${t('99 имён с пояснениями и ассоциациями. Изучай в своём темпе и проверяй себя.', '99 names with explanations and memory cues. Learn at your own pace and test your recall.')}</p>
    <div class="actions">${link('quiz', t('Начать квиз', 'Start a quiz'), 'button light')}
    ${link('cards', t('Открыть карточки', 'Open flashcards'), 'button hero-ghost')}</div></div>
    <div class="ornament"><i aria-hidden="true"></i><i aria-hidden="true"></i><i aria-hidden="true"></i>
    <button class="feature" type="button" data-name="${name.id}"><span class="spark" aria-hidden="true">✦</span>
    ${ar(name)}<span class="feature-title">${displayName(name)}${alternateName(name)}</span><small>${name.meaning[language]}</small></button></div></section>
    <section class="section"><div class="section-head"><h2>${t('Выбери режим', 'Choose a mode')}</h2></div>
    <div class="mode-grid">${modes.map(([page, icon, copy]) =>
      `<a class="mode-link" href="${url(page)}"><span class="mode-icon" aria-hidden="true">${icon}</span><h3>${label(page)}</h3><p>${copy}</p></a>`).join('')}</div></section>
    <section class="section"><div class="section-head"><div><h2>${t('Похожие имена', 'Related names')}</h2>
    <p class="subtitle">${t('Запоминай через смысловые отличия.', 'Learn through differences in meaning.')}</p></div>
    ${link('groups', t('Все группы', 'All groups'), 'button outline small')}</div>
    <div class="group-grid">${Object.keys(groups).slice(0, 3).map(id => groupTile(id, true)).join('')}</div></section>
    ${history.total || Object.keys(practice).length ? `<section class="section"><div class="section-head"><h2>${t('Мой прогресс на этом устройстве', 'My progress on this device')}</h2></div>
    <div class="stats">${stat(history.completed, t('Завершённых квизов', 'Completed quizzes'))}
    ${stat(`${history.correct}/${history.total}`, t('Верных ответов', 'Correct answers'))}
    ${stat(Object.keys(practice).length, t('Карточек в повторении', 'Cards in review'))}</div></section>` : ''}`;
}

function alternateGlosses(name) {
  return name.variants[language].join(' · ');
}

function ayahCard(name, label, type = '=') {
  const phrase = verseExcerpt(name, label);
  if (!phrase) return '';
  const source = sourceLink(type + label);
  const kind = type === '~' ? t('Контекст', 'Context') : t('Выражение из аята', 'Quranic wording');
  return `<article class="ayah">
    <div class="ayah-meta"><span>${kind}</span>${sourceBadge(`${t('Коран', 'Quran')} ${label}`, source.url)}</div>
    <p class="ar ayah-text" dir="rtl" lang="ar">${esc(phrase.ar)}</p>
    <p>${esc(phrase.meaning[language])}</p>${secondary(phrase.meaning)}
  </article>`;
}

function noteVerses(name) {
  const mentioned = new Set([...name.note[language].matchAll(/\b(\d+):(\d+)(?:[–-](\d+))?/g)].flatMap(([, surah, first, last]) =>
    last ? [`${surah}:${first}`, `${surah}:${last}`] : [`${surah}:${first}`]));
  return name.refs.filter(ref => /^[=~]/.test(ref) && mentioned.has(ref.slice(1)))
    .map(ref => ayahCard(name, ref.slice(1), ref[0])).join('');
}

function compareRow(name, study = false) {
  const verses = study ? noteVerses(name) : '';
  return `<article class="comparison"><div class="compare-name">${nameButton(name, `${ar(name)} <span>${displayName(name)}</span>`)}
    ${alternateName(name)}<strong>${esc(name.meaning[language])}</strong></div>
    ${alternateGlosses(name) ? `<p class="secondary-language">${esc(alternateGlosses(name))}</p>` : ''}
    <p>${esc(name.note[language])}</p>${secondary(name.note)}
    ${verses ? `<div class="verse-list">${verses}</div>` : ''}
    ${study ? cueDisclosure(name) : ''}</article>`;
}

function groupPage() {
  const selected = names.filter(name => name.group === group);
  return `${heading(t('Имена по смыслу', 'Names by meaning'), t('Сравни значения и попробуй вспомнить имена по ассоциациям.', 'Compare meanings and use memory cues to recall the names.'))}
    <div class="group-grid">${Object.keys(groups).map(id => groupTile(id)).join('')}</div>
    <section class="section" id="group-comparison"><div class="section-head"><div>
    <h2 tabindex="-1">${esc(groups[group][language])}</h2>${secondary(groups[group])}</div>
    ${btn(t('Учить группу', 'Study this group'), 'study-group', 'primary')}</div>
    <div class="compare">${selected.map(name => compareRow(name, true)).join('')}</div></section>`;
}

const normalize = value => value.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '')
  .replace(/[ٱأإآ]/g, 'ا').replace(/[’‘'\-\s]/g, '');

function listNames() {
  const term = normalize(search.trim());
  const selected = names.filter(name => (!catalogGroup || catalogGroup === name.group)
    && (!term || [name.ar, name.ru, name.latin, ...name.meaning, ...name.variants.flat()].some(value => normalize(value).includes(term))));
  return `<p class="subtitle" role="status">${t('Найдено', 'Found')} · ${selected.length}</p>${selected.length
    ? `<div class="names-grid">${selected.map(tile).join('')}</div>`
    : empty(t('По этому запросу ничего не найдено.', 'No names match your search.'))}`;
}

function catalog() {
  return `${heading(t('Все 99 имён', 'All 99 names'), t('Нажми на имя, чтобы увидеть пояснение, ассоциацию и источники.', 'Select a name to see its explanation, memory cue and sources.'))}
    <div class="filters">
    <label>${t('Поиск', 'Search')}<input id="search" type="search" value="${esc(search)}" placeholder="${t('Имя или значение', 'Name or meaning')}"></label>
    <label>${t('Группа', 'Group')}<select id="catalog-group">${opt('', t('Все группы', 'All groups'), catalogGroup)}
    ${Object.entries(groups).map(([id, title]) => opt(id, title[language], catalogGroup)).join('')}</select></label></div>
    <div id="catalog-results">${listNames()}</div>`;
}

function favoritePage() {
  const saved = favorites();
  return `${heading(label('favorites'), cloud.account() ? t('Имена в твоём аккаунте.', 'Names saved to your account.') : t('Имена, сохранённые в этом браузере.', 'Names saved in this browser.'))}
    ${saved.size ? `<div class="names-grid">${names.filter(name => saved.has(name.id)).map(tile).join('')}</div>`
      : empty(t('Нажми на сердечко рядом с именем, чтобы сохранить его.', 'Select the heart next to a name to save it.'))}
    <div class="actions section">${link('catalog', t('Все имена', 'All names'), 'button outline')}</div>`;
}

function selectPool() {
  return [
    ['all', t('Все имена', 'All names')], ['favorites', t('Избранное', 'Favorites')],
    ['due', t('Пора повторить', 'Due for review')], ...Object.entries(groups).map(([key, title]) => [key, title[language]])
  ];
}

function pool(value) {
  if (value === 'favorites') return names.filter(name => favorites().has(name.id));
  if (value === 'due') return names.filter(name => due(practice[name.id]));
  return groups[value] ? names.filter(name => name.group === value) : names;
}

function difficultySelect(key = 'difficulty') {
  return `<label>${t('Сложность', 'Difficulty')}<select name="difficulty">
    ${opt('easy', t('Лёгкая · имя и варианты значений', 'Easy · name to meaning'), settings[key] || 'easy')}
    ${opt('medium', t('Средняя · часть вопросов только на арабском', 'Medium · some Arabic-only prompts'), settings[key])}
    ${opt('hard', t('Сложная · значение и похожие имена', 'Hard · meaning to similar names'), settings[key])}</select></label>`;
}

function quizSetup() {
  return `<div class="narrow">${heading(label('quiz'), t('Выбери сложность и количество. Имена будут выпадать в случайном порядке.', 'Choose a difficulty and question count. Names appear in random order.'))}
    <form class="card stack form" id="quiz-setup">
      ${difficultySelect()}
      <label>${t('Набор', 'Study set')}<select name="pool">${selectPool().map(([id, title]) => opt(id, title, settings.pool || 'all')).join('')}</select></label>
      <label>${t('Количество вопросов', 'Question count')}<input type="number" name="count" min="1" max="99" required value="${settings.count || 10}"></label>
      <div class="actions"><button class="button primary" type="submit">${t('Начать', 'Begin')}</button></div>
      <p class="notice form-error" role="status" hidden></p>
    </form></div>`;
}

function meter(position, total) {
  return `<div class="meter" role="progressbar" aria-label="${t('Прогресс', 'Progress')}" aria-valuemin="0" aria-valuemax="${total}" aria-valuenow="${position}"><span style="width:${position / total * 100}%"></span></div>`;
}

function quizPage() {
  if (!quiz) return quizSetup();
  const { questions, index, picked, hints, answers } = quiz;
  if (index >= questions.length) {
    const correct = answers.filter(result => result.id === result.pick).length;
    const wrong = answers.filter(result => result.id !== result.pick);
    return `<div class="narrow">${heading(t('Результат квиза', 'Quiz results'))}
      <div class="card stack"><div class="stats">${stat(`${correct}/${questions.length}`, t('Правильно', 'Correct'))}
      ${stat(`${Math.round(100 * correct / questions.length)}%`, t('Точность', 'Accuracy'))}
      ${stat(answers.filter(result => result.hints).length, t('Вопросов с подсказкой', 'Questions with a hint'))}</div>
      <div class="actions">${btn(t('Новый квиз', 'New quiz'), 'reset-quiz', 'primary')}${wrong.length
        ? btn(t('Повторить ошибки', 'Review missed names'), 'review-errors', 'outline') : ''}</div>
      ${wrong.length ? `<div class="compare">${wrong.map(result => compareRow(byId.get(result.id), true)).join('')}</div>` : ''}</div></div>`;
  }
  const question = questions[index];
  const name = byId.get(question.id);
  const reverse = question.mode === 'reverse';
  const verses = picked ? noteVerses(name) : '';
  const similar = related(name)[0];
  const fragments = question.mode === 'name'
    ? `${Array.from(name.meaning[language]).slice(0, 3).join('')}…`
    : nameFragment(name, question.mode, language);
  const hintChoices = [
    ['half', '50/50'], ['fragment', question.mode === 'name' ? t('Начало ответа', 'Answer fragment') : t('Часть имени', 'Name fragment')],
    ['similar', t('Похожее имя', 'Related name')], ['cue', t('Ассоциация', 'Memory cue')]
  ];
  return `<div class="narrow">${heading(label('quiz'))}<section class="card stack">
    <div><div class="countline"><span>${t('Вопрос', 'Question')} ${index + 1}/${questions.length}</span>
    ${btn(t('К настройкам', 'Quiz settings'), 'reset-quiz', 'outline small')}</div>${meter(index + Number(Boolean(picked)), questions.length)}</div>
    <div class="quiz-prompt"><p class="eyebrow">${reverse ? t('Какое это имя?', 'Which name is it?') : t('Что означает имя?', 'What does the name mean?')}</p>
    ${reverse ? `<h2>${esc(name.meaning[language])}</h2>` : `${ar(name)}${question.mode === 'name' ? `<h2>${displayName(name)}</h2>${alternateName(name)}` : ''}`}</div>
    <div class="answer-grid">${question.options.map(id => {
      const option = byId.get(id);
      const removed = hints.has('half') && question.remove.includes(id);
      return `<button class="answer ${picked && id === name.id ? 'correct' : picked === id ? 'wrong' : removed ? 'removed' : ''}"
        type="button" data-answer="${id}" ${picked || removed ? 'disabled' : ''}>${reverse
          ? `${ar(option)}${displayName(option)}` : esc(option.meaning[language])}</button>`;
    }).join('')}</div>
    ${picked ? `<div class="note" role="status"><strong>${picked === name.id ? t('Верно', 'Correct') : t('Правильный ответ', 'Correct answer')}
      · ${nameButton(name)} · ${esc(name.meaning[language])}</strong>
      ${alternateGlosses(name) ? `<p class="secondary-language">${esc(alternateGlosses(name))}</p>` : ''}
      <p>${esc(name.note[language])}</p></div>
      ${verses ? `<div class="verse-list">${verses}</div>` : ''}${cueDisclosure(name, hints.has('cue'))}
      <div class="actions">${btn(index + 1 === questions.length ? t('К результатам', 'See results') : t('Следующий вопрос', 'Next question'), 'next-question', 'primary')}</div>`
      : `<div class="actions" aria-label="${t('Подсказки', 'Hints')}">${hintChoices.map(([id, text]) =>
        `<button type="button" class="button outline small" data-hint="${id}" aria-pressed="${hints.has(id)}" ${hints.has(id) ? 'disabled' : ''}>${text}</button>`).join('')}</div>
        ${hints.size ? `<div class="note" aria-live="polite">
          ${hints.has('half') ? `<p>${t('Два неверных варианта убраны.', 'Two incorrect choices removed.')}</p>` : ''}
          ${hints.has('fragment') ? `<p>${t('Начало', 'Starts with')} · <bdi>${esc(fragments)}</bdi></p>` : ''}
          ${hints.has('similar') ? `<p>${t('Похожее, но другое имя', 'A related but different name')} · ${displayName(similar)} · ${esc(similar.meaning[language])}</p>` : ''}
          ${hints.has('cue') ? `<p>${esc(name.cue[language])}</p>` : ''}
        </div>` : ''}`}</section></div>`;
}

function deal(source) {
  flash = { pool: source, ids: shuffle(pool(source)).map(name => name.id), index: 0, flipped: false, rated: new Set() };
}

function cards() {
  if (!flash) deal('all');
  const name = byId.get(flash.ids[flash.index]);
  if (!name) {
    return `<div class="narrow">${heading(label('cards'))}<div class="card stack">
    <label>${t('Набор', 'Study set')}<select id="cards-pool">${selectPool().map(([id, text]) => opt(id, text, flash.pool)).join('')}</select></label>
    ${empty(flash.pool === 'due' ? t('На сегодня всё повторено.', 'You are caught up on reviews.') : t('В этом наборе пока нет имён.', 'This set has no names yet.'))}
    </div></div>`;
  }
  const meaning = esc(name.meaning[language]);
  const glosses = esc(alternateGlosses(name));
  const verses = noteVerses(name);
  return `<div class="narrow">${heading(label('cards'), t('Значение видно сразу. Переверни карточку для пояснения и отметь, пора ли повторить имя.', 'Read the meaning, flip for an explanation and mark whether the name is due for review.'))}
    <div class="card stack"><div class="filters"><label>${t('Набор', 'Study set')}<select id="cards-pool">${selectPool().map(([id, text]) => opt(id, text, flash.pool)).join('')}</select></label>
    ${btn(t('Перемешать', 'Shuffle'), 'shuffle-cards', 'outline')}</div>
    <div><div class="countline"><span>${flash.index + 1} / ${flash.ids.length}</span><span>${t('К повторению', 'Due')} · ${pool('due').length}</span></div>${meter(flash.index + 1, flash.ids.length)}</div>
    <button type="button" class="flash ${flash.flipped ? 'flipped' : ''}" data-action="flip" aria-pressed="${flash.flipped}">
      <span class="flash-inner"><span class="flash-face" aria-hidden="${flash.flipped}">${ar(name)}<strong>${displayName(name)}</strong>
        ${alternateName(name)}<span class="flash-meaning">${meaning}</span>
        ${glosses ? `<small>${glosses}</small>` : ''}
        <small class="turn">${t('Переверни для пояснения', 'Flip for an explanation')}</small></span>
      <span class="flash-face back" aria-hidden="${!flash.flipped}"><strong>${meaning}</strong>
        <small>${esc(name.meaning[1 - language])}</small>${glosses ? `<small>${glosses}</small>` : ''}
        <span class="flash-explanation">${esc(name.note[language])}</span></span></span>
    </button>
    <div class="actions"><span>${nameButton(name, t('Подробнее об имени', 'Name details'))}</span>${favoriteButton(name)}</div>
    ${cueDisclosure(name)}
    ${verses ? `<div id="flash-verses" class="verse-list" ${flash.flipped ? '' : 'hidden'}>${verses}</div>` : ''}
    <div class="actions" id="ratings" ${flash.flipped ? '' : 'hidden'}>
      ${btn(t('Нужно повторить', 'Review again'), 'again', 'outline', flash.rated.has(name.id) ? 'disabled' : '')}
      ${btn(t('Вспомнила', 'I remembered'), 'remember', 'primary', flash.rated.has(name.id) ? 'disabled' : '')}</div>
    <div class="pager">${btn(t('Назад', 'Previous'), 'prev-card', 'outline', flash.index === 0 ? 'disabled' : '')}
      ${flash.index === flash.ids.length - 1 ? btn(t('С начала', 'Back to start'), 'restart-cards', 'outline')
        : btn(t('Следующая', 'Next'), 'next-card', 'outline')}</div></div></div>`;
}

const close = () => btn('×', 'close', 'outline small close', `aria-label="${t('Закрыть', 'Close')}"`);
const sourceBadge = (title, url) => `<a href="${url}" target="_blank" rel="noopener noreferrer">${esc(title)}</a>`;
const traditional = 'https://sunnah.com/tirmidhi:3507';

function showDialog(content) {
  dialogBody.innerHTML = close() + content;
  if (!dialog.open) dialog.showModal();
  dialog.scrollTop = 0;
  dialogBody.querySelector('h2')?.focus({ preventScroll: true });
}

function showName(name) {
  detail = name;
  const sourceTypes = {
    h: t('Хадис', 'Hadith'),
    k: t('Хадис, контекст', 'Hadith, context')
  };
  const verses = name.refs.filter(ref => /^[=~]/.test(ref)).map(ref => ayahCard(name, ref.slice(1), ref[0])).join('');
  const alternatives = [name.variants[0].join(' · '), name.variants[1].join(' · ')];
  showDialog(`<div class="stack"><div class="detail-heading">${ar(name)}
    <h2 id="dialog-title" tabindex="-1">${displayName(name)}</h2>${alternateName(name)}</div>
    <div><h3>${esc(name.meaning[language])}</h3>${secondary(name.meaning)}
    ${alternatives[language] ? `<p class="meaning-variants">${t('Также', 'Also')} · ${esc(alternatives[language])}</p>` : ''}
    ${alternatives[1 - language] ? secondary(alternatives) : ''}</div>
    <div><p>${esc(name.note[language])}</p>${secondary(name.note)}</div>
    ${cueDisclosure(name)}
    <div class="actions">${favoriteButton(name)}</div>
    <div class="stack"><h3>${t('Источники', 'Sources')}</h3>
    ${verses ? `<div class="verse-list">${verses}</div>` : ''}
    <div class="source-list">${name.refs.filter(ref => /^[hk]:/.test(ref)).map(ref => {
      const source = sourceLink(ref);
      return sourceBadge(`${sourceTypes[source.type]} · ${source.label}`, source.url);
    }).join('')}${sourceBadge(t('Перечень ат-Тирмизи · 3507', 'At-Tirmidhi’s list · 3507'), traditional)}</div>
    ${name.refs.some(ref => /^[=h]/.test(ref)) ? '' : `<p class="secondary-language">${t('Форма имени дана по традиционному перечню.', 'This form comes from the traditional list.')}</p>`}</div>
    <section><h3>${t('Похожие имена и отличия', 'Related names and differences')}</h3><div class="compare">
    <div class="note"><strong>${displayName(name)} · ${esc(name.meaning[language])}</strong>${secondary(name.meaning)}</div>
    ${related(name).map(other => compareRow(other)).join('')}</div></section></div>`);
}

function sources() {
  detail = undefined;
  showDialog(`<div class="stack"><h2 id="dialog-title" tabindex="-1">${t('Источники и перевод', 'Sources and translation')}</h2>
    <p>${t('Коран призывает обращаться к Аллаху Его прекрасными именами (7:180). Достоверный хадис аль-Бухари 2736 сообщает о 99 именах без их перечисления. Учебный каталог следует известному перечню из ат-Тирмизи 3507. Ат-Тирмизи назвал передачу с перечнем редкой (гариб), а Ибн Хаджар считал перечисление вставкой передатчика.', 'The Quran calls on people to invoke Allah by His beautiful names (7:180). The authentic hadith in Al-Bukhari 2736 mentions 99 names without enumerating them. The catalogue follows the familiar list in At-Tirmidhi 3507. At-Tirmidhi called the narration with the list rare (gharib), and Ibn Hajar regarded the enumeration as a narrator’s insertion.')}</p>
    ${ayahCard(null, '7:180')}
    <p>${t('Карточки помечают прямые именования и ссылки на близкие выражения или действия. Русские и английские формулировки передают учебный смысл. Для близких имён оттенки могут пересекаться. Ассоциации помогают запомнить слова.', 'Cards mark direct epithets and distinguish references to related expressions or actions. Russian and English renderings summarize the meaning for study. Nuances can overlap between related names. Memory cues help recall the words.')}</p>
    <div class="source-list">
    ${sourceBadge(t('Коран 59:22–24', 'Quran 59:22–24'), 'https://quran.com/59/22-24')}
    ${sourceBadge(t('Аль-Бухари 2736', 'Al-Bukhari 2736'), 'https://sunnah.com/bukhari:2736')}
    ${sourceBadge(t('Ат-Тирмизи 3507', 'At-Tirmidhi 3507'), traditional)}
    ${sourceBadge(t('Ибн Хаджар · Булуг аль-Марам 1382', 'Ibn Hajar · Bulugh al-Maram 1382'), 'https://sunnah.com/bulugh/13/9')}
    ${sourceBadge(t('Ибн Касир · Тафсир к 59:24', 'Ibn Kathir · Tafsir on 59:24'), 'https://quran.com/en/al-hashr/24/tafsirs')}</div></div>`);
}

function auth() {
  detail = undefined;
  const user = cloud.account();
  const title = `<h2 id="dialog-title" tabindex="-1">${user ? t('Профиль', 'Account') : t('Вход по почте', 'Email sign-in')}</h2>`;
  const formError = '<p class="notice form-error" role="status" hidden></p>';
  showDialog(`<div class="stack">${title}${!cloud.enabled
    ? `<p>${t('В этой копии сайта избранное сохраняется в браузере. Для входа и синхронизации нужно подключить Supabase.', 'This copy saves favorites in your browser. Connect Supabase to enable sign-in and syncing.')}</p>`
    : user ? `<p>${esc(user.email)}</p><p>${t('Избранное синхронизируется между устройствами.', 'Favorites sync across devices.')}</p><div class="actions">
      ${btn(t('Выйти', 'Sign out'), 'signout', 'outline')}</div>`
      : email ? `<form id="verify-code" class="stack"><p>${t('Проверь почту', 'Check your inbox')} <strong>${esc(email)}</strong>.
        ${t('Открой ссылку из письма в этом же браузере.', 'Open the link from the email in this same browser.')}</p>
        <label>${t('Если в письме код, введи его здесь', 'If the email contains a code, enter it here')}<input name="token" autocomplete="one-time-code" inputmode="numeric" pattern="[0-9]{6,10}" required></label>
        <div class="actions"><button class="button primary" type="submit">${t('Подтвердить', 'Verify')}</button>
          ${btn(t('Другой адрес или новое письмо', 'Change email or request a new email'), 'new-email', 'outline')}</div>${formError}</form>`
      : `<form id="send-email" class="stack"><p>${t('На почту придёт письмо для входа. Войди, чтобы сохранять избранное между устройствами и вести общие игры.', 'We will send you a sign-in email. Sign in to sync favorites and host live games.')}</p>
        <label>${t('Электронная почта', 'Email address')}<input name="email" type="email" autocomplete="email" required></label>
        <div class="actions"><button class="button primary" type="submit">${t('Получить письмо', 'Send sign-in email')}</button></div>${formError}</form>`}</div>`);
}

async function syncFavorites() {
  const user = cloud.account();
  if (!cloud.enabled || !user) return;
  const guestFavorites = read('favorites', []).filter(id => byId.has(id));
  const ids = await cloud.rpc('sync_favorites', { p_ids: guestFavorites });
  save(`favorites.${user.id}`, ids);
  if (cloud.account()?.id === user.id && guestFavorites.length) {
    save('favorites', read('favorites', []).filter(id => !guestFavorites.includes(id)));
  }
}

async function signedIn() {
  email = '';
  roomView?.reset();
  try { await syncFavorites(); }
  catch { notify(t('Вход выполнен. Избранное пока не синхронизировалось.', 'Signed in. Favorites could not sync yet.')); }
  renderChrome();
  render();
}

function updateFavoriteButtons(id) {
  document.querySelectorAll(`[data-favorite="${id}"]`).forEach(button => {
    const focused = document.activeElement === button;
    const parent = button.parentElement;
    button.outerHTML = favoriteButton(byId.get(id), button.classList.contains('heart'));
    if (focused) parent.querySelector(`[data-favorite="${id}"]`)?.focus({ preventScroll: true });
  });
}

function toggleFavorite(id) {
  const key = favoritesKey();
  const user = cloud.account();
  const saved = favorites();
  const active = !saved.has(id);
  if (active) saved.add(id);
  else saved.delete(id);
  save(key, [...saved]);
  if (route === 'favorites') render();
  updateFavoriteButtons(id);
  notify(active ? t('Сохранено в избранное', 'Saved to favorites') : t('Убрано из избранного', 'Removed from favorites'));
  if (!user) return;
  const revision = (favoriteChanges.get(id) || 0) + 1;
  favoriteChanges.set(id, revision);
  favoriteQueue = favoriteQueue.then(async () => {
    if (cloud.account()?.id !== user.id) return;
    await cloud.rpc('favorite', { p_name: id, p_saved: active });
  }).catch(() => {
    if (cloud.account()?.id !== user.id || favoriteChanges.get(id) !== revision) return;
    const current = new Set(read(key, []));
    if (current.has(id) === active) {
      if (active) current.delete(id);
      else current.add(id);
      save(key, [...current]);
      if (route === 'favorites') render();
      updateFavoriteButtons(id);
    }
    notify(t('Не удалось сохранить изменение. Попробуй ещё раз.', 'Could not save the change. Please try again.'));
  });
}

const views = { home, quiz: quizPage, cards, groups: groupPage, catalog, favorites: favoritePage };
function render() {
  if (route === 'room') {
    if (roomView) roomView.render();
    else {
      main.innerHTML = heading(label('room'), t('Загрузка…', 'Loading…'));
      import('./rooms.js').then(module => {
        roomView ||= module.createRoom(main, { auth, notify });
        if (route === 'room') roomView.enter();
      }).catch(() => {
        if (route === 'room') main.innerHTML = heading(label('room'), t('Перезагрузи страницу, чтобы открыть игру.', 'Reload the page to open the live game.'));
      });
    }
    return;
  }
  main.innerHTML = views[route]();
}

function navigate(initial = false) {
  const hash = location.hash.slice(1);
  const invite = new URL(location.href).searchParams.has('room');
  const next = routes.includes(hash) ? hash : invite ? 'room' : 'home';
  if (next !== 'room') roomView?.leave();
  route = next;
  renderChrome();
  render();
  if (route === 'room') roomView?.enter();
  if (!initial) {
    window.scrollTo(0, 0);
    main.focus({ preventScroll: true });
  }
}

function advanceQuiz() {
  if (!quiz.picked) return;
  quiz.index += 1;
  quiz.picked = 0;
  quiz.hints = new Set();
  if (quiz.index === quiz.questions.length) {
    const correct = quiz.answers.filter(answer => answer.id === answer.pick).length;
    history = { completed: history.completed + 1, correct: history.correct + correct, total: history.total + quiz.answers.length };
    save('history', history);
  }
  render();
  main.querySelector('.quiz-prompt, .heading h1')?.setAttribute('tabindex', '-1');
  main.querySelector('.quiz-prompt, .heading h1')?.focus({ preventScroll: true });
}

function startQuiz(selected, count, difficulty) {
  quiz = { questions: makeQuiz(selected, count, difficulty), index: 0, picked: 0, hints: new Set(), answers: [] };
  render();
  main.focus({ preventScroll: true });
}

function flashAction(action) {
  if (action === 'flip') {
    flash.flipped = !flash.flipped;
    const card = main.querySelector('.flash');
    card.classList.toggle('flipped', flash.flipped);
    card.setAttribute('aria-pressed', flash.flipped);
    card.querySelector('.flash-face').setAttribute('aria-hidden', flash.flipped);
    card.querySelector('.back').setAttribute('aria-hidden', !flash.flipped);
    main.querySelector('#ratings').hidden = !flash.flipped;
    const verses = main.querySelector('#flash-verses');
    if (verses) verses.hidden = !flash.flipped;
    return;
  }
  if (action === 'again' || action === 'remember') {
    const id = flash.ids[flash.index];
    if (!flash.flipped || flash.rated.has(id)) return;
    flash.rated.add(id);
    practice[id] = schedule(practice[id], action === 'remember');
    save('practice', practice);
    notify(action === 'remember' ? t('Карточка записана в план повторения.', 'Card added to your review schedule.') : t('Карточка вернётся к повторению через 10 минут.', 'This card will be due again in 10 minutes.'));
    if (flash.index < flash.ids.length - 1) flash.index += 1;
    else if (flash.pool === 'due') deal('due');
  }
  if (action === 'prev-card') flash.index -= 1;
  if (action === 'next-card') flash.index += 1;
  if (action === 'restart-cards') flash.index = 0;
  if (action === 'shuffle-cards') deal(flash.pool);
  flash.flipped = false;
  render();
  main.querySelector('.flash')?.focus({ preventScroll: true });
}

document.addEventListener('click', event => {
  if (event.target.closest('.skip')) {
    event.preventDefault();
    main.focus();
    return;
  }
  const button = event.target.closest('button');
  if (!button) return;
  if (button.dataset.name) return showName(byId.get(Number(button.dataset.name)));
  if (button.dataset.favorite) return toggleFavorite(Number(button.dataset.favorite));
  if (button.dataset.group) {
    group = button.dataset.group;
    const target = () => {
      const section = document.querySelector('#group-comparison');
      section?.scrollIntoView();
      section?.querySelector('h2')?.focus({ preventScroll: true });
    };
    if (route !== 'groups') {
      window.addEventListener('hashchange', target, { once: true });
      location.hash = 'groups';
    } else {
      render();
      target();
    }
    return;
  }
  if (route === 'quiz' && quiz && button.dataset.hint) {
    quiz.hints.add(button.dataset.hint);
    render();
    main.querySelector('.note[aria-live]')?.setAttribute('tabindex', '-1');
    main.querySelector('.note[aria-live]')?.focus({ preventScroll: true });
    return;
  }
  if (route === 'quiz' && quiz && button.dataset.answer && !quiz.picked) {
    quiz.picked = Number(button.dataset.answer);
    quiz.answers.push({ id: quiz.questions[quiz.index].id, pick: quiz.picked, hints: quiz.hints.size });
    render();
    main.querySelector('[data-action="next-question"]')?.focus({ preventScroll: true });
    return;
  }
  const action = button.dataset.action;
  switch (action) {
    case 'theme':
      chosenTheme = isDark() ? 'light' : 'dark';
      save('theme', chosenTheme);
      applyTheme();
      break;
    case 'language':
      setLanguage(1 - language);
      renderChrome();
      render();
      topbar.querySelector('[data-action="language"]').focus();
      break;
    case 'auth': auth(); break;
    case 'sources': sources(); break;
    case 'close': dialog.close(); break;
    case 'new-email': email = ''; auth(); break;
    case 'signout':
      button.disabled = true;
      favoriteQueue.then(() => cloud.signout()).catch(() => {}).finally(() => {
        renderChrome();
        roomView?.reset();
        render();
        dialog.close();
      });
      break;
    case 'study-group': deal(group); location.hash = 'cards'; break;
    case 'reset-quiz': quiz = undefined; render(); main.focus(); break;
    case 'next-question': advanceQuiz(); break;
    case 'review-errors':
      startQuiz(quiz.answers.filter(answer => answer.id !== answer.pick).map(answer => byId.get(answer.id)), 99, settings.difficulty);
      break;
    default:
      if (route === 'cards' && action) flashAction(action);
  }
});

function formError(form, message) {
  const target = form.querySelector('.form-error');
  target.textContent = message;
  target.hidden = !message;
}

document.addEventListener('submit', async event => {
  const form = event.target;
  if (!['quiz-setup', 'verify-code', 'send-email'].includes(form.id)) return;
  event.preventDefault();
  const data = Object.fromEntries(new FormData(form));
  if (form.id === 'quiz-setup') {
    const selection = pool(data.pool);
    const count = Number(data.count);
    if (!selection.length) return formError(form, t('В этом наборе нет имён.', 'This set has no names.'));
    if (count > selection.length) return formError(form, t(`В этом наборе доступно вопросов: ${selection.length}.`, `This set has ${selection.length} questions available.`));
    settings = { ...settings, ...data, count };
    save('settings', settings);
    return startQuiz(selection, count, data.difficulty);
  }
  const submit = form.querySelector('[type="submit"]');
  submit.disabled = true;
  formError(form, '');
  try {
    if (form.id === 'send-email') {
      await cloud.sendSignInEmail(data.email, new URL('.', location.href).href);
      email = data.email;
      if (dialog.open && dialog.contains(form)) auth();
    } else {
      await cloud.verifyCode(email, data.token);
      await signedIn();
      if (dialog.open && dialog.contains(form)) dialog.close();
    }
  } catch {
    formError(form, form.id === 'send-email'
      ? t('Не удалось отправить письмо. Проверь адрес и попробуй ещё раз чуть позже.', 'Could not send the email. Check your address and try again shortly.')
      : t('Не удалось подтвердить код. Проверь цифры или запроси новое письмо.', 'Could not verify the code. Check the digits or request a new email.'));
  } finally { submit.disabled = false; }
});

main.addEventListener('input', event => {
  if (event.target.id !== 'search') return;
  search = event.target.value;
  document.querySelector('#catalog-results').innerHTML = listNames();
});
main.addEventListener('change', event => {
  if (event.target.id === 'catalog-group') {
    catalogGroup = event.target.value;
    document.querySelector('#catalog-results').innerHTML = listNames();
  }
  if (event.target.id === 'cards-pool') {
    deal(event.target.value);
    render();
    document.querySelector('#cards-pool').focus();
  }
});
dialog.addEventListener('close', () => { detail = undefined; });
dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
window.addEventListener('hashchange', () => navigate());
setLanguage(language);
const callback = cloud.enabled && cloud.emailLink(location.href);
if (callback) window.history.replaceState(null, '', callback.address);
navigate(true);
if (callback) {
  cloud.signInFromLink(callback.code).then(async () => {
    if (dialog.open) dialog.close();
    notify(t('Ты вошла в аккаунт', 'You are signed in'));
    await signedIn();
  }).catch(error => {
    auth();
    const text = error.code === 'missing_verifier'
      ? t('Открой ссылку в том же браузере, где запросила письмо, или запроси новое письмо здесь.',
        'Open the link in the browser where you requested it, or request a new email here.')
      : t('Ссылка недействительна или просрочена. Запроси новое письмо.', 'The link is invalid or expired. Request a new email.');
    const form = dialogBody.querySelector('#send-email');
    if (form) formError(form, text);
    else notify(text);
  });
} else if (cloud.enabled && cloud.account()) syncFavorites().catch(() => {}).finally(() => {
  renderChrome();
  if (route !== 'room') render();
  if (detail && dialog.open) updateFavoriteButtons(detail.id);
});

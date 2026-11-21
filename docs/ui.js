export function read(key, fallback) {
  try { return JSON.parse(localStorage.getItem('asma.' + key)) ?? fallback; }
  catch { return fallback; }
}

export function save(key, value) {
  try { localStorage.setItem('asma.' + key, JSON.stringify(value)); }
  catch { /* The current session remains usable when storage is unavailable. */ }
}

export let language = read('language', 0) === 1 ? 1 : 0;
export function setLanguage(index) {
  language = index;
  save('language', index);
  document.documentElement.lang = index ? 'en' : 'ru';
}

export const t = (ru, en) => language ? en : ru;
export const esc = value => String(value ?? '').replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
})[character]);
export const ar = name => `<bdi class="ar" dir="rtl" lang="ar">${esc(name.ar)}</bdi>`;
export const displayName = name => esc(language ? name.latin : name.ru);
export const alternateName = name => `<small lang="${language ? 'ru' : 'en'}">${esc(language ? name.ru : name.latin)}</small>`;
export const secondary = values => `<p class="secondary-language" lang="${language ? 'ru' : 'en'}">${esc(values[1 - language])}</p>`;
export const cueDisclosure = (name, open = false) => `<details class="cue-disclosure" ${open ? 'open' : ''}>
  <summary>${t('Ассоциация для памяти', 'Memory cue')}</summary>
  <p>${esc(name.cue[language])}</p>${secondary(name.cue)}</details>`;
export const btn = (label, action, classes = '', attributes = '') =>
  `<button type="button" class="button ${classes}" data-action="${action}" ${attributes}>${label}</button>`;
export const heading = (title, description = '') =>
  `<div class="heading"><h1>${title}</h1>${description ? `<p>${description}</p>` : ''}</div>`;
export const empty = message => `<p class="empty">${message}</p>`;
export const stat = (value, label) => `<div class="stat"><strong>${value}</strong>${label}</div>`;
export const opt = (value, label, current) => `<option value="${esc(value)}" ${value === current ? 'selected' : ''}>${esc(label)}</option>`;
export const nameButton = (name, text = displayName(name)) => `<button type="button" class="linklike" data-name="${name.id}">${text}</button>`;

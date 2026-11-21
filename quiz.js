import { names, related } from './names.js';

export function shuffle(items, random = Math.random) {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index--) {
    const other = Math.floor(random() * (index + 1));
    [result[index], result[other]] = [result[other], result[index]];
  }
  return result;
}

export function makeQuiz(pool, count, difficulty, random = Math.random) {
  return shuffle(pool, random).slice(0, Math.max(1, Math.min(99, Number(count) || 10))).map((name, index) => {
    const near = shuffle(related(name), random);
    const far = shuffle(names.filter(other => other.id !== name.id && !near.includes(other)), random);
    const similarCount = difficulty === 'hard' ? 3 : difficulty === 'medium' ? 1 : 0;
    const distractors = [...near.slice(0, similarCount), ...far].slice(0, 3);
    return {
      id: name.id,
      mode: difficulty === 'hard' ? 'reverse' : difficulty === 'medium' && index % 2 ? 'arabic' : 'name',
      options: shuffle([name, ...distractors], random).map(option => option.id),
      remove: distractors.slice(0, 2).map(option => option.id)
    };
  });
}

export function nameFragment(name, mode, language) {
  const value = mode === 'arabic' ? name.ar.normalize('NFD').replace(/\p{M}/gu, '') : language ? name.latin : name.ru;
  const segment = value.includes('-') ? value.split('-').at(-1) : value;
  return `${Array.from(segment).slice(0, Math.min(3, Math.max(1, segment.length - 1))).join('')}…`;
}

const day = 86400000;
const intervals = [0, 1, 3, 7, 14, 30];
export const due = (record, now = Date.now()) => !record || record.next <= now;

export function schedule(record, remembered, now = Date.now()) {
  const level = remembered ? Math.min((record?.level || 0) + 1, intervals.length - 1) : 0;
  return { level, next: now + (remembered ? intervals[level] * day : 10 * 60000) };
}

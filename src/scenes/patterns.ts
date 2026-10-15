import type { Calendar, Cell } from '../calendar.js';
import type { SceneDefinition, SceneEvent } from './types.js';
import { film, calendarActivity, center, THEMES, n, text, visible, motion, weeks, colors } from './kit.js';

const pointKey = (x: number, y: number): string => `${x},${y}`;
/** Finite, non-wrapping Conway B3/S23. No decorative or spontaneous births. */
export function nextGeneration(alive: Set<string>, width: number, height: number, mask?: Set<string>): Set<string> {
  const neighbors = new Map<string, number>();
  for (const key of alive) {
    const [x, y] = key.split(',').map(Number);
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
      if ((!dx && !dy) || x + dx < 0 || x + dx >= width || y + dy < 0 || y + dy >= height || mask && !mask.has(pointKey(x + dx, y + dy))) continue;
      const neighbor = pointKey(x + dx, y + dy);
      neighbors.set(neighbor, (neighbors.get(neighbor) || 0) + 1);
    }
  }
  return new Set([...neighbors].filter(([key, count]) => count === 3 || count === 2 && alive.has(key)).map(([key]) => key));
}
export function buildLifeModel(calendar: Calendar) {
  let alive = new Set(calendar.cells.filter(cell => cell.count > 0).map(cell => pointKey(cell.column, cell.row)));
  const mask = new Set(calendar.cells.map(cell => pointKey(cell.column, cell.row)));
  const generations = [{ time: 1.8, alive: [...alive] }];
  for (let index = 1; index <= 44; index++) {
    alive = nextGeneration(alive, calendar.columns, 7, mask);
    generations.push({ time: 1.8 + index * 0.58, alive: [...alive] });
  }
  return { width: calendar.columns, height: 7, generations, duration: 30.5 };
}
const life: SceneDefinition = {
  id: 'life', number: '11', title: 'Game of Life', caption: 'A year becomes a living pattern.', category: 'Patterns',
  description: 'Active dates seed a finite Conway world. Every next generation follows B3/S23: births at three neighbors, survival at two or three.',
  build(calendar) {
    const model = buildLifeModel(calendar);
    return film(calendar, life, { duration: model.duration,
      events: model.generations.map((generation, index) => ({ time: generation.time, type: 'generation', value: generation.alive.length, data: { generation: index, alive: generation.alive } })),
      metrics: { generations: 44, seedCells: calendar.activeDays, finalPopulation: model.generations.at(-1)!.alive.length, topology: 'finite B3/S23 on actual dates' },
      checkpoints: [1.8, 8.76, 17.46],
      draw(theme, animated) {
        const p = THEMES[theme], pitch = 1024 / model.width, size = Math.min(14.5, pitch - 3);
        const cell = (key: string, fill: string) => {
          const [column, row] = key.split(',').map(Number);
          return `<rect x="${n(48 + (column + .5) * pitch - size / 2)}" y="${n(114 + row * 19 + 7.25 - size / 2)}" width="${n(size)}" height="${n(size)}" rx="3" fill="${fill}"/>`;
        };
        const frames = (animated ? model.generations : [model.generations[0]]).map((generation, index) => `<g data-generation="${index}">${animated ? visible(index ? generation.time : 0, model.generations[index + 1]?.time || model.duration, model.duration) : ''}${generation.alive.map(key => cell(key, p.secondary)).join('')}${text(1072, 356, `GEN ${String(index).padStart(2, '0')} · ${generation.alive.length} ALIVE`, p.muted, 10, 'text-anchor="end" class="mono"')}</g>`).join('');
        return frames + text(48, 356, 'B3 / S23 · FINITE WORLD', p.muted, 10, 'class="mono"');
      },
    });
  },
};

interface AntTrip { ant: number; cell: Cell; depart: number; harvest: number; deposit: number }
export function buildAntModel(calendar: Calendar) {
  const active = calendar.cells.filter(cell => cell.count > 0).sort((a, b) => a.count - b.count || a.date.localeCompare(b.date));
  const available = [1.8, 1.8, 1.8];
  let previousHarvest = 1.8;
  const trips: AntTrip[] = active.map((cell, index) => {
    const ant = index % 3;
    const position = center(calendar, cell);
    const travel = .48 + (Math.abs(position.x - 560) + 325 - position.y) / 900;
    const harvest = Math.max(previousHarvest + .2, available[ant] + travel);
    const depart = harvest - travel;
    const deposit = harvest + .22 + travel;
    available[ant] = deposit + .12;
    previousHarvest = harvest;
    return { ant, cell, depart, harvest, deposit };
  });
  return { trips, duration: Math.max(12, Math.max(...available) + 2.5), totalResources: active.reduce((sum, cell) => sum + cell.count, 0) };
}
const ants: SceneDefinition = {
  id: 'ants', number: '12', title: 'Ant Colony', caption: 'Small journeys, a shared store.', category: 'Patterns',
  description: 'Three workers collect the smallest contribution deposits first and carry each harvest home. Resource totals change only when a worker reaches the nest.',
  build(calendar) {
    const model = buildAntModel(calendar), duration = model.duration;
    const events: SceneEvent[] = model.trips.flatMap(trip => [
      { time: trip.harvest, type: 'harvest', date: trip.cell.date, value: trip.cell.count, data: { ant: trip.ant } },
      { time: trip.deposit, type: 'deposit', date: trip.cell.date, value: trip.cell.count, data: { ant: trip.ant } },
    ]);
    return film(calendar, ants, { duration, events, metrics: { workers: 3, trips: model.trips.length, resources: model.totalResources },
      checkpoints: model.trips.length ? [model.trips[0].depart + .2, model.trips[0].harvest + .1, model.trips[0].deposit + .1] : [2, 4, 8],
      draw(theme, animated) {
        const p = THEMES[theme];
        const deposits = calendar.cells.filter(cell => cell.count > 0).map(cell => {
          const point = center(calendar, cell), trip = model.trips.find(trip => trip.cell.date === cell.date)!;
          return `<g data-deposit="${cell.date}">${animated ? visible(0, trip.harvest, duration) : ''}<circle cx="${n(point.x)}" cy="${n(point.y)}" r="${2 + cell.level * .65}" fill="${p.colors[cell.level]}"/></g>`;
        }).join('');
        const workers = [0, 1, 2].map(ant => {
          const trips = model.trips.filter(trip => trip.ant === ant);
          const points = [{ time: 0, x: 560 + ant * 7, y: 325 }];
          for (const trip of trips) {
            const point = center(calendar, trip.cell), middle = (trip.depart + trip.harvest) / 2;
            points.push({ time: trip.depart, x: 560, y: 325 }, { time: middle, x: point.x, y: 285 }, { time: trip.harvest, ...point }, { time: trip.harvest + .22, ...point }, { time: (trip.harvest + .22 + trip.deposit) / 2, x: point.x, y: 285 }, { time: trip.deposit, x: 560, y: 325 });
          }
          return `<g class="ant-worker" data-ant="${ant}" transform="translate(${560 + ant * 7} 325)">${animated ? motion(points, duration) : ''}<path d="M-6 -3l-3 -3m3 6l-4 2m10 -6l3 -3m-3 7l4 2" stroke="${p.accent}" stroke-width="1.4" fill="none"/><ellipse cx="-4" ry="3.2" rx="4" fill="${p.ink}"/><circle r="2.4" fill="${p.ink}"/><circle cx="4" r="2.7" fill="${p.ink}"/>${animated ? trips.map(trip => `<g>${visible(trip.harvest, trip.deposit, duration)}<circle cx="5" cy="-6" r="3" fill="${p.accent}"/></g>`).join('') : ''}</g>`;
        }).join('');
        let stored = 0;
        const arrivals = [...model.trips].sort((a, b) => a.deposit - b.deposit);
        const store = [{ time: 0, total: 0 }, ...arrivals.map(trip => ({ time: trip.deposit, total: stored += trip.cell.count }))];
        return deposits + `<path d="M48 285H1072" stroke="${p.line}" stroke-dasharray="2 7"/><ellipse cx="560" cy="334" rx="38" ry="12" fill="${p.empty}"/><path d="M538 330q22 -35 44 0" stroke="${p.secondary}" stroke-width="2" fill="none"/>` + workers + text(560, 358, 'THE COMMON STORE', p.muted, 9, 'text-anchor="middle" class="mono"') + (animated ? store : store.slice(0, 1)).map((state, index) => `<g data-ant-store="${state.total}">${animated ? visible(state.time, store[index + 1]?.time || duration, duration) : ''}${text(1072, 356, `${state.total.toLocaleString('en-US')} RESOURCES HOME`, p.secondary, 10, 'text-anchor="end" class="mono"')}</g>`).join('');
      },
    });
  },
};

export function buildWeatherModel(calendar: Calendar) {
  let peak = 0, streak = 0, previous = 0;
  const states = weeks(calendar).map((week, index) => {
    for (const cell of week.cells) {
      const time = Date.parse(`${cell.date}T00:00:00Z`);
      streak = cell.count ? (time - previous === 86_400_000 ? streak + 1 : 1) : 0;
      previous = time;
    }
    const record = week.count > peak;
    peak = Math.max(peak, week.count);
    return { ...week, time: 1.8 + index * .72, sky: week.count === 0 ? 'rain' : streak >= 7 || week.active >= 5 ? 'sunny' : 'cloudy', record, streak };
  });
  return { states, duration: Math.max(12, 1.8 + states.length * .72 + 2.5), peak };
}
const weather: SceneDefinition = {
  id: 'weather', number: '13', title: 'Weather Report', caption: 'Every season has its own pace.', category: 'Patterns',
  description: 'Quiet weeks bring rain, active runs open the sky, and a new weekly peak scatters a small celebration. Every weather change follows your calendar.',
  build(calendar) {
    const model = buildWeatherModel(calendar), duration = model.duration;
    return film(calendar, weather, { duration,
      events: model.states.map(state => ({ time: state.time, type: state.sky, value: state.count, data: { column: state.column, record: state.record, streak: state.streak } })),
      metrics: { rainyWeeks: model.states.filter(state => state.sky === 'rain').length, sunnyWeeks: model.states.filter(state => state.sky === 'sunny').length, peakWeek: model.peak, records: model.states.filter(state => state.record).length },
      checkpoints: [2, 1.8 + (model.states.findIndex(state => state.count > 0) + .5) * .72, duration - 3],
      draw(theme, animated) {
        const p = THEMES[theme], palette = colors(theme);
        const terrain = `<path d="M48 332q165 -26 312 -4t298 -5t414 6v19H48Z" fill="${p.empty}"/><path d="M48 342q235 -15 435 -4t589 0" fill="none" stroke="${p.secondary}" stroke-width="1.5"/>`;
        const weekly = model.states.map(state => `<rect x="${n(48 + state.column * 1024 / calendar.columns)}" y="${n(351 - 16 * state.count / Math.max(1, model.peak))}" width="${n(Math.max(1, 1024 / calendar.columns - 3))}" height="${n(2 + 16 * state.count / Math.max(1, model.peak))}" rx="1" fill="${p.colors[state.count ? 3 : 0]}"/>`).join('');
        const chosen = animated ? model.states : [model.states.find(state => state.count === model.peak)!];
        const skies = chosen.map((state, index) => {
          const cloud = `<path d="M235 210c-35 0-38-45-8-51 5-36 59-43 72-10 38-15 68 14 52 42 38 0 37 28 7 28H235Z" transform="translate(390 186) scale(.55)" fill="${p.secondary}" opacity="${state.sky === 'sunny' ? '.4' : '.9'}"/>`;
          const rain = state.sky === 'rain' ? Array.from({ length: 13 }, (_, drop) => `<path d="M${524 + drop * 5} ${307 + drop % 3 * 4}l-2 6" stroke="${palette[2]}" stroke-width="2" opacity=".7">${animated ? `<animateTransform attributeName="transform" type="translate" values="0 -4;-3 12" dur=".72s" repeatCount="indefinite"/>` : ''}</path>`).join('') : '';
          const sun = state.sky !== 'rain' ? `<g transform="translate(906 292) scale(.55)"><circle r="32" fill="${p.accent}"/>${Array.from({ length: 12 }, (_, ray) => `<path d="M0 -42v-9" transform="rotate(${ray * 30})" stroke="${p.accent}" stroke-width="2" stroke-linecap="round"/>`).join('')}</g>` : '';
          const confetti = state.record ? Array.from({ length: 12 }, (_, bit) => `<rect x="${805 + bit * 8}" y="${264 + bit % 4 * 7}" width="3" height="6" rx="1" fill="${palette[bit % palette.length]}" transform="rotate(${bit * 17} ${805 + bit * 8} ${264 + bit % 4 * 7})"/>`).join('') : '';
          return `<g data-weather="${state.sky}" data-week="${state.column}">${animated ? visible(index ? state.time : 0, model.states[index + 1]?.time || duration, duration) : ''}${sun}${cloud}${rain}${confetti}${text(48, 282, `WEEK ${String(state.column + 1).padStart(2, '0')} / ${state.sky.toUpperCase()}`, p.muted, 10, 'class="mono"')}${text(48, 307, `${state.count.toLocaleString('en-US')} contribution${state.count === 1 ? '' : 's'}`, p.ink, 18)}${text(1072, 282, state.record ? 'A NEW WEEKLY HIGH' : `${state.active} ACTIVE DAYS`, p.muted, 10, 'text-anchor="end" class="mono"')}</g>`;
        }).join('');
        return calendarActivity(calendar, theme) + terrain + skies + weekly;
      },
    });
  },
};

export function buildMusicModel(calendar: Calendar) {
  const bars = weeks(calendar);
  const max = Math.max(1, ...bars.map(week => week.count));
  const beats = bars.map((week, index) => ({ ...week, time: 1.8 + index * .58, pitch: week.count ? Math.min(7, Math.floor(Math.log2(week.count + 1))) : 0, strength: Math.sqrt(week.count / max), notes: week.cells.filter(cell => cell.count > 0) }));
  return { beats, duration: Math.max(12, 1.8 + bars.length * .58 + 2.5) };
}
const music: SceneDefinition = {
  id: 'music', number: '15', title: 'Year in Rhythm', caption: 'A quiet score, written by your year.', category: 'Patterns',
  description: 'Weeks become beats. Actual contribution totals set each note height and pulse; active days retain their date order in each beat. This visual score is silent.',
  build(calendar) {
    const model = buildMusicModel(calendar), duration = model.duration;
    return film(calendar, music, { duration,
      events: model.beats.map(beat => ({ time: beat.time, type: beat.count ? 'beat' : 'rest', value: beat.count, data: { pitch: beat.pitch, notes: beat.notes.map(cell => ({ date: cell.date, count: cell.count })) } })),
      metrics: { beats: model.beats.length, notes: calendar.activeDays, rests: model.beats.filter(beat => !beat.count).length, audio: 'silent visual score' },
      checkpoints: [2, duration / 2, duration - 3],
      draw(theme, animated) {
        const p = THEMES[theme], pitch = 1024 / calendar.columns;
        const staff = [0, 1, 2, 3, 4].map(line => `<path d="M48 ${278 + line * 11}H1072" stroke="${p.line}"/>`).join('');
        const notes = model.beats.map(beat => {
          const x = 48 + (beat.column + .5) * pitch, y = 322 - beat.pitch * 7;
          const symbol = beat.count ? `<ellipse cx="${n(x)}" cy="${n(y)}" rx="${n(Math.min(6.5, pitch * .34))}" ry="4" transform="rotate(-20 ${n(x)} ${n(y)})" fill="${p.secondary}"/><path d="M${n(x + Math.min(6, pitch * .3))} ${n(y)}v-19" stroke="${p.secondary}" stroke-width="1.5"/>` : `<path d="M${n(x - 2)} 291h4v8h-4Z" fill="${p.muted}"/>`;
          const stem = `<rect x="${n(x - pitch * .28)}" y="${n(344 - beat.strength * 12)}" width="${n(Math.max(2, pitch * .56))}" height="${n(2 + beat.strength * 12)}" rx="2" fill="${p.colors[beat.count ? 2 : 0]}"/>`;
          const littleNotes = beat.notes.map((cell, index) => `<circle cx="${n(x - 5 + index * 1.7)}" cy="${n(357 - Math.min(6, Math.log2(cell.count + 1) * .6))}" r="1.2" fill="${p.accent}"/>`).join('');
          return `<g data-music-week="${beat.column}">${symbol}${stem}${littleNotes}${animated && beat.count ? `<g>${visible(beat.time, beat.time + .45, duration)}<circle cx="${n(x)}" cy="${n(y)}" r="12" fill="none" stroke="${p.accent}" stroke-width="1.5"/></g>` : ''}</g>`;
        }).join('');
        const playhead = `<g class="music-playhead" transform="translate(48 0)">${animated ? motion(model.beats.map(beat => ({ time: beat.time, x: 48 + (beat.column + .5) * pitch, y: 0 })), duration) : ''}<path d="M0 113v245" stroke="${p.accent}" opacity=".6"/><circle cy="112" r="3" fill="${p.accent}"/></g>`;
        return calendarActivity(calendar, theme) + staff + notes + playhead + text(48, 267, 'ONE WEEK / ONE BEAT', p.muted, 10, 'class="mono"') + text(1072, 267, 'A SILENT SCORE', p.muted, 10, 'text-anchor="end" class="mono"');
      },
    });
  },
};

export const patternsScenes: SceneDefinition[] = [life, ants, weather, music];

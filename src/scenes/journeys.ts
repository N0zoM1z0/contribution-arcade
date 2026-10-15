import type { Calendar, Cell } from '../calendar.js';
import type { SceneDefinition, SceneEvent } from './types.js';
import { THEMES, appear, calendarActivity, center, film, motion, n, text, tween, visible, weeks, type Theme } from './kit.js';

import { planCalendarMeals } from './route.js';

type Point = { x: number; y: number };
type Frame = Point & { time: number };
const DAY = 86_400_000;
const ascending = (calendar: Calendar): Cell[] => calendar.cells.filter(cell => cell.count > 0)
  .sort((a, b) => a.count - b.count || a.date.localeCompare(b.date));
const weekX = (column: number, columns: number): number => 48 + (column + 0.5) * 1024 / columns;
const tileSize = (calendar: Calendar): number => Math.min(14.5, 1024 / calendar.columns - 3);
function activityTile(calendar: Calendar, cell: Cell, theme: Theme, inside = ''): string {
  const point = center(calendar, cell), size = tileSize(calendar);
  return `<rect data-activity-date="${cell.date}" x="${n(point.x - size / 2)}" y="${n(point.y - size / 2)}" width="${n(size)}" height="${n(size)}" rx="3" fill="${THEMES[theme].colors[cell.level]}">${inside}</rect>`;
}
function weekDate(calendar: Calendar, week: { column: number; cells: Cell[] }): string {
  if (week.cells.length) return week.cells[0].date;
  const anchor = calendar.cells[0];
  const start = Date.parse(anchor.date) - (anchor.column * 7 + anchor.row) * DAY;
  return new Date(start + week.column * 7 * DAY).toISOString().slice(0, 10);
}
const tag = (cell: Cell): string => `<title>${cell.date} · ${cell.count} contributions</title>`;
const translate = (point: Point): string => `translate(${n(point.x)} ${n(point.y)})`;
function longestRun(calendar: Calendar): Cell[] {
  let current: Cell[] = [], longest: Cell[] = [];
  for (const cell of [...calendar.cells].sort((a, b) => a.date.localeCompare(b.date))) {
    const previous = current.at(-1);
    if (!cell.count) current = [];
    else {
      if (previous && Date.parse(cell.date) - Date.parse(previous.date) !== DAY) current = [];
      current.push(cell);
      if (current.length > longest.length) longest = [...current];
    }
  }
  return longest;
}
function pointAt(points: Frame[], time: number): Point {
  if (time <= points[0].time) return points[0];
  let previous = points[0];
  for (const point of points) {
    if (point.time > time) {
      const ratio = (time - previous.time) / (point.time - previous.time);
      return { x: previous.x + (point.x - previous.x) * ratio, y: previous.y + (point.y - previous.y) * ratio };
    }
    previous = point;
  }
  return previous;
}
function actor(points: Frame[], duration: number, animated: boolean, snapshot: number, body: string, extra = ''): string {
  const position = animated ? points[0] : pointAt(points, snapshot);
  return `<g transform="${translate(position)}" ${extra}>${animated ? motion(points, duration) : ''}${body}</g>`;
}
function status(frames: { time: number; label: string }[], duration: number, theme: Theme, animated: boolean, snapshot: number, x = 64, y = 345): string {
  const p = THEMES[theme];
  if (!animated) return text(x, y, [...frames].reverse().find(frame => frame.time <= snapshot)?.label || frames[0].label, p.muted, 10, 'class="mono"');
  return frames.map((frame, index) => `<g opacity="${index ? 0 : 1}">${visible(frame.time, frames[index + 1]?.time ?? duration, duration)}${text(x, y, frame.label, p.muted, 10, 'class="mono"')}</g>`).join('');
}
function summary(theme: Theme, primary: string, secondary: string): string {
  const p = THEMES[theme];
  return text(648, 406, primary, p.secondary, 12, 'font-weight="600"') + text(648, 425, secondary, p.muted, 9);
}
function starfield(theme: Theme): string {
  const p = THEMES[theme];
  return `<g fill="${p.muted}" opacity=".28">${Array.from({ length: 25 }, (_, i) => `<circle cx="${64 + (i * 137) % 984}" cy="${277 + (i * 43) % 48}" r="${i % 7 ? 0.75 : 1.4}"/>`).join('')}</g>`;
}
function ship(theme: Theme, sideways = false): string {
  const p = THEMES[theme];
  return sideways
    ? `<path d="M-15-7L9-7L22 0L9 7H-15L-7 0Z" fill="${p.secondary}"/><path d="M-4-12L7-6H-7ZM-4 12L7 6H-7Z" fill="${p.accent}"/><circle cx="8" r="3" fill="${p.background}"/><path d="M-18-3L-26 0L-18 3" fill="${p.accent}"/>`
    : `<path d="M0-15L7-3L18 4V9H-18V4L-7-3Z" fill="${p.secondary}"/><rect x="-3" y="-5" width="6" height="7" rx="2" fill="${p.background}"/><path d="M-7 12L0 19L7 12" fill="${p.accent}"/>`;
}

/** Only the selected invader leaves its original tile for the interception lane. */
export function invaderSway(time: number): number {
  const phase = time % 8;
  return phase < 2 ? phase * 4 : phase < 6 ? 16 - phase * 4 : phase * 4 - 32;
}
function swayFrames(duration: number): { time: number; value: number }[] {
  return Array.from({ length: Math.floor(duration / 2) + 1 }, (_, i) => ({ time: i * 2, value: invaderSway(i * 2) }));
}
export function modelInvaders(calendar: Calendar) {
  const cells = ascending(calendar);
  const gap = Math.max(0.16, 20 / Math.max(1, cells.length));
  const targets = cells.map((cell, index) => {
    const fire = 1.4 + index * gap, hit = fire + Math.min(0.15, gap * 0.6);
    const { x, y: homeY } = center(calendar, cell);
    // Each target dives below the formation before it is fired upon. The laser
    // cannot pass through another date's invader on its way to the interception.
    return { ...cell, fire, hit, x, homeY, y: 278, aimX: x + invaderSway(hit) };
  });
  const run = longestRun(calendar);
  const bossStart = (targets.at(-1)?.hit ?? 1) + 1.2;
  const boss = run.length >= 7 ? { start: bossStart, date: run.at(-1)!.date, streak: run.length,
    hits: Array.from({ length: Math.min(7, Math.ceil(run.length / 7)) }, (_, i) => ({ fire: bossStart + 1 + i * 0.65, hit: bossStart + 1.4 + i * 0.65 })) } : undefined;
  const duration = Math.max(26, (boss?.hits.at(-1)?.hit ?? targets.at(-1)?.hit ?? 0) + 3);
  const points: Frame[] = [{ time: 0, x: 560, y: 318 }];
  const events: SceneEvent[] = [];
  for (const target of targets) {
    points.push({ time: target.fire, x: target.aimX, y: 318 }, { time: target.hit, x: target.aimX, y: 318 });
    events.push({ time: target.fire - 0.08, type: 'invader-dive', date: target.date, data: { fromY: target.homeY, toY: target.y } },
      { time: target.fire, type: 'ship-fire', date: target.date, value: target.count, data: { x: target.aimX, y: 303, hitTime: target.hit, targetX: target.aimX, targetY: target.y } },
      { time: target.hit, type: 'invader-hit', date: target.date, value: target.count, data: { x: target.aimX, y: target.y, removed: true } });
  }
  if (boss) {
    events.push({ time: boss.start, type: 'boss-arrive', date: boss.date, value: boss.streak, data: { threshold: 7, shields: boss.hits.length, streakDates: run.map(cell => cell.date) } });
    boss.hits.forEach((hit, index) => {
      points.push({ time: hit.fire, x: 560 + invaderSway(hit.hit) * 12, y: 318 }, { time: hit.hit, x: 560 + invaderSway(hit.hit) * 12, y: 318 });
      events.push({ time: hit.fire, type: 'boss-fire', date: boss.date, data: { x: 560 + invaderSway(hit.hit) * 12, y: 303, targetY: 278, hitTime: hit.hit } },
        { time: hit.hit, type: index === boss.hits.length - 1 ? 'boss-defeated' : 'boss-hit', date: boss.date, value: boss.hits.length - index - 1 });
    });
  }
  return { targets, boss, points, duration, events };
}
const invaders: SceneDefinition = {
  id: 'invaders', number: '07', title: 'Space Invaders', category: 'Journeys',
  caption: 'A quiet sky. A very busy defense.',
  description: 'The ship fires at real contribution dates in ascending count order. Invaders disappear only on projectile impact. A streak of seven consecutive active dates unlocks a boss.',
  build(calendar) {
    const model = modelInvaders(calendar), { duration, targets, boss } = model;
    const snapshot = targets.length ? targets[Math.floor(targets.length * 0.36)].fire : 0;
    const messages = [{ time: 0, label: targets.length ? `DEFENSE ONLINE  /  ${targets.length} DATE TARGETS` : 'CLEAR SKIES  /  NO ACTIVE DATES' },
      ...targets.map((target, index) => ({ time: target.hit, label: `${String(index + 1).padStart(3, '0')} / ${targets.length} CLEARED  ·  ${target.date}  ·  ${target.count} CONTRIBUTIONS` })),
      ...(boss ? [{ time: boss.start, label: `STREAK BOSS  /  ${boss.streak} CONSECUTIVE DAYS` }, { time: boss.hits.at(-1)!.hit, label: 'SECTOR CLEAR  /  STREAK BOSS DEFEATED' }] : [])];
    return film(calendar, invaders, { duration, events: model.events,
      metrics: { targets: targets.length, hits: targets.length, contributions: targets.reduce((sum, target) => sum + target.count, 0), boss: boss ? 1 : 0, bossStreak: boss?.streak ?? 0, ordering: 'count-ascending' },
      checkpoints: [1, targets[Math.floor(targets.length / 2)]?.hit ?? 9, boss ? boss.start + 0.6 : duration - 2],
      draw(theme, animated) {
        const p = THEMES[theme], size = Math.min(8, tileSize(calendar) * 0.66);
        const formation = targets.map(target => {
          if (!animated && target.hit <= snapshot) return '';
          const dive = [{ time: 0, x: 0, y: 0 }, { time: target.fire - 0.08, x: 0, y: 0 }, { time: target.fire, x: target.aimX - target.x, y: target.y - target.homeY }];
          return activityTile(calendar, target, theme, animated ? visible(0, target.hit, duration) : '') + `<g transform="translate(${n(target.x)} ${n(target.homeY)})" data-invader-home="${target.date}" data-date="${target.date}" data-count="${target.count}">${tag(target)}<g fill="${p.ink}" opacity=".65">${animated ? visible(0, target.hit, duration) + motion(dive, duration) : ''}<path transform="scale(${n(size / 12)})" d="M-5-4H-2V-6H2V-4H5V-1H7V3H4V5H2V2H-2V5H-4V3H-7V-1H-5ZM-3-1V1H-1V-1ZM1-1V1H3V-1Z" fill-rule="evenodd"/></g></g>`;
        }).join('');
        let result = starfield(theme) + text(64, 260, 'ORBITAL DEFENSE', p.muted, 9, 'class="mono" letter-spacing="2"');
        result += formation;
        if (animated) result += targets.map(target => `<g opacity="0">${visible(target.fire, target.hit, duration)}${actor([{ time: target.fire, x: target.aimX, y: 303 }, { time: target.hit, x: target.aimX, y: target.y }], duration, true, snapshot, `<rect x="-1" y="-7" width="2" height="9" rx="1" fill="${p.accent}"/>`)}</g><g transform="translate(${n(target.aimX)} ${target.y})" opacity="0">${visible(target.hit, target.hit + Math.min(gapFor(targets) * 0.75, 0.16), duration)}<path d="M-7-7L7 7M7-7L-7 7M-10 0H10M0-10V10" stroke="${p.accent}" stroke-width="1.5"/></g>`).join('');
        if (boss && animated) {
          const end = boss.hits.at(-1)!.hit;
          result += `<g opacity="0">${visible(boss.start, end, duration)}<g transform="translate(560 278)">${motion(swayFrames(duration).map(frame => ({ time: frame.time, x: 560 + frame.value * 12, y: 278 })), duration)}<path d="M-34-9L-19-22H19L34-9L45 0L34 9H-34L-45 0Z" fill="${p.accent}"/><path d="M-16-11H16L24-2H-24Z" fill="${p.background}"/><circle cx="-12" cy="13" r="3" fill="${p.secondary}"/><circle cx="12" cy="13" r="3" fill="${p.secondary}"/></g></g>`;
          result += boss.hits.map(hit => `<g opacity="0">${visible(hit.fire, hit.hit, duration)}${actor([{ time: hit.fire, x: 560 + invaderSway(hit.hit) * 12, y: 303 }, { time: hit.hit, x: 560 + invaderSway(hit.hit) * 12, y: 278 }], duration, true, snapshot, `<rect x="-2" y="-9" width="4" height="12" rx="2" fill="${p.accent}"/>`)}</g>`).join('');
        }
        result += `<path d="M64 331H1056" stroke="${p.line}" stroke-dasharray="2 7"/>` + actor(model.points, duration, animated, snapshot, ship(theme), 'data-actor="defense-ship"');
        return result + status(messages, duration, theme, animated, snapshot, 64, 362);
      }, footer: theme => summary(theme, `${targets.length} date targets · ${boss ? 'streak boss' : 'open sky'}`, 'Exact counts · lower contributions first'),
    });
  },
};
function gapFor(targets: { fire: number }[]): number { return targets.length > 1 ? targets[1].fire - targets[0].fire : 0.2; }

export type Season = 'WINTER' | 'SPRING' | 'SUMMER' | 'AUTUMN';
export function seasonFor(date: string): Season {
  const month = Number(date.slice(5, 7));
  return month < 3 || month === 12 ? 'WINTER' : month < 6 ? 'SPRING' : month < 9 ? 'SUMMER' : 'AUTUMN';
}
export function modelTrain(calendar: Calendar) {
  let clock = 0.8;
  const events: SceneEvent[] = [], points: Frame[] = [];
  const stations = weeks(calendar).map((week, index) => {
    const point = { x: weekX(index, calendar.columns), y: 314 + Math.sin(index * 0.57) * 6 };
    const date = weekDate(calendar, week);
    const season = seasonFor(date), arrive = clock;
    const stop = week.count > 0 ? 0.34 + Math.min(0.26, week.active * 0.035) : 0;
    const depart = arrive + stop;
    points.push({ time: arrive, ...point });
    if (stop) points.push({ time: depart, ...point });
    events.push({ time: arrive, type: stop ? 'station-stop' : 'week-pass', date, value: week.count, data: { column: index, activeDays: week.active, arrive, depart } });
    if (index === 0 || season !== seasonFor(weekDate(calendar, weeks(calendar)[index - 1]))) events.push({ time: arrive, type: 'season-change', date, data: { season, hemisphere: 'northern' } });
    if (index < calendar.columns - 1) events.push({ time: depart, type: 'train-depart', date, data: { column: index, nextColumn: index + 1 } });
    clock = depart + 0.36;
    return { ...week, ...point, date, season, arrive, depart };
  });
  return { stations, points, events, duration: Math.max(18, clock + 2) };
}
const train: SceneDefinition = {
  id: 'train', number: '08', title: 'Train', category: 'Journeys',
  caption: 'Every week, another little station.',
  description: 'A train follows the weeks chronologically, stopping only at stations with actual contributions. Landscape seasons follow calendar months in the northern hemisphere.',
  build(calendar) {
    const model = modelTrain(calendar), { stations, duration } = model, snapshot = duration * 0.5;
    const colors: Record<Season, [string, string]> = { WINTER: ['#bacbc6', '#d7e0d4'], SPRING: ['#9dbb96', '#c4d8b8'], SUMMER: ['#779d79', '#b5cca1'], AUTUMN: ['#c29a73', '#d9c3a0'] };
    return film(calendar, train, { duration, events: model.events,
      metrics: { weeks: stations.length, stops: stations.filter(station => station.count > 0).length, contributions: stations.reduce((sum, station) => sum + station.count, 0), seasonChanges: model.events.filter(event => event.type === 'season-change').length },
      checkpoints: [1.2, stations[Math.floor(stations.length / 2)].arrive, Math.max(2, duration - 3)],
      draw(theme, animated) {
        const p = THEMES[theme], current = [...stations].reverse().find(station => station.arrive <= snapshot) ?? stations[0];
        const route = stations.map(station => `${n(station.x)},${n(station.y)}`).join(' ');
        const seasonFrames = stations.map(station => ({ time: station.arrive, value: colors[station.season][0] }));
        let result = calendarActivity(calendar, theme) + `<g data-journey-ribbon="train"><path d="M48 306Q170 274 290 300T560 290T820 302T1072 288V330H48Z" fill="${colors[current.season][0]}" opacity=".18">${animated ? tween('fill', seasonFrames, duration, 'discrete') : ''}</path><path d="M48 318Q260 286 480 312T880 304T1072 307V332H48Z" fill="${colors[current.season][1]}" opacity=".25"/>`;
        result += `<circle cx="1004" cy="283" r="8" fill="${p.accent}" opacity=".55"/><path d="M62 333H1058" stroke="${p.line}"/><polyline points="${route}" fill="none" stroke="${p.line}" stroke-width="9"/><polyline points="${route}" fill="none" stroke="${p.muted}" stroke-width="2" stroke-dasharray="2 5"/>`;
        result += stations.map(station => {
          const active = station.count > 0, radius = active ? Math.min(9, 3 + Math.sqrt(station.count) * 0.5) : 2;
          return `<g data-week="${station.column}" data-count="${station.count}"><title>Week of ${station.date}: ${station.count} contributions${active ? ' · scheduled stop' : ' · passing through'}</title>${active ? `<path d="M${n(station.x)} ${n(station.y - 5)}V${n(station.y - 31)}" stroke="${p.muted}"/><path d="M${n(station.x - 5)} ${n(station.y - 27)}L${n(station.x)} ${n(station.y - 33)}L${n(station.x + 5)} ${n(station.y - 27)}Z" fill="${p.accent}"/><rect x="${n(station.x - 4)}" y="${n(station.y - 27)}" width="8" height="11" rx="1.5" fill="${p.secondary}"/>` : ''}<circle cx="${n(station.x)}" cy="${n(station.y)}" r="${n(radius)}" fill="${active ? p.secondary : p.empty}" stroke="${p.background}" stroke-width="2"/>${active && animated ? `<circle cx="${n(station.x)}" cy="${n(station.y)}" r="${n(radius + 5)}" fill="none" stroke="${p.accent}" stroke-width="2" opacity="0">${visible(station.arrive, station.depart, duration)}</circle>` : ''}</g>`;
        }).join('');
        const locomotive = `<rect x="-21" y="-17" width="32" height="15" rx="3" fill="${p.secondary}"/><path d="M11-12H25V-2H11Z" fill="${p.accent}"/><rect x="-18" y="-25" width="16" height="13" rx="2" fill="${p.secondary}"/><rect x="-14" y="-22" width="8" height="7" rx="1" fill="${p.background}"/><rect x="14" y="-23" width="6" height="12" rx="1" fill="${p.ink}"/>${[-12, 5, 18].map(x => `<circle cx="${x}" cy="0" r="4" fill="${p.background}" stroke="${p.accent}" stroke-width="2"/>`).join('')}<path d="M-23-4H-47V-17H-23Z" fill="${p.secondary}" opacity=".7"/><path d="M-27-12H-42" stroke="${p.background}" stroke-width="4"/><circle cx="-40" cy="0" r="4" fill="${p.background}" stroke="${p.accent}" stroke-width="2"/><circle cx="-28" cy="0" r="4" fill="${p.background}" stroke="${p.accent}" stroke-width="2"/>`;
        result += actor(model.points, duration, animated, snapshot, locomotive, 'data-actor="train"');
        const seasonEvents = model.events.filter(event => event.type === 'season-change').map(event => ({ time: event.time, label: `${event.data!.season}  /  NORTHERN SEASONS` }));
        result += status([{ time: 0, label: 'THE WEEKLY LOCAL  /  READY TO DEPART' }, ...stations.map(station => ({ time: station.arrive, label: `WEEK ${String(station.column + 1).padStart(2, '0')}  ·  ${station.date}  ·  ${station.count} CONTRIBUTIONS  /  ${station.count ? 'STATION STOP' : 'PASSING THROUGH'}` }))], duration, theme, animated, snapshot, 64, 353);
        return result + '</g>' + status([{ time: 0, label: `${stations[0].season}  /  NORTHERN SEASONS` }, ...seasonEvents.filter(event => event.time > 0)], duration, theme, animated, snapshot, 64, 263);
      }, footer: theme => summary(theme, `${stations.filter(station => station.count).length} active stations · ${stations.length} weeks`, 'A stop for every active week'),
    });
  },
};

export function oreTier(count: number): 'quartz' | 'copper' | 'gold' | 'diamond' {
  return count >= 30 ? 'diamond' : count >= 10 ? 'gold' : count >= 3 ? 'copper' : 'quartz';
}
export function modelArchaeology(calendar: Calendar) {
  const cells = ascending(calendar), gap = Math.max(0.25, 21 / Math.max(1, cells.length));
  const points: Frame[] = [{ time: 0, x: 64, y: 265 }], events: SceneEvent[] = [];
  const deposits = cells.map((cell, index) => {
    const start = 1 + index * gap, { x, y } = center(calendar, cell);
    const dig = start + gap * 0.48, leave = start + gap * 0.8;
    points.push({ time: start, x, y: 265 }, { time: dig, x, y }, { time: dig + gap * 0.13, x, y }, { time: leave, x, y: 265 });
    const tier = oreTier(cell.count);
    events.push({ time: start, type: 'shaft-enter', date: cell.date, data: { column: cell.column, row: cell.row, x, y } },
      { time: dig, type: 'ore-excavate', date: cell.date, value: cell.count, data: { tier, x, y, removed: true } });
    return { ...cell, x, y, tier, start, dig, leave };
  });
  const run = longestRun(calendar);
  const treasure = run.length >= 5 ? { date: run.at(-1)!.date, streak: run.length,
    time: Math.max(...run.map(cell => deposits.find(deposit => deposit.date === cell.date)!.dig)) + gap * 0.15,
    ...center(calendar, run.at(-1)!) } : undefined;
  if (treasure) events.push({ time: treasure.time, type: 'treasure-unlock', date: treasure.date, value: treasure.streak, data: { threshold: 5, streakDates: run.map(cell => cell.date) } });
  return { deposits, points, treasure, events, duration: Math.max(26, (deposits.at(-1)?.leave ?? 0) + 3) };
}
const archaeology: SceneDefinition = {
  id: 'archaeology', number: '10', title: 'Archaeology', category: 'Journeys',
  caption: 'A small pickaxe. A year of buried treasure.',
  description: 'The miner excavates real dates in ascending contribution-count order. Counts set quartz, copper, gold and diamond tiers. Excavating a consecutive five-day streak reveals a treasure chest.',
  build(calendar) {
    const model = modelArchaeology(calendar), { deposits, treasure, duration } = model, snapshot = duration * 0.46;
    return film(calendar, archaeology, { duration, events: model.events,
      metrics: { excavations: deposits.length, ore: deposits.reduce((sum, deposit) => sum + deposit.count, 0), treasure: treasure ? 1 : 0, treasureStreak: treasure?.streak ?? 0, ordering: 'count-ascending' },
      checkpoints: [1.8, deposits[Math.floor(deposits.length / 2)]?.dig ?? 12, treasure?.time ?? duration - 2],
      draw(theme, animated) {
        const p = THEMES[theme];
        let result = `<g data-excavation-shafts="true" fill="none" stroke="${p.muted}" stroke-width=".7" stroke-dasharray="1 3" opacity=".2">${deposits.map(deposit => animated || deposit.start <= snapshot ? `<path d="M${n(deposit.x)} 265V${n(deposit.y)}" opacity="${animated ? 0 : 1}">${animated ? appear(deposit.start, duration) : ''}</path>` : '').join('')}</g>`;
        result += deposits.map(deposit => {
          if (!animated && deposit.dig <= snapshot) return '';
          const facets = { quartz: 'M-2-1H2M0-3V1', copper: 'M-2-2L2 2M2-2L-2 2', gold: 'M-3 0H3M0-3V3M-2-2L2 2', diamond: 'M-3-1L0-3L3-1L0 3Z' };
          return activityTile(calendar, deposit, theme, animated ? visible(0, deposit.dig, duration) : '') + `<g transform="translate(${n(deposit.x)} ${n(deposit.y)})" data-date="${deposit.date}" data-tier="${deposit.tier}" data-count="${deposit.count}" opacity="1">${tag(deposit)}${animated ? visible(0, deposit.dig, duration) : ''}<path d="${facets[deposit.tier]}" fill="none" stroke="${p.ink}" stroke-width=".8" opacity=".55"/></g>`;
        }).join('');
        if (treasure && (animated || treasure.time <= snapshot)) result += `<g data-treasure-date="${treasure.date}" transform="translate(${n(treasure.x)} ${n(treasure.y)})" opacity="${animated ? 0 : 1}">${animated ? appear(treasure.time, duration) : ''}<rect x="-5" y="-4" width="10" height="8" rx="1.5" fill="${p.accent}" stroke="${p.background}"/><path d="M-5 0H5M0-4V4" stroke="${p.background}" stroke-width="1"/></g>`;
        const miner = `<circle cy="-7" r="4" fill="${p.accent}"/><path d="M-6-10Q0-18 6-10Z" fill="${p.secondary}"/><rect x="4" y="-12" width="4" height="3" rx="1" fill="${p.accent}"/><path d="M0-2V7M0 1L8-2M0 7L-5 12M0 7L5 12" stroke="${p.ink}" stroke-width="3" stroke-linecap="round"/><path d="M8-7L14 4M7-7Q13-11 18-5" stroke="${p.accent}" stroke-width="2" stroke-linecap="round"/>`;
        result += actor(model.points, duration, animated && deposits.length > 0, snapshot, `<g transform="scale(.52)">${miner}</g>`, 'data-actor="miner"');
        result += status([{ time: 0, label: deposits.length ? 'PICKAXE READY  /  LOW COUNTS FIRST' : 'UNDISTURBED EARTH  /  NO ACTIVE DATES' }, ...deposits.map((deposit, index) => ({ time: deposit.dig, label: `${index + 1}/${deposits.length} DATES EXCAVATED  ·  ${deposit.date}  ·  ${deposit.count} ${deposit.tier.toUpperCase()} ORE` }))], duration, theme, animated, snapshot, 64, 345);
        result += text(1056, 286, 'ORE FACETS: 1 QUARTZ / 3 COPPER / 10 GOLD / 30 DIAMOND', p.muted, 8, 'class="mono" text-anchor="end"');
        return result + text(64, 286, 'THE CONTRIBUTION STRATA', p.muted, 9, 'class="mono" letter-spacing="2"');
      }, footer: theme => summary(theme, `${deposits.length} excavations · ${treasure ? 'streak treasure' : 'ore survey'}`, 'A real date beneath every deposit'),
    });
  },
};

export function modelDungeon(calendar: Calendar) {
  const active = [...calendar.cells].filter(cell => cell.count > 0).sort((a, b) => a.date.localeCompare(b.date));
  const rooms = new Map(active.map(cell => [`${cell.column},${cell.row}`, cell]));
  const existing = new Set(calendar.cells.map(cell => `${cell.column},${cell.row}`));
  const events: SceneEvent[] = [], visited = new Set<string>(), revealed = new Map<string, number>(), looted = new Set<string>();
  const route: { column: number; row: number; time: number }[] = [{ column: 0, row: 7, time: 0.8 }];
  const step = Math.max(0.055, 22 / Math.max(1, calendar.columns * 12));
  const loot: Cell[] = [];
  const enter = (column: number, row: number, time: number, collect = false) => {
    const key = `${column},${row}`;
    for (const [dc, dr] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const c = column + dc, r = row + dr, fogKey = `${c},${r}`;
      if (!existing.has(fogKey) || revealed.has(fogKey)) continue;
      revealed.set(fogKey, time);
      events.push({ time, type: 'fog-reveal', data: { column: c, row: r } });
    }
    if (!visited.has(key)) events.push({ time, type: 'room-enter', data: { column, row, active: rooms.has(key) } });
    visited.add(key);
    const cell = rooms.get(key);
    if (collect && cell && !looted.has(key)) {
      loot.push(cell); looted.add(key);
      events.push({ time, type: 'room-loot', date: cell.date, value: cell.count, data: { column, row } });
    }
  };
  const walkTo = (column: number, row: number) => {
    let current = route.at(-1)!;
    while (current.column !== column || current.row !== row) {
      const next = current.column !== column ? { column: current.column + Math.sign(column - current.column), row: current.row } : { column, row: current.row + Math.sign(row - current.row) };
      current = { ...next, time: current.time + step };
      route.push(current); enter(current.column, current.row, current.time);
    }
  };
  if (active.length) {
    enter(0, 7, 0.8);
    for (const move of planCalendarMeals(calendar, { column: 0, row: 7 }, 8)) {
      const point = { column: move.column, row: move.row, time: route.at(-1)!.time + step };
      route.push(point); enter(point.column, point.row, point.time, !!move.meal);
    }
  }
  const guardian = active.length ? [...active].sort((a, b) => b.count - a.count || b.date.localeCompare(a.date))[0] : undefined;
  let encounter: { start: number; end: number; hp: number; cell: Cell; attacks: { time: number; damage: number; hp: number; sourceDate: string }[] } | undefined;
  if (guardian) {
    walkTo(guardian.column, guardian.row);
    const start = route.at(-1)!.time + 0.8, attacks: { time: number; damage: number; hp: number; sourceDate: string }[] = [];
    let hp = guardian.count, time = start + 0.8;
    events.push({ time: start, type: 'encounter-start', date: guardian.date, value: hp, data: { column: guardian.column, row: guardian.row, collectedRooms: loot.length } });
    for (const source of [...loot].sort((a, b) => b.count - a.count || a.date.localeCompare(b.date))) {
      if (!hp) break;
      let charge = source.count;
      while (hp && charge) {
        const damage = Math.min(hp, charge, Math.max(1, Math.ceil(guardian.count / 4)));
        hp -= damage; charge -= damage;
        attacks.push({ time, damage, hp, sourceDate: source.date });
        events.push({ time, type: 'guardian-hit', date: guardian.date, value: damage, data: { hp, sourceDate: source.date, sourceCount: source.count, sourceRemaining: charge } });
        time += 0.6;
      }
    }
    events.push({ time, type: 'encounter-defeated', date: guardian.date, value: guardian.count });
    encounter = { start, end: time, hp: guardian.count, cell: guardian, attacks };
  }
  const duration = Math.max(26, (encounter?.end ?? 0) + 3);
  return { active, route, revealed: [...revealed].map(([key, time]) => { const [column, row] = key.split(',').map(Number); return { column, row, time }; }), loot, encounter, events, duration };
}
const dungeon: SceneDefinition = {
  id: 'dungeon', number: '14', title: 'Dungeon', category: 'Journeys',
  caption: 'Light a room. Find the next door.',
  description: 'Dates keep their calendar rooms. The hero plans adjacent routes to collect the smallest remaining contribution counts first; larger rooms stay dormant until their turn. Collected activity defeats a final guardian.',
  build(calendar) {
    const model = modelDungeon(calendar), { duration, encounter } = model, snapshot = model.route.at(-1)!.time * 0.68;
    const location = (column: number, row: number) => center(calendar, { column, row });
    const points = model.route.map(point => ({ time: point.time, ...location(point.column, point.row) }));
    const size = tileSize(calendar);
    return film(calendar, dungeon, { duration, events: model.events,
      metrics: { rooms: model.active.length, collectedRooms: model.loot.length, loot: model.loot.reduce((sum, cell) => sum + cell.count, 0), revealed: model.revealed.length, steps: model.route.length - 1, guardianHealth: encounter?.hp ?? 0, finalEncounter: encounter ? 1 : 0, ordering: 'count-ascending', layout: 'calendar' },
      checkpoints: [1.4, model.route[Math.floor(model.route.length * 0.6)].time, encounter ? encounter.start + 0.4 : 18],
      draw(theme, animated) {
        const p = THEMES[theme];
        let result = text(64, 285, 'THE ROOMS BETWEEN COMMITS', p.muted, 9, 'class="mono" letter-spacing="2"');
        const revealMap = new Map(model.revealed.map(reveal => [`${reveal.column},${reveal.row}`, reveal.time]));
        result += calendar.cells.map(cell => {
          const { column, row } = cell, point = location(column, row), key = `${column},${row}`;
          const reveal = revealMap.get(key), lootTime = model.events.find(event => event.type === 'room-loot' && event.date === cell.date)?.time;
          const isVisible = reveal !== undefined && reveal <= snapshot;
          let room = cell.count && (animated || lootTime === undefined || lootTime > snapshot) ? activityTile(calendar, cell, theme, animated && lootTime !== undefined ? visible(0, lootTime, duration) : '') : '';
          if (cell.count) room += `<g data-room-loot="${cell.date}" data-eaten-at="${n(lootTime ?? duration)}" opacity="1">${animated && lootTime !== undefined ? visible(0, lootTime, duration) : ''}${!animated && lootTime !== undefined && lootTime <= snapshot ? '' : `<path d="M${n(point.x)} ${n(point.y - 2)}l2 2-2 2-2-2Z" fill="${p.ink}" opacity=".6"/>`}</g>`;
          return `<g data-room="${key}" data-date="${cell.date}" data-count="${cell.count}" data-room-x="${n(point.x)}" data-room-y="${n(point.y)}">${tag(cell)}${room}<g opacity=".6"><rect data-room-fog="${cell.date}" x="${n(point.x - size / 2)}" y="${n(point.y - size / 2)}" width="${n(size)}" height="${n(size)}" rx="3" fill="${p.background}" opacity="${animated || !isVisible ? 1 : 0}">${animated && reveal !== undefined ? visible(0, reveal, duration) : ''}</rect></g></g>`;
        }).join('');
        result += `<polyline points="${model.route.filter((_, index) => index <= Math.floor(model.route.length * 0.68)).map(point => { const p = location(point.column, point.row); return `${n(p.x)},${p.y}`; }).join(' ')}" fill="none" stroke="${p.accent}" stroke-width="1" opacity="${animated ? 0 : 0.3}"/>`;
        const hero = `<path d="M-5-2H5V7H-5Z" fill="${p.accent}"/><circle cy="-6" r="4" fill="${p.secondary}"/><path d="M-4 8L-6 12M4 8L6 12" stroke="${p.secondary}" stroke-width="2"/><path d="M8-10V5M5-6H11" stroke="${p.ink}" stroke-width="2"/><path d="M-9-1L-5 1V7L-9 10L-13 7V1Z" fill="${p.secondary}"/>`;
        result += actor(points, duration, animated && model.active.length > 0, snapshot, `<g transform="scale(.52)">${hero}</g>`, 'data-actor="hero"');
        if (encounter && animated) {
          const point = location(encounter.cell.column, encounter.cell.row);
          result += `<g opacity="0">${visible(encounter.start, encounter.end, duration)}<g transform="translate(${n(point.x)} ${n(point.y - 6)}) scale(.6)"><path d="M-14-5L-7-12L0-6L7-12L14-5L10 8H-10Z" fill="${p.accent}"/><path d="M-7-2H-3M3-2H7" stroke="${p.background}" stroke-width="2"/></g></g>`;
          result += status([{ time: 0, label: '' }, { time: encounter.start, label: `FINAL GUARDIAN  ·  ${encounter.cell.date}  ·  ${encounter.hp} HEALTH` }, ...encounter.attacks.map(attack => ({ time: attack.time, label: `ACTIVITY STRIKE −${attack.damage}  /  ${attack.hp} GUARDIAN HEALTH` })), { time: encounter.end, label: 'GUARDIAN DEFEATED  /  EVERY ROOM ACCOUNTED FOR' }], duration, theme, true, snapshot, 1056, 285).replaceAll('class="mono"', 'class="mono" text-anchor="end"');
        }
        result += status([{ time: 0, label: model.active.length ? 'ENTER THE FOG  /  EACH DOOR IS A NEW DATE' : 'THE DUNGEON RESTS  /  NO ACTIVE ROOMS' }, ...model.events.filter(event => event.type === 'room-loot').map((event, index) => ({ time: event.time, label: `${index + 1}/${model.active.length} ROOMS COLLECTED  ·  ${event.date}  ·  +${event.value} ACTIVITY` }))], duration, theme, animated, snapshot, 64, 345);
        return result;
      }, footer: theme => summary(theme, `${model.active.length} rooms · ${model.route.length - 1} steps`, encounter ? `${encounter.hp} health guardian · activity pays for victory` : 'The unlit corridors are waiting'),
    });
  },
};

export function modelSpaceRoute(calendar: Calendar) {
  const planets = weeks(calendar).map((week, index) => ({ ...week, date: weekDate(calendar, week), x: weekX(index, calendar.columns), y: 314 + Math.sin(index * 0.63) * 7 }));
  const stations = planets.filter(planet => planet.count > 0), events: SceneEvent[] = [], points: Frame[] = [];
  let time = 1, fuel = 0;
  stations.forEach((station, index) => {
    if (!index) {
      points.push({ time: 0, x: station.x, y: station.y - 23 });
      events.push({ time, type: 'ship-launch', date: station.date, data: { column: station.column } });
    } else {
      const previous = stations[index - 1], depart = time + 0.25;
      fuel -= 1;
      events.push({ time: depart, type: 'jump-depart', date: previous.date, value: 1, data: { from: previous.column, to: station.column, fuel } });
      points.push({ time: depart, x: previous.x, y: previous.y - 23 });
      const travel = 0.7 + (station.column - previous.column) * 0.16;
      for (let column = previous.column + 1; column <= station.column; column++) {
        const planet = planets[column], arrive = depart + travel * (column - previous.column) / (station.column - previous.column);
        points.push({ time: arrive, x: planet.x, y: planet.y - 23 });
        events.push({ time: arrive, type: column === station.column ? 'planet-arrive' : 'planet-flyby', date: planet.date, value: planet.count, data: { column, fuel } });
      }
      time = depart + travel;
    }
    fuel += station.count;
    events.push({ time, type: 'station-refuel', date: station.date, value: station.count, data: { column: station.column, fuel, activeDays: station.active } });
    points.push({ time: time + 0.6, x: station.x, y: station.y - 23 });
    time += 0.6;
  });
  if (!points.length) points.push({ time: 0, x: planets[0].x, y: planets[0].y - 23 });
  return { planets, stations, events, points, fuel, burned: Math.max(0, stations.length - 1), duration: Math.max(26, time + 3) };
}
const spaceRoute: SceneDefinition = {
  id: 'space-route', number: '16', title: 'Space Route', category: 'Journeys',
  caption: 'One small ship. A constellation of weeks.',
  description: 'Every week is a planet. The ship docks at active weeks in chronological order and flies past intervening quiet planets. Each actual contribution adds one fuel; each station-to-station jump spends one fuel.',
  build(calendar) {
    const model = modelSpaceRoute(calendar), { duration, planets, stations } = model, snapshot = duration * 0.46;
    return film(calendar, spaceRoute, { duration, events: model.events,
      metrics: { planets: planets.length, stations: stations.length, refueled: stations.reduce((sum, station) => sum + station.count, 0), fuelBurned: model.burned, fuelRemaining: model.fuel, fuelPerJump: 1 },
      checkpoints: [1.4, model.points[Math.floor(model.points.length / 2)].time, duration - 2],
      draw(theme, animated) {
        const p = THEMES[theme], visited = new Map<number, number>();
        for (const event of model.events.filter(event => ['ship-launch', 'planet-arrive', 'planet-flyby'].includes(event.type))) visited.set(Number(event.data!.column), event.time);
        let result = calendarActivity(calendar, theme) + text(64, 263, 'THE WEEKLY CONSTELLATION', p.muted, 9, 'class="mono" letter-spacing="2"') + '<g data-journey-ribbon="space-route">' + starfield(theme);
        result += `<polyline points="${planets.map(planet => `${n(planet.x)},${n(planet.y)}`).join(' ')}" fill="none" stroke="${p.line}" stroke-width="1" stroke-dasharray="3 6"/>`;
        result += planets.map(planet => {
          const radius = planet.count ? Math.min(8, 3 + Math.sqrt(planet.count) * 0.3) : 2;
          const time = visited.get(planet.column), highlight = time !== undefined && (animated || time <= snapshot);
          return `<g data-week="${planet.column}" data-count="${planet.count}"><title>Week of ${planet.date} · ${planet.count} contributions · ${planet.count ? 'fuel station' : 'quiet planet'}</title>${planet.count ? `<ellipse cx="${n(planet.x)}" cy="${n(planet.y)}" rx="${n(radius + 4)}" ry="${n(radius * 0.43)}" transform="rotate(-24 ${n(planet.x)} ${n(planet.y)})" fill="none" stroke="${p.accent}" opacity=".55"/>` : ''}<circle cx="${n(planet.x)}" cy="${n(planet.y)}" r="${n(radius)}" fill="${planet.count ? p.secondary : p.empty}" stroke="${p.border}"/><path d="M${n(planet.x - radius * 0.6)} ${n(planet.y - radius * 0.35)}q${n(radius * 0.5)} ${n(-radius * 0.5)} ${n(radius)} ${n(-radius * 0.2)}" stroke="${p.background}" stroke-width="1" opacity=".45" fill="none"/>${highlight ? `<circle cx="${n(planet.x)}" cy="${n(planet.y)}" r="${n(radius + 6)}" stroke="${p.secondary}" stroke-width="1" fill="none" opacity="${animated ? 0 : 0.45}">${animated ? appear(time!, duration) : ''}</circle>` : ''}${planet.count && calendar.columns <= 18 ? text(planet.x, planet.y + radius + 15, `+${planet.count}`, p.muted, 9, 'text-anchor="middle" class="mono"') : ''}</g>`;
        }).join('');
        if (animated) result += model.events.filter(event => event.type === 'station-refuel').map(event => {
          const planet = planets[Number(event.data!.column)];
          return `<g opacity="0">${visible(event.time, event.time + 0.6, duration)}<path d="M${n(planet.x)} ${n(planet.y - 4)}V${n(planet.y - 23)}" stroke="${p.accent}" stroke-width="2" stroke-dasharray="2 3"/>${text(planet.x + 20, planet.y - 27, `+${event.value} FUEL`, p.accent, 10, 'class="mono"')}</g>`;
        }).join('');
        result += actor(model.points, duration, animated && stations.length > 0, snapshot, ship(theme, true), 'data-actor="route-ship"');
        result += status([{ time: 0, label: stations.length ? 'NAVIGATION READY  /  ONE FUEL PER STATION JUMP' : 'DOCKED  /  NO CONTRIBUTIONS, NO FUEL' }, ...model.events.filter(event => event.type === 'station-refuel' || event.type === 'jump-depart').map(event => ({ time: event.time, label: event.type === 'station-refuel' ? `${event.date}  /  +${event.value} CONTRIBUTION FUEL  /  TANK ${event.data!.fuel}` : `HYPERJUMP  /  −1 FUEL  /  TANK ${event.data!.fuel}` }))], duration, theme, animated, snapshot, 64, 345);
        return result + '</g>';
      }, footer: theme => summary(theme, `${stations.length} fuel stations · ${model.burned} jumps`, `${model.fuel} fuel remaining · one contribution, one fuel`),
    });
  },
};

export const journeysScenes: SceneDefinition[] = [invaders, train, archaeology, dungeon, spaceRoute];

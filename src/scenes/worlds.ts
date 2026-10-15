import type { Calendar, Cell } from '../calendar.js';
import type { SceneContext, SceneDefinition, SceneEvent } from './types.js';
import { THEMES, appear, calendarActivity, center, film, motion, n, text, tween, visible, weeks, type Theme } from './kit.js';

type Season = 'Winter' | 'Spring' | 'Summer' | 'Autumn';
type PlantFamily = 'fern' | 'daisy' | 'bell';

const DAY = 86_400_000;
const count = (value: number): number => Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
const sum = (cells: Cell[]): number => cells.reduce((total, cell) => total + cell.count, 0);
const seasonFor = (date: string): Season => (['Winter', 'Winter', 'Spring', 'Spring', 'Spring', 'Summer', 'Summer', 'Summer', 'Autumn', 'Autumn', 'Autumn', 'Winter'] as Season[])[Number(date.slice(5, 7)) - 1];
const timeFor = (index: number, length: number, duration: number): number => 1.4 + index / Math.max(1, length - 1) * (duration - 4.4);
const positionX = (column: number, columns: number): number => 48 + (column + 0.5) * 1024 / Math.max(1, columns);
const hash = (value: string): number => [...value].reduce((result, character) => (Math.imul(result, 31) + character.charCodeAt(0)) >>> 0, 17);

function footer(theme: Theme, headline: string, detail: string): string {
  const p = THEMES[theme];
  return text(640, 406, headline, p.secondary, 12, 'font-weight="600"') + text(640, 425, detail, p.muted, 9);
}

function reveal(body: string, start: number, duration: number, animated: boolean): string {
  return animated ? `<g opacity="0">${appear(start, duration)}${body}</g>` : body;
}

function during(body: string, start: number, end: number, duration: number): string {
  if (end <= start) return '';
  return `<g opacity="0">${visible(start, end, duration)}${body}</g>`;
}

function changingText(frames: { time: number; value: string }[], render: (value: string) => string, duration: number, animated: boolean): string {
  const changes = frames.filter((frame, index) => index === 0 || frame.value !== frames[index - 1].value);
  if (!animated) return render(changes.at(-1)!.value);
  return changes.map((frame, index) => during(render(frame.value), frame.time, changes[index + 1]?.time || duration, duration)).join('');
}

function changingMetric(label: string, frames: { time: number; value: string }[], theme: Theme, duration: number, animated: boolean): string {
  const p = THEMES[theme];
  return text(56, 287, label.toUpperCase(), p.muted, 8, 'letter-spacing="1.1"') + changingText(frames, value => text(56, 306, value, p.ink, 13, 'font-weight="600"'), duration, animated);
}

function cumulativeCounter(model: CivilizationModel, theme: Theme, animated: boolean): string {
  return changingMetric('Accumulated resources', [{ time: 0, value: '0' }, ...model.snapshots.map(snapshot => ({ time: snapshot.time, value: snapshot.accumulated.toLocaleString('en-US') }))], theme, model.duration, animated);
}

export interface GardenPlant {
  date: string;
  column: number;
  row: number;
  count: number;
  level: number;
  height: number;
  leaves: number;
  flower: boolean;
  family: PlantFamily;
  season: Season;
  planted: number;
  grown: number;
}

export interface GardenModel {
  duration: number;
  plants: GardenPlant[];
  planting: { name: string; weight: number; family: PlantFamily }[];
  seasons: { season: Season; date: string; time: number }[];
  contributions: number;
  flowers: number;
  events: SceneEvent[];
}

/** Languages define a garden-wide planting blend, never a daily language attribution. */
export function buildGardenModel(calendar: Calendar, context?: SceneContext): GardenModel {
  const duration = 28;
  const families: PlantFamily[] = ['fern', 'daisy', 'bell'];
  const realLanguages = (context?.source === 'github-public' ? context.languages : []).filter(language => language.name.trim() && Number.isFinite(language.weight) && language.weight > 0);
  const languageTotal = realLanguages.reduce((total, language) => total + language.weight, 0);
  const planting = realLanguages.map(language => ({ name: language.name, weight: language.weight / languageTotal, family: families[hash(language.name) % families.length] }));
  const blend = planting.length ? planting : families.map(family => ({ name: '', weight: 1 / families.length, family }));
  const seasons: GardenModel['seasons'] = [];
  const events: SceneEvent[] = [];
  let previousSeason: Season | undefined;
  const plants = calendar.cells.flatMap((cell, index): GardenPlant[] => {
    const season = seasonFor(cell.date);
    const planted = timeFor(index, calendar.cells.length, duration);
    if (season !== previousSeason) {
      seasons.push({ season, date: cell.date, time: index === 0 ? 0 : planted });
      events.push({ time: index === 0 ? 0 : planted, type: 'season', date: cell.date, data: { season } });
      previousSeason = season;
    }
    if (!cell.count) return [];
    // Spatial planting uses the aggregate blend; no event assigns a language to a date.
    const quantile = ((cell.column * 7 + cell.row) * 0.61803398875) % 1;
    let cumulative = 0;
    const family = blend.find(item => { cumulative += item.weight; return quantile <= cumulative; })?.family || blend.at(-1)!.family;
    const plant: GardenPlant = {
      date: cell.date, column: cell.column, row: cell.row, count: cell.count, level: cell.level,
      height: 7 + 16 * (1 - Math.exp(-Math.sqrt(cell.count) / 8)) + cell.level * 0.6,
      leaves: Math.min(4, 1 + Math.floor(Math.log2(1 + cell.count))),
      flower: cell.count >= 5, family, season, planted, grown: planted + 0.72,
    };
    events.push({ time: planted, type: 'seed', date: cell.date, value: cell.count, data: { column: cell.column, row: cell.row } });
    events.push({ time: plant.grown, type: 'growth', date: cell.date, value: cell.count, data: { height: plant.height, leaves: plant.leaves } });
    if (plant.flower) events.push({ time: plant.grown + 0.15, type: 'flower', date: cell.date, value: cell.count });
    return [plant];
  });
  return { duration, plants, planting, seasons, contributions: sum(calendar.cells), flowers: plants.filter(plant => plant.flower).length, events: events.sort((a, b) => a.time - b.time) };
}

function ribbon(id: string, body: string, animated: boolean): string {
  const clip = `${id}-ribbon-${animated ? 'animated' : 'static'}`;
  return `<defs><clipPath id="${clip}"><rect x="48" y="270" width="1024" height="90"/></clipPath></defs><g data-world-ribbon="${id}" clip-path="url(#${clip})">${body}</g>`;
}

/** The moving outline visits real dates; it never substitutes for a day tile. */
function dateCursor(calendar: Calendar, theme: Theme, duration: number, animated: boolean): string {
  if (!animated || !calendar.cells.length) return '';
  const points = calendar.cells.map((cell, index) => ({ time: timeFor(index, calendar.cells.length, duration), ...center(calendar, cell) }));
  const size = Math.min(14.5, 1024 / calendar.columns - 3) + 3;
  return `<g class="world-date-cursor" pointer-events="none">${motion(points, duration)}<rect x="${n(-size / 2)}" y="${n(-size / 2)}" width="${n(size)}" height="${n(size)}" rx="4" fill="none" stroke="${THEMES[theme].accent}" stroke-width="1.2"/></g>`;
}

function gardenPlant(plant: GardenPlant, calendar: Calendar, theme: Theme, animated: boolean, duration: number): string {
  const p = THEMES[theme];
  const point = center(calendar, plant);
  const stroke = theme === 'dark' && plant.level >= 3 ? p.background : p.ink;
  const h = plant.height;
  const scaleX = Math.min(0.67, (1024 / calendar.columns - 5) / 15);
  let leaves = '';
  for (let index = 0; index < plant.leaves; index++) {
    const y = -h * (0.2 + index * 0.18);
    const size = plant.family === 'fern' ? 5.2 : 4;
    leaves += `<path d="M0 ${n(y)}Q${-size} ${n(y - 7)} ${-size - 1} ${n(y - 3)}Q-5 ${n(y + 1)} 0 ${n(y)}M0 ${n(y - 2)}Q${size} ${n(y - 9)} ${size + 1} ${n(y - 5)}Q5 ${n(y - 1)} 0 ${n(y - 2)}" fill="${stroke}" opacity="0.75"/>`;
  }
  const flower = plant.family === 'bell'
    ? `<path d="M-4 ${n(-h - 1)}Q0 ${n(-h - 10)} 4 ${n(-h - 1)}Z" fill="${p.accent}" stroke="${stroke}" stroke-width="0.7"/>`
    : `<g fill="${p.accent}" stroke="${stroke}" stroke-width="0.65"><ellipse cy="${n(-h - 3.5)}" rx="2" ry="3"/><ellipse cx="-3" cy="${n(-h - 1)}" rx="3" ry="2"/><ellipse cx="3" cy="${n(-h - 1)}" rx="3" ry="2"/><ellipse cy="${n(-h + 1)}" rx="2" ry="3"/></g><circle cy="${n(-h - 1)}" r="1.7" fill="${stroke}"/>`;
  const growth = animated ? `<animateTransform attributeName="transform" type="scale" values="0 0;0 0;1 1;1 1" keyTimes="0;${(plant.planted / duration).toFixed(6)};${(plant.grown / duration).toFixed(6)};1" dur="${duration}s" repeatCount="indefinite"/>` : '';
  return `<g class="garden-plant" data-plant-date="${plant.date}" data-count="${plant.count}" transform="translate(${n(point.x)} ${n(point.y)})"><g transform="translate(0 5) scale(${n(scaleX)} 0.34)"><g>${growth}<path d="M0 1Q-1 ${n(-h / 2)} 0 ${n(-h)}" fill="none" stroke="${stroke}" stroke-width="2.4" stroke-linecap="round"/>${leaves}${plant.flower ? reveal(flower, plant.grown + 0.15, duration, animated) : `<circle cy="${n(-h)}" r="1.8" fill="${stroke}"/>`}</g></g></g>`;
}

function gardenSpecimen(season: Season, x: number, theme: Theme, emphasized: boolean): string {
  const p = THEMES[theme];
  const foliage = season === 'Autumn' ? p.accent : p.colors[3];
  const stem = `<path d="M0 338v-35m0 18q-19-19-23-8q5 13 23 15m0-18q16-18 21-9q-3 12-21 16" fill="none" stroke="${foliage}" stroke-width="3" stroke-linecap="round"/>`;
  const winter = `<path d="M0 338v-37m0 16-15-11m15 19 17-12m-17-6-8-9" fill="none" stroke="${p.secondary}" stroke-width="2.4"/><path d="M-12 306h8m9 5h12M-3 301h7" stroke="${p.ink}" stroke-width="2" stroke-linecap="round"/>`;
  const bloom = season === 'Summer' ? `<g fill="${p.accent}"><ellipse cy="297" rx="6" ry="10"/><ellipse cx="-7" cy="302" rx="9" ry="5"/><ellipse cx="7" cy="302" rx="9" ry="5"/><ellipse cy="307" rx="6" ry="9"/></g><circle cy="302" r="4" fill="${p.background}"/>` : season === 'Spring' ? `<circle cy="302" r="5" fill="${p.accent}"/><path d="M-6 307q6 4 12 0" stroke="${p.secondary}" fill="none"/>` : '';
  return `<g data-season-specimen="${season}" transform="translate(${x} 0)" opacity="${emphasized ? '1' : '0.45'}"><path d="M-14 338h28l-4 16h-20Z" fill="${p.accent}"/><path d="M-16 339h32" stroke="${p.secondary}" stroke-width="2"/>${season === 'Winter' ? winter : stem + bloom}${text(0, 282, season.toUpperCase(), emphasized ? p.secondary : p.muted, 8, 'text-anchor="middle" letter-spacing="0.8"')}</g>`;
}

function drawGarden(calendar: Calendar, model: GardenModel, theme: Theme, animated: boolean): string {
  const p = THEMES[theme];
  const season = model.seasons.at(-1)?.season || seasonFor(calendar.to);
  const labels = model.seasons.map((entry, index) => {
    const body = text(56, 284, `${entry.season.toUpperCase()} / CONTRIBUTION NURSERY`, p.secondary, 9, 'letter-spacing="0.9"');
    return animated ? during(body, entry.time, model.seasons[index + 1]?.time || model.duration, model.duration) : index === model.seasons.length - 1 ? body : '';
  }).join('');
  const languageLabel = model.planting.length ? `Observed repository blend: ${model.planting.slice(0, 3).map(item => `${item.name} ${Math.round(item.weight * 100)}%`).join(' / ')}` : 'Each plant stays on its original date tile.';
  const moments = [...new Set([0, ...model.plants.map(plant => plant.planted), ...model.plants.filter(plant => plant.flower).map(plant => plant.grown + 0.15)])].sort((a, b) => a - b);
  const counters = moments.map(time => ({ time, value: `${model.plants.filter(plant => plant.planted <= time).length} plants · ${model.plants.filter(plant => plant.flower && plant.grown + 0.15 <= time).length} blooms` }));
  const counter = changingText(counters, value => text(56, 307, value, p.ink, 15, 'font-weight="600"'), model.duration, animated);
  const specimensFor = (current: Season): string => (['Winter', 'Spring', 'Summer', 'Autumn'] as Season[]).map((item, index) => gardenSpecimen(item, 716 + index * 106, theme, item === current)).join('');
  const specimens = animated ? model.seasons.map((entry, index) => during(specimensFor(entry.season), entry.time, model.seasons[index + 1]?.time || model.duration, model.duration)).join('') : specimensFor(season);
  const status = model.plants.length ? 'Actual counts grow stems and leaves; five contributions earn a bloom.' : 'The garden is resting. Every recorded zero day stays visible.';
  const narrative = `${labels}${counter}${text(56, 328, status, p.muted, 10)}${text(56, 349, languageLabel, p.muted, 9)}${specimens}`;
  return `<g class="garden-world">${calendarActivity(calendar, theme)}${model.plants.map(plant => gardenPlant(plant, calendar, theme, animated, model.duration)).join('')}${dateCursor(calendar, theme, model.duration, animated)}${ribbon('garden', narrative, animated)}</g>`;
}

export interface CityBuilding {
  column: number;
  count: number;
  activeDays: number;
  height: number;
  floors: number;
  founded: number;
  framed: number;
  completed: number;
  date: string;
}

export interface CityModel {
  duration: number;
  buildings: CityBuilding[];
  contributions: number;
  weeklyCounts: number[];
  tallest: number;
  events: SceneEvent[];
}

export function buildCityModel(calendar: Calendar): CityModel {
  const duration = 30;
  const weekly = weeks(calendar);
  const buildings = weekly.filter(week => week.count > 0).map(week => {
    const founded = 1.2 + week.column / Math.max(1, calendar.columns - 1) * (duration - 5);
    // A fixed, smooth scale keeps high-count weeks distinct without filling the header.
    const height = 13 + 158 * (1 - Math.exp(-Math.sqrt(week.count) / 18));
    return { column: week.column, count: week.count, activeDays: week.active, height, floors: Math.max(1, Math.floor((height - 8) / 9)), founded, framed: founded + 0.4, completed: founded + 1.25, date: week.cells[0]?.date || calendar.from };
  });
  const events = buildings.flatMap(building => [
    { time: building.founded, type: 'foundation', date: building.date, value: building.count, data: { column: building.column, height: building.height } },
    { time: building.framed, type: 'frame', date: building.date, value: building.count, data: { column: building.column, floors: building.floors } },
    { time: building.completed, type: 'building-complete', date: building.date, value: building.count, data: { column: building.column, height: building.height, floors: building.floors } },
  ]);
  return { duration, buildings, contributions: sum(calendar.cells), weeklyCounts: weekly.map(week => week.count), tallest: Math.max(0, ...buildings.map(building => building.height)), events: events.sort((a, b) => a.time - b.time) };
}

function cityBuilding(building: CityBuilding, calendar: Calendar, theme: Theme, animated: boolean, duration: number): string {
  const p = THEMES[theme];
  const slot = 1008 / Math.max(1, calendar.columns);
  const width = Math.min(62, Math.max(9, slot - 4));
  const x = positionX(building.column, calendar.columns) - width / 2;
  const top = 322 - building.height;
  const color = p.colors[2 + building.column % 3];
  const rows = building.floors;
  const columns = Math.max(1, Math.min(5, Math.floor(width / 8)));
  const windows = Array.from({ length: rows }, (_, row) => Array.from({ length: columns }, (_, column) => {
    const lit = (row + column + building.activeDays) % 4 !== 0;
    return `<rect x="${n(x + (column + 0.5) * width / columns - 1.3)}" y="${n(top + 7 + row * 9)}" width="2.6" height="3.8" rx="0.6" fill="${lit ? p.accent : p.background}" opacity="${lit ? 0.85 : 0.32}"/>`;
  }).join('')).join('');
  const complete = `<g class="city-building" data-week="${building.column}" data-count="${building.count}"><rect x="${n(x)}" y="${n(top)}" width="${n(width)}" height="${n(building.height)}" rx="2" fill="${color}"/><path d="M${n(x + 2)} ${n(top)}H${n(x + width - 2)}" stroke="${p.secondary}" stroke-width="2"/><rect x="${n(x + width - 3)}" y="${n(top + 2)}" width="3" height="${n(building.height - 2)}" fill="${p.background}" opacity="0.18"/>${windows}${building.count >= 50 ? `<path d="M${n(x + width / 2)} ${n(top)}v-10" stroke="${p.secondary}"/><circle cx="${n(x + width / 2)}" cy="${n(top - 11)}" r="1.8" fill="${p.accent}"/>` : ''}</g>`;
  if (!animated) return complete;
  const frameRows = Array.from({ length: Math.ceil(rows / 2) }, (_, row) => `<path d="M${n(x)} ${n(top + row * 18)}h${n(width)}"/>`).join('');
  const foundation = `<path d="M${n(x - 2)} 323h${n(width + 4)}" stroke="${p.accent}" stroke-width="3" stroke-dasharray="3 2"/><path d="M${n(x)} 316v6m${n(width)}-6v6" stroke="${p.secondary}"/>`;
  const frame = `<g fill="none" stroke="${p.accent}" stroke-width="1" opacity="0.75"><path d="M${n(x)} 322V${n(top)}h${n(width)}V322M${n(x)} 322L${n(x + width)} ${n(top)}M${n(x)} ${n(top)}L${n(x + width)} 322"/>${frameRows}</g>`;
  return during(foundation, building.founded, building.framed, duration) + during(frame, building.framed, building.completed, duration) + reveal(complete, building.completed, duration, true);
}

function drawCity(calendar: Calendar, model: CityModel, theme: Theme, animated: boolean): string {
  const p = THEMES[theme];
  const ground = `<path d="M56 324H1064" stroke="${p.secondary}" stroke-width="2"/><path d="M56 339H1064" stroke="${p.line}" stroke-width="20"/><path d="M56 339H1064" stroke="${p.muted}" stroke-width="1" stroke-dasharray="10 16" opacity="0.4"/>`;
  const points = model.buildings.map(building => ({ time: building.framed, x: Math.max(89, Math.min(1015, positionX(building.column, calendar.columns))), y: 0 }));
  const crane = animated && points.length ? `<g class="city-crane">${motion(points, model.duration)}<path d="M0 318V152M-33 161H49M0 152L-33 161M0 152L49 161M-5 318L0 297L5 318M0 274L-4 254L4 234L-4 214L4 194L0 174" fill="none" stroke="${p.accent}" stroke-width="1.5"/><path d="M36 161v44q0 7-5 6" fill="none" stroke="${p.secondary}" stroke-width="1.2"/><rect x="-32" y="158" width="10" height="7" fill="${p.accent}"/></g>` : '';
  const car = model.buildings.length ? `<g transform="translate(80 334)">${animated ? motion([{ time: 0, x: 80, y: 334 }, { time: model.duration, x: 1030, y: 334 }], model.duration) : ''}<rect width="13" height="5" rx="2" fill="${p.accent}"/><path d="M3 0l2-3h4l2 3" fill="${p.accent}"/><circle cx="3" cy="5" r="1.5" fill="${p.background}"/><circle cx="10" cy="5" r="1.5" fill="${p.background}"/></g>` : '';
  const skyline = `<g transform="translate(0 211) scale(1 0.42)">${model.buildings.map(building => cityBuilding(building, calendar, theme, animated, model.duration)).join('')}${crane}${ground}${car}</g>`;
  const counters = [{ time: 0, value: '0 developed blocks' }, ...model.buildings.map((building, index) => ({ time: building.completed, value: `${index + 1} developed blocks` }))];
  const counter = changingText(counters, value => text(56, 265, `WEEKLY SKYLINE / ${value}`, p.secondary, 9, 'letter-spacing="0.7"'), model.duration, animated);
  const quiet = model.buildings.length ? '' : text(560, 315, 'A quiet horizon, ready for the first foundation.', p.muted, 13, 'text-anchor="middle"');
  return `<g class="city-world">${calendarActivity(calendar, theme)}${dateCursor(calendar, theme, model.duration, animated)}${counter}${ribbon('city', `${skyline}${quiet}`, animated)}${text(1072, 265, 'FOUNDATION → FRAME → FACADE · WEEKLY TOTALS', p.muted, 8, 'text-anchor="end" letter-spacing="0.7"')}</g>`;
}

export const CIVILIZATION_ERAS = [
  { name: 'Wilderness', threshold: 0 }, { name: 'Camp', threshold: 1 }, { name: 'Hamlet', threshold: 35 },
  { name: 'Village', threshold: 140 }, { name: 'Town', threshold: 420 }, { name: 'Industry', threshold: 1000 }, { name: 'Space', threshold: 2200 },
] as const;

export interface CivilizationSnapshot {
  date: string;
  time: number;
  count: number;
  accumulated: number;
  era: number;
  idleDays: number;
  weathering: number;
}

export interface CivilizationModel {
  duration: number;
  snapshots: CivilizationSnapshot[];
  eras: { era: number; time: number; date?: string; accumulated: number }[];
  accumulated: number;
  era: number;
  weathering: number;
  maximumWeathering: number;
  events: SceneEvent[];
}

/** Fixed thresholds preserve the difference between a sparse and a prolific year. */
export function buildCivilizationModel(calendar: Calendar): CivilizationModel {
  const duration = 32;
  let accumulated = 0;
  let era = 0;
  let idleDays = 0;
  let weathering = 0;
  let previousDate = 0;
  const eras: CivilizationModel['eras'] = [{ era: 0, time: 0, accumulated: 0 }];
  const events: SceneEvent[] = [];
  const snapshots = calendar.cells.map((cell, index): CivilizationSnapshot => {
    const time = timeFor(index, calendar.cells.length, duration);
    const stamp = Date.parse(`${cell.date}T00:00:00Z`);
    // Missing calendar dates break an observed run; they are not treated as zero days.
    if (stamp - previousDate !== DAY) idleDays = 0;
    idleDays = cell.count > 0 ? 0 : idleDays + 1;
    accumulated += cell.count;
    if (cell.count > 0) {
      weathering = Math.max(0, weathering - Math.min(0.3, cell.count * 0.018));
      events.push({ time, type: 'resources', date: cell.date, value: cell.count, data: { accumulated } });
    } else if (idleDays >= 3 && accumulated > 0) {
      weathering = Math.min(1, weathering + 0.075);
      events.push({ time, type: 'weathering', date: cell.date, value: weathering, data: { idleDays } });
    }
    while (era + 1 < CIVILIZATION_ERAS.length && accumulated >= CIVILIZATION_ERAS[era + 1].threshold) {
      era++;
      eras.push({ era, time, date: cell.date, accumulated });
      events.push({ time, type: 'era', date: cell.date, value: accumulated, data: { era, name: CIVILIZATION_ERAS[era].name, threshold: CIVILIZATION_ERAS[era].threshold } });
    }
    previousDate = stamp;
    return { date: cell.date, time, count: cell.count, accumulated, era, idleDays, weathering };
  });
  return { duration, snapshots, eras, accumulated, era, weathering, maximumWeathering: Math.max(0, ...snapshots.map(snapshot => snapshot.weathering)), events: events.sort((a, b) => a.time - b.time) };
}

function house(x: number, y: number, width: number, height: number, theme: Theme, variant = 0): string {
  const p = THEMES[theme];
  const fill = p.colors[2 + variant % 3];
  return `<g><rect x="${x}" y="${y - height}" width="${width}" height="${height}" rx="1" fill="${fill}"/><path d="M${x - 5} ${y - height + 1}L${x + width / 2} ${y - height - 17}L${x + width + 5} ${y - height + 1}Z" fill="${p.accent}"/><rect x="${x + width * 0.43}" y="${y - 15}" width="${Math.max(4, width * 0.15)}" height="15" rx="1" fill="${p.background}"/><path d="M${x + 7} ${y - height + 10}h6v7h-6ZM${x + width - 13} ${y - height + 10}h6v7h-6Z" fill="${p.background}" opacity="0.6"/></g>`;
}

function civilizationEra(era: number, theme: Theme, animated: boolean, model: CivilizationModel): string {
  const p = THEMES[theme];
  const baseline = 308;
  if (!era) return `<path d="M476 307l17-8 16 8m61 0 11-5 10 5" fill="none" stroke="${p.muted}" stroke-width="2"/>`;
  if (era === 1) return `<g class="civilization-camp"><path d="M424 ${baseline}l31-47 31 47Z" fill="${p.colors[3]}"/><path d="M455 261v47h17Z" fill="${p.colors[1]}"/><path d="M534 307l8-12 8 12m-17 0h20" fill="none" stroke="${p.accent}" stroke-width="3"/><path d="M542 292q-9-8 0-16q10-7 0-14" fill="none" stroke="${p.muted}" stroke-width="2" opacity="0.5"/></g>`;
  const homes = [house(370, baseline, 43, 35, theme, 1), house(432, baseline, 51, 44, theme, 0)];
  if (era >= 3) homes.push(house(568, baseline, 58, 53, theme, 2), house(648, baseline, 43, 36, theme, 1));
  if (era >= 4) homes.push(house(748, baseline, 53, 64, theme, 0), `<g class="civilization-clocktower"><rect x="515" y="210" width="30" height="98" fill="${p.colors[3]}"/><path d="M508 210l22-26 22 26Z" fill="${p.accent}"/><circle cx="530" cy="229" r="8" fill="${p.background}"/><path d="M530 223v6l4 3" fill="none" stroke="${p.secondary}" stroke-width="1.5"/></g>`);
  const farms = `<g stroke="${p.colors[2]}" stroke-width="3"><path d="M270 297l56-13m-49 20 56-13m-46 20 56-13"/></g><path d="M650 310H343" stroke="${p.accent}" stroke-width="5" opacity="0.2"/>`;
  const mill = era >= 3 ? `<g class="civilization-windmill"><path d="M300 307l8-63h13l8 63Z" fill="${p.colors[2]}"/><circle cx="314" cy="251" r="4" fill="${p.accent}"/><g>${animated ? `<animateTransform attributeName="transform" type="rotate" from="0 314 251" to="360 314 251" dur="8s" repeatCount="indefinite"/>` : ''}<path d="M314 251l-22-19 5-5 17 24 22-19 5 5-27 14 22 19-5 5-17-24-22 19-5-5Z" fill="${p.secondary}"/></g></g>` : '';
  const industry = era >= 5 ? `<g class="civilization-factory"><path d="M639 307v-55l22-14v14l22-14v14l22-14v69Z" fill="${p.colors[2]}"/><path d="M694 252v-56h12v111" fill="${p.colors[3]}"/><path d="M649 270h10v9h-10m25-9h10v9h-10" fill="${p.accent}"/><g fill="${p.muted}" opacity="0.23"><circle cx="702" cy="186" r="9"/><circle cx="713" cy="171" r="13"/><circle cx="733" cy="157" r="17"/>${animated ? tween('opacity', [{ time: 0, value: 0.13 }, { time: model.duration / 2, value: 0.35 }, { time: model.duration, value: 0.13 }], model.duration) : ''}</g></g>` : '';
  const space = era >= 6 ? `<g class="civilization-spaceport"><path d="M825 307h113" stroke="${p.secondary}" stroke-width="3"/><path d="M830 307v-70h22m-22 15h22m-22 18h22m-22 18h22" fill="none" stroke="${p.muted}" stroke-width="2"/><g>${animated ? motion([{ time: 0, x: 0, y: 0 }, { time: Math.min(model.duration - 1.4, (model.eras.find(item => item.era === 6)?.time || 0) + 0.4), x: 0, y: 0 }, { time: model.duration - 0.5, x: 26, y: -44 }], model.duration) : ''}<path d="M870 288v-43q0-25 10-35q10 10 10 35v43Z" fill="${p.secondary}"/><path d="M870 268l-8 20h8m20-20 8 20h-8" fill="${p.accent}"/><circle cx="880" cy="242" r="4" fill="${p.background}"/>${animated ? `<path d="M874 291l6 15 6-15" fill="${p.accent}"/>` : ''}</g><path d="M758 211v96m-17-101q17 26 34 0m-34 0 17 5 17-5" fill="none" stroke="${p.secondary}" stroke-width="2"/></g>` : '';
  return `<g class="civilization-settlement" data-era="${era}">${farms}${homes.join('')}${mill}${industry}${space}</g>`;
}

function drawCivilization(calendar: Calendar, model: CivilizationModel, theme: Theme, animated: boolean): string {
  const p = THEMES[theme];
  const landscape = `<path d="M56 279l82-83 65 68 92-99 102 108 77-41 109 49 76-69 90 65 97-97 111 105 112-49 87 51v43H56Z" fill="${p.empty}"/><path d="M56 311Q285 291 473 316T832 309T1064 312V333H56Z" fill="${p.colors[1]}" opacity="0.45"/><path d="M119 276q88 22 62 47q-7 8-4 13" fill="none" stroke="${p.colors[2]}" stroke-width="12" opacity="0.55"/><path d="M85 309v-32m-11 19 11-18 11 18m89 20v-44m-15 26 15-25 15 25m770 20v-44m-15 26 15-25 15 25" fill="none" stroke="${p.secondary}" stroke-width="3"/>`;
  const eraGroups = model.eras.map((entry, index) => {
    const body = civilizationEra(entry.era, theme, animated, model);
    // Multiple thresholds may be crossed on one date: only the latest is visible.
    return animated ? during(body, entry.time, model.eras[index + 1]?.time || model.duration, model.duration) : index === model.eras.length - 1 ? body : '';
  }).join('');
  const weatherFrames = [{ time: 0, value: 0 }, ...model.snapshots.map(snapshot => ({ time: snapshot.time, value: snapshot.weathering * 0.85 }))];
  const overgrowth = `<g class="civilization-weathering" opacity="${n(animated ? 0 : model.weathering * 0.85)}">${animated ? tween('opacity', weatherFrames, model.duration) : ''}<path d="M362 310q18-55 35-39t28 37m65 0q-12-49 8-59m63 60q12-47 30-32t27 32m70 0q-11-57 10-43" fill="none" stroke="${p.colors[4]}" stroke-width="5"/><path d="M382 284l-12-7 2 14m28-14 13-6-3 16m91-18 10-9 1 17m91 9 12-6-3 13m63-13 12-9-2 18" fill="${p.colors[3]}"/><path d="M414 289l4 9-5 7m184-23-5 8 7 9m73-22-4 11 6 6" fill="none" stroke="${p.background}" stroke-width="2"/></g>`;
  const timeline = CIVILIZATION_ERAS.slice(1).map((era, index) => {
    const x = 340 + index * 121;
    const achieved = model.eras.find(entry => entry.era === index + 1);
    const marker = (reached: boolean): string => `<circle cx="${x}" cy="355" r="3" fill="${reached ? p.accent : p.border}"/>${text(x + 7, 358, `${era.name} ${era.threshold.toLocaleString('en-US')}`, reached ? p.secondary : p.muted, 8)}`;
    return marker(false) + (achieved ? reveal(marker(true), achieved.time, model.duration, animated) : '');
  }).join('');
  const eraLabel = changingText(model.eras.map(entry => ({ time: entry.time, value: `${String(entry.era).padStart(2, '0')} / ${CIVILIZATION_ERAS[entry.era].name.toUpperCase()}` })), value => text(56, 330, value, p.secondary, 10, 'letter-spacing="1.2"'), model.duration, animated);
  const scenery = `<g transform="translate(300 218) scale(0.69 0.39)">${landscape}</g><circle cx="1023" cy="285" r="10" fill="${p.accent}" opacity="0.65"/><g transform="translate(395 184) scale(0.53)">${eraGroups}${overgrowth}</g>`;
  return `<g class="civilization-world">${calendarActivity(calendar, theme)}${dateCursor(calendar, theme, model.duration, animated)}${ribbon('civilization', `${cumulativeCounter(model, theme, animated)}${eraLabel}${scenery}${timeline}`, animated)}</g>`;
}

export interface TownBuilding {
  lot: number;
  threshold: number;
  date: string;
  time: number;
  accumulated: number;
}

export interface TownFestival {
  column: number;
  date: string;
  time: number;
  count: number;
  streak: number;
}

export interface TownModel {
  duration: number;
  buildings: TownBuilding[];
  roads: { segment: number; time: number; date: string }[];
  festivals: TownFestival[];
  contributions: number;
  activity?: NonNullable<SceneContext['activity']>;
  source: 'github-public' | 'calendar-only';
  events: SceneEvent[];
}

export function buildTownModel(calendar: Calendar, context?: SceneContext): TownModel {
  const duration = 30;
  const buildings: TownBuilding[] = [];
  const roads: TownModel['roads'] = [];
  const events: SceneEvent[] = [];
  let accumulated = 0;
  for (const [index, cell] of calendar.cells.entries()) {
    accumulated += cell.count;
    const time = timeFor(index, calendar.cells.length, duration);
    while (buildings.length < 24 && accumulated >= 1 + buildings.length * 24) {
      const lot = buildings.length;
      const building = { lot, threshold: 1 + lot * 24, date: cell.date, time, accumulated };
      buildings.push(building);
      events.push({ time, type: 'town-building', date: cell.date, value: building.threshold, data: { lot, accumulated } });
      if (lot < 6) {
        const road = { segment: lot, time, date: cell.date };
        roads.push(road);
        events.push({ time, type: 'road', date: cell.date, value: road.segment });
      }
    }
  }
  const festivals = weeks(calendar).flatMap(week => {
    let streak = 0;
    let longest = 0;
    let previous = 0;
    for (const day of week.cells) {
      const stamp = Date.parse(`${day.date}T00:00:00Z`);
      streak = day.count > 0 ? (stamp - previous === DAY ? streak + 1 : 1) : 0;
      longest = Math.max(longest, streak);
      previous = stamp;
    }
    if (week.count < 35 && longest < 4) return [];
    const last = week.cells.at(-1)!;
    const index = calendar.cells.findIndex(cell => cell.date === last.date);
    const festival = { column: week.column, date: last.date, time: timeFor(index, calendar.cells.length, duration), count: week.count, streak: longest };
    events.push({ time: festival.time, type: 'festival', date: festival.date, value: week.count, data: { column: week.column, streak: longest } });
    return [festival];
  });
  const activity = context?.source === 'github-public' && context.activity ? {
    commits: count(context.activity.commits), issues: count(context.activity.issues), pullRequests: count(context.activity.pullRequests), reviews: count(context.activity.reviews),
  } : undefined;
  if (activity) events.push({ time: 0, type: 'public-activity-summary', data: { ...activity, scope: 'aggregate-context; no date attribution' } });
  return { duration, buildings, roads, festivals, contributions: accumulated, activity, source: activity ? 'github-public' : 'calendar-only', events: events.sort((a, b) => a.time - b.time) };
}

function townHouse(building: TownBuilding, theme: Theme, animated: boolean, duration: number): string {
  const p = THEMES[theme];
  const x = 337 + building.lot * 20.5;
  const y = 334;
  const h = 15 + building.lot % 3 * 3;
  const body = `<g class="town-house" data-lot="${building.lot}"><rect x="${n(x)}" y="${y - h}" width="15" height="${h}" rx="1" fill="${p.colors[2 + building.lot % 3]}"/><path d="M${n(x - 2)} ${y - h}l9.5-7 9.5 7Z" fill="${p.accent}"/><rect x="${n(x + 6)}" y="${y - 7}" width="4" height="7" rx="0.5" fill="${p.background}"/><path d="M${n(x + 2)} ${y - h + 4}h3v3h-3" fill="${p.background}" opacity="0.65"/></g>`;
  if (!animated) return body;
  const plot = `<path d="M${n(x - 1)} ${y}v-${h}h17v${h}Z" fill="none" stroke="${p.accent}" stroke-width="1" stroke-dasharray="2 2"/>`;
  return during(plot, building.time, building.time + 0.5, duration) + reveal(body, building.time + 0.5, duration, true);
}

/** Public structures describe aggregate observed work, never extra calendar days. */
function civicSquare(model: TownModel, theme: Theme): string {
  const p = THEMES[theme];
  if (!model.activity) return `<g class="town-commons"><path d="M875 337h177M895 322h138m-130 5h122" stroke="${p.colors[2]}" stroke-width="3"/><path d="M889 319v-18m-9 10 9-14 9 14m142 10v-18m-9 10 9-14 9 14" fill="none" stroke="${p.secondary}" stroke-width="2"/>${text(963, 284, 'THE COMMONS', p.secondary, 10, 'text-anchor="middle" letter-spacing="1.1"')}${text(963, 353, 'Calendar totals · public types unavailable', p.muted, 8, 'text-anchor="middle"')}</g>`;
  const { commits, issues, pullRequests, reviews } = model.activity;
  const items = [
    { x: 852, y: 284, label: 'COMMITS', value: commits },
    { x: 968, y: 284, label: 'ISSUES', value: issues },
    { x: 852, y: 325, label: 'PULL REQUESTS', value: pullRequests },
    { x: 968, y: 325, label: 'REVIEWS', value: reviews },
  ];
  return items.map((item, index) => {
    const levels = Math.min(4, Math.ceil(Math.log2(1 + item.value)));
    const h = 9 + levels * 1.6;
    const architecture = [
      `<path d="M0 8v-${h}l5-4v4l5-4v4l5-4V8Z" fill="${p.colors[2]}"/><path d="M14 ${8 - h}v-6h3v${h + 6}" fill="${p.colors[3]}"/>`,
      `<path d="M-2 ${8 - h}l10-6 10 6Z" fill="${p.accent}"/><path d="M0 ${10 - h}V8m5-${h - 2}V8m5-${h - 2}V8m5-${h - 2}V8M-2 9h20" fill="none" stroke="${p.colors[3]}" stroke-width="2"/>`,
      `<path d="M-2 9V-2h20V9h-4q0-9-6-9T2 9Z" fill="${p.colors[3]}"/><path d="M-2-4h20M1-8v5m5-5v5m5-5v5m5-5v5" stroke="${p.accent}" stroke-width="1.1"/>`,
      `<rect y="${8 - h}" width="16" height="${h}" fill="${p.colors[2]}"/><path d="M-3 ${8 - h}l11-6 11 6Z" fill="${p.accent}"/>${Array.from({ length: levels }, (_, book) => `<path d="M${2 + book * 3} ${11 - h}v${h - 5}" stroke="${p.secondary}" stroke-width="1.6"/>`).join('')}`,
    ][index];
    return `<g class="town-public-activity" data-type="${item.label.toLowerCase().replaceAll(' ', '-')}" data-count="${item.value}"><g transform="translate(${item.x} ${item.y + 8})">${item.value ? architecture : `<path d="M-2 9h20V-8H-2Z" fill="none" stroke="${p.border}" stroke-dasharray="2 2"/>`}</g>${text(item.x + 28, item.y + 10, item.value.toLocaleString('en-US'), item.value ? p.ink : p.muted, 12, 'font-weight="600"')}${text(item.x + 28, item.y + 23, item.label, p.muted, 7, 'letter-spacing="0.4"')}</g>`;
  }).join('');
}

function drawTown(calendar: Calendar, model: TownModel, theme: Theme, animated: boolean): string {
  const p = THEMES[theme];
  const roads = model.roads.map(road => {
    const x = 332 + road.segment * 82;
    return reveal(`<g class="town-road" data-segment="${road.segment}"><path d="M${x} 344h82" stroke="${p.line}" stroke-width="8"/><path d="M${x} 344h79" stroke="${p.muted}" stroke-width="0.8" stroke-dasharray="3 7" opacity="0.45"/></g>`, road.time, model.duration, animated);
  }).join('');
  const celebrationBody = `<path d="M846 272Q951 302 1068 272" fill="none" stroke="${p.secondary}" stroke-width="1"/>${Array.from({ length: 9 }, (_, index) => `<path d="M${853 + index * 25} ${275 + Math.sin(index / 8 * Math.PI) * 12}l4 7 5-6Z" fill="${index % 2 ? p.accent : p.colors[3]}"/>`).join('')}`;
  const celebrations = animated ? model.festivals.map(festival => during(celebrationBody, festival.time, Math.min(model.duration - 0.1, festival.time + 1.15), model.duration)).join('') : model.festivals.length ? celebrationBody : '';
  const moments = [...new Set([0, ...model.buildings.map(building => building.time + 0.5), ...model.roads.map(road => road.time), ...model.festivals.map(festival => festival.time)])].sort((a, b) => a - b);
  const counters = moments.map(time => ({ time, value: `${model.buildings.filter(building => building.time + 0.5 <= time).length} homes · ${model.festivals.filter(festival => festival.time <= time).length} festivals` }));
  const status = model.activity ? 'OBSERVED PUBLIC ACTIVITY · SAMPLED TOTALS' : 'CALENDAR-ONLY · NO INFERRED ACTIVITY TYPES';
  const empty = model.buildings.length ? '' : text(578, 326, 'First contribution, first home.', p.muted, 12, 'text-anchor="middle"');
  const narrative = `${changingMetric('A town built together', counters, theme, model.duration, animated)}${text(56, 329, 'Active streaks bring celebrations.', p.muted, 9)}${text(56, 348, '24 contributions fund each additional home.', p.muted, 8)}${roads}${model.buildings.map(building => townHouse(building, theme, animated, model.duration)).join('')}${civicSquare(model, theme)}${celebrations}${empty}`;
  return `<g class="town-world">${calendarActivity(calendar, theme)}${dateCursor(calendar, theme, model.duration, animated)}${text(1072, 265, status, p.muted, 8, 'text-anchor="end" letter-spacing="0.7"')}${ribbon('town', narrative, animated)}</g>`;
}

const garden: SceneDefinition = {
  id: 'garden', number: '05', title: 'Garden', category: 'Worlds',
  caption: 'Small habits, a living garden.',
  description: 'Each active date grows a plant. Exact contribution counts control its height, leaves and flowering, while the recorded months bring seasonal colors. Public repository languages shape the aggregate planting blend when supplied.',
  build: (calendar, context) => {
    const model = buildGardenModel(calendar, context);
    return film(calendar, garden, { duration: model.duration, events: model.events, checkpoints: [3, 14, 26], metrics: { plants: model.plants.length, flowers: model.flowers, contributions: model.contributions, plantingSource: model.planting.length ? 'repository-languages' : 'calendar-only', seasons: [...new Set(model.seasons.map(item => item.season))].join(', ') }, draw: (theme, animated) => drawGarden(calendar, model, theme, animated), footer: theme => footer(theme, `${model.flowers} blooms from ${model.plants.length} plants`, model.planting.length ? 'Observed language blend · growth uses counts' : 'Count ≥ 5 blooms · seasonal planting') });
  },
};

const city: SceneDefinition = {
  id: 'city', number: '06', title: 'City', category: 'Worlds',
  caption: 'A skyline raised one week at a time.',
  description: 'Each active week develops from a foundation through a structural frame to a finished building. Its exact weekly contribution total controls skyline height; quiet weeks leave a gap.',
  build: calendar => {
    const model = buildCityModel(calendar);
    return film(calendar, city, { duration: model.duration, events: model.events, checkpoints: [4, 15, 28], metrics: { buildings: model.buildings.length, contributions: model.contributions, tallest: Number(model.tallest.toFixed(3)), peakWeek: Math.max(0, ...model.weeklyCounts), floors: model.buildings.reduce((total, building) => total + building.floors, 0) }, draw: (theme, animated) => drawCity(calendar, model, theme, animated), footer: theme => footer(theme, `${model.buildings.length} weeks on the skyline`, `Peak week · ${Math.max(0, ...model.weeklyCounts)} contributions`) });
  },
};

const civilization: SceneDefinition = {
  id: 'civilization', number: '09', title: 'Civilization', category: 'Worlds',
  caption: 'From a first camp to a distant orbit.',
  description: 'Actual accumulated contributions cross fixed era thresholds, growing a camp into a hamlet, village, town, industrial settlement and spaceport. Observed inactive runs weather and overgrow the settlement; activity repairs it.',
  build: calendar => {
    const model = buildCivilizationModel(calendar);
    return film(calendar, civilization, { duration: model.duration, events: model.events, checkpoints: [3, 16, 30], metrics: { resources: model.accumulated, era: CIVILIZATION_ERAS[model.era].name, erasReached: model.era, weathering: Number(model.weathering.toFixed(3)), maximumWeathering: Number(model.maximumWeathering.toFixed(3)) }, draw: (theme, animated) => drawCivilization(calendar, model, theme, animated), footer: theme => footer(theme, `Final: ${CIVILIZATION_ERAS[model.era].name} · ${model.accumulated.toLocaleString('en-US')}`, `Final weathering ${Math.round(model.weathering * 100)}% · fixed eras`) });
  },
};

const town: SceneDefinition = {
  id: 'town', number: '17', title: 'Town', category: 'Worlds',
  caption: 'A neighborhood made by showing up.',
  description: 'Contributions fund homes and connecting lanes. Active weeks earn festivals. When real public activity context is available, the civic square reports observed sampled commits, issues, pull requests and reviews without inventing daily attribution.',
  build: (calendar, context) => {
    const model = buildTownModel(calendar, context);
    const checkpoints = [...new Set([4, model.festivals.length ? model.festivals[Math.floor(model.festivals.length / 2)].time + 0.3 : 15, model.festivals.length ? model.festivals.at(-1)!.time + 0.3 : 28, 15, 28])].slice(0, 3).sort((a, b) => a - b);
    return film(calendar, town, { duration: model.duration, events: model.events, checkpoints, metrics: { homes: model.buildings.length, roads: model.roads.length, festivals: model.festivals.length, contributions: model.contributions, source: model.source, ...(model.activity ? { commits: model.activity.commits, issues: model.activity.issues, pullRequests: model.activity.pullRequests, reviews: model.activity.reviews } : {}) }, draw: (theme, animated) => drawTown(calendar, model, theme, animated), footer: theme => footer(theme, `${model.buildings.length} homes · ${model.festivals.length} celebrations`, model.activity ? 'Observed public types · sampled totals' : 'Calendar totals · typed activity unavailable') });
  },
};

export const worldsScenes: SceneDefinition[] = [garden, city, civilization, town];

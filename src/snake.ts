import type { Calendar, Cell } from './calendar.js';

export interface GridPoint { column: number; row: number }
export interface SnakeFrame { time: number; body: GridPoint[]; eaten: number; food?: Cell }
export interface SnakeScene {
  columns: number;
  rows: number;
  initialLength: number;
  finalLength: number;
  growthEvery: number;
  maxLength: number;
  frames: SnakeFrame[];
  meals: { time: number; cell: Cell; length: number }[];
  playStart: number;
  playEnd: number;
  duration: number;
}

const INITIAL_LENGTH = 4;
const PLAY_START = 1.8;
const GROWTH_EVERY = 5;
const MAX_LENGTH = 16;
const key = (point: GridPoint): string => `${point.column},${point.row}`;
const same = (a: GridPoint, b: GridPoint): boolean => a.column === b.column && a.row === b.row;

/** Exact counts choose the next food tier. BFS chooses a short, body-safe route. */
export function simulateSnake(calendar: Calendar): SnakeScene {
  const columns = Math.max(4, calendar.columns);
  const rows = 11;
  const maxLength = Math.min(MAX_LENGTH, Math.floor(columns * rows / 3));
  const food = new Map(calendar.cells.filter(cell => cell.count > 0).map(cell => [key(cell), cell]));
  const neighbors = (point: GridPoint): GridPoint[] => [
    { column: point.column + 1, row: point.row }, { column: point.column, row: point.row - 1 },
    { column: point.column - 1, row: point.row }, { column: point.column, row: point.row + 1 },
  ].filter(p => p.column >= 0 && p.column < columns && p.row >= 0 && p.row < rows);
  const route = (body: GridPoint[], targets: Set<string>, allowTail: boolean, forbidden = new Set<string>()): GridPoint[] | undefined => {
    const blocked = new Set(body.slice(1, allowTail ? -1 : undefined).map(key));
    const queue = [body[0]];
    const previous = new Map<string, GridPoint | null>([[key(body[0]), null]]);
    for (let index = 0; index < queue.length; index++) {
      const current = queue[index];
      if (index > 0 && targets.has(key(current))) {
        const path = [current];
        let parent = previous.get(key(current));
        while (parent && !same(parent, body[0])) { path.push(parent); parent = previous.get(key(parent)); }
        return path.reverse();
      }
      for (const next of neighbors(current)) {
        const id = key(next);
        if (!blocked.has(id) && !forbidden.has(id) && !previous.has(id)) { previous.set(id, current); queue.push(next); }
      }
    }
    return undefined;
  };
  const hasEscape = (body: GridPoint[]): boolean => {
    if (route(body, new Set([key(body.at(-1)!)]), true)) return true;
    // A trapped tail can still unwind while the head waits in open space.
    // Require enough reachable floor for a full turn instead of rejecting it.
    const blocked = new Set(body.slice(1).map(key));
    const seen = new Set([key(body[0])]);
    const queue = [body[0]];
    const needed = Math.min(columns * rows - body.length, body.length * 2 + 2);
    for (let index = 0; index < queue.length; index++) {
      if (seen.size >= needed) return true;
      for (const point of neighbors(queue[index])) {
        const id = key(point);
        if (!blocked.has(id) && !seen.has(id)) { seen.add(id); queue.push(point); }
      }
    }
    return false;
  };
  let body: GridPoint[] = Array.from({ length: INITIAL_LENGTH }, (_, index) => ({ column: 3 - index, row: 9 }));
  const frames: SnakeFrame[] = [{ time: PLAY_START, body, eaten: 0 }];
  const meals: SnakeScene['meals'] = [];
  let idle = 0;
  const escapeVisits = new Map<string, number>();
  while (food.size) {
    const tier = Math.min(...[...food.values()].map(cell => cell.count));
    const targets = new Set([...food].filter(([, cell]) => cell.count === tier).map(([id]) => id));
    // Later tiers are dormant floor until all smaller counts have been eaten.
    // Arbitrary count layouts remain solvable without consuming out of order.
    let path: GridPoint[] | undefined;
    const remaining = new Set(targets);
    while (remaining.size) {
      const candidate = route(body, remaining, true, new Set([...targets].filter(id => !remaining.has(id))));
      if (!candidate) break;
      let trial = body;
      let safe = true;
      candidate.forEach((point, index) => {
        const grows = index === candidate.length - 1 && (meals.length + 1) % GROWTH_EVERY === 0 && trial.length < maxLength;
        if (trial.slice(0, grows ? undefined : -1).some(part => same(part, point))) safe = false;
        trial = [point, ...trial];
        if (!grows) trial.pop();
      });
      if (safe && hasEscape(trial)) { path = candidate; break; }
      remaining.delete(key(candidate.at(-1)!));
    }
    if (!path) {
      // A meal on the tail cannot be entered on a growth turn: the tail would
      // not vacate. Take a safe side step and let the body open another route.
      const choices = neighbors(body[0]).flatMap(point => {
        const meal = food.get(key(point));
        const grows = meal?.count === tier && (meals.length + 1) % GROWTH_EVERY === 0 && body.length < maxLength;
        if (body.slice(0, grows ? undefined : -1).some(part => same(part, point))) return [];
        const trial = [point, ...body];
        if (!grows) trial.pop();
        if (!hasEscape(trial)) return [];
        const state = `${tier}:${trial.map(key).join(';')}`;
        const distance = Math.min(...[...targets].map(id => { const [x, y] = id.split(',').map(Number); return Math.abs(x - point.column) + Math.abs(y - point.row); }));
        return [{ point, state, score: (escapeVisits.get(state) || 0) * columns * rows + distance }];
      }).sort((a, b) => a.score - b.score);
      const choice = choices[0];
      if (!choice || ++idle > columns * rows * 8) throw new Error('No safe route to the lowest remaining contribution count.');
      escapeVisits.set(choice.state, (escapeVisits.get(choice.state) || 0) + 1);
      path = [choice.point];
    } else idle = 0;
    for (const point of path) {
      const possibleMeal = food.get(key(point));
      const meal = possibleMeal?.count === tier ? possibleMeal : undefined;
      const grows = !!meal && (meals.length + 1) % GROWTH_EVERY === 0 && body.length < maxLength;
      if (body.slice(0, grows ? undefined : -1).some(part => same(part, point))) throw new Error('Snake path intersects its body.');
      body = [{ ...point }, ...body];
      if (!grows) body.pop();
      if (meal) { escapeVisits.clear(); food.delete(key(point)); meals.push({ time: 0, cell: meal, length: body.length }); }
      frames.push({ time: 0, body, eaten: meals.length, ...(meal ? { food: meal } : {}) });
      if (meal) break;
    }
  }
  // Keep every move visible. A long sorted route takes longer, never teleports.
  let elapsed = PLAY_START;
  let mealIndex = 0;
  for (let index = 1; index < frames.length; index++) {
    const progress = frames[index].eaten / Math.max(1, meals.length);
    elapsed += 0.105 - progress * 0.035;
    if (frames[index].food) { elapsed += 0.07; meals[mealIndex++].time = elapsed; }
    frames[index].time = elapsed;
  }
  return { columns, rows, initialLength: INITIAL_LENGTH, finalLength: body.length,
    growthEvery: GROWTH_EVERY, maxLength, frames, meals, playStart: PLAY_START, playEnd: elapsed,
    duration: Math.max(12, elapsed + 3.5) };
}

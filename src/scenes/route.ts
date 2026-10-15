import type { Calendar, Cell } from '../calendar.js';

export interface CalendarPoint { column: number; row: number }
export interface PlannedMove extends CalendarPoint { meal?: Cell }
const key = (point: CalendarPoint): string => `${point.column},${point.row}`;

/** Keep dates where GitHub placed them; only the actor's itinerary changes.
 * Future count tiers are dormant floor. BFS stops at the nearest remaining
 * minimum-count date, so visiting a higher tier cannot consume it early.
 */
export function planCalendarMeals(calendar: Calendar, start: CalendarPoint, rows = 9): PlannedMove[] {
  const remaining = new Map(calendar.cells.filter(cell => cell.count > 0).map(cell => [key(cell), cell]));
  const moves: PlannedMove[] = [];
  let current = start;
  const neighbors = (point: CalendarPoint): CalendarPoint[] => [
    { column: point.column + 1, row: point.row }, { column: point.column, row: point.row - 1 },
    { column: point.column - 1, row: point.row }, { column: point.column, row: point.row + 1 },
  ].filter(point => point.column >= 0 && point.column < calendar.columns && point.row >= 0 && point.row < rows);
  while (remaining.size) {
    const minimum = Math.min(...[...remaining.values()].map(cell => cell.count));
    const queue = [current];
    const previous = new Map<string, CalendarPoint | null>([[key(current), null]]);
    let target: CalendarPoint | undefined;
    for (let index = 0; index < queue.length; index++) {
      const point = queue[index];
      if (remaining.get(key(point))?.count === minimum) { target = point; break; }
      for (const next of neighbors(point)) {
        const id = key(next);
        if (!previous.has(id)) { previous.set(id, point); queue.push(next); }
      }
    }
    if (!target) throw new Error('No route to the smallest remaining contribution date.');
    const meal = remaining.get(key(target))!;
    const path: CalendarPoint[] = [];
    let cursor: CalendarPoint | null = target;
    while (cursor && key(cursor) !== key(current)) {
      path.push(cursor); cursor = previous.get(key(cursor))!;
    }
    path.reverse();
    if (!path.length) throw new Error('Start the actor on an empty entry lane.');
    path.forEach((point, index) => moves.push({ ...point, ...(index === path.length - 1 ? { meal } : {}) }));
    remaining.delete(key(target));
    current = target;
  }
  return moves;
}

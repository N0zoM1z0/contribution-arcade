import type { Calendar, Cell } from '../calendar.js';
import { BOARD } from '../layout.js';
import { THEMES, n, escapeXML, motion, discrete, renderCard, type Theme } from '../card.js';
import type { SceneDefinition, SceneEvent, SceneFilm } from './types.js';

export { BOARD, THEMES, n, escapeXML, motion, discrete };
export type { Theme };

export function center(calendar: Calendar, cell: Pick<Cell, 'column' | 'row'>): { x: number; y: number } {
  return { x: BOARD.left + (cell.column + 0.5) * BOARD.gridWidth / calendar.columns, y: BOARD.gridY + cell.row * 19 + 7.25 };
}
/** One permanent tile for each actual input day, including zero-count days.
 * Missing dates stay absent. Scene actors and effects may overlay these tiles,
 * but no producer may create a different calendar mesh or repack its dates.
 */
export function calendarGrid(calendar: Calendar, theme: Theme): string {
  const palette = THEMES[theme], size = Math.min(14.5, BOARD.gridWidth / calendar.columns - 3);
  return `<g data-calendar-grid="true">${calendar.cells.map(cell => {
    const point = center(calendar, cell);
    return `<rect data-cell-date="${cell.date}" data-column="${cell.column}" data-row="${cell.row}" data-count="${cell.count}" x="${n(point.x - size / 2)}" y="${n(point.y - size / 2)}" width="${n(size)}" height="${n(size)}" rx="3" fill="${palette.empty}"/>`;
  }).join('')}</g>`;
}
/** Color the real day tiles without adding another board mesh. */
export function calendarActivity(calendar: Calendar, theme: Theme, opacity = 1): string {
  const palette = THEMES[theme], size = Math.min(14.5, BOARD.gridWidth / calendar.columns - 3);
  return `<g opacity="${opacity}">${calendar.cells.filter(cell => cell.count > 0).map(cell => {
    const point = center(calendar, cell);
    return `<rect data-activity-date="${cell.date}" x="${n(point.x - size / 2)}" y="${n(point.y - size / 2)}" width="${n(size)}" height="${n(size)}" rx="3" fill="${palette.colors[cell.level]}"/>`;
  }).join('')}</g>`;
}
export function grid(calendar: Calendar, theme: Theme, opacity = 1): string {
  const palette = THEMES[theme];
  const size = Math.min(14.5, BOARD.gridWidth / calendar.columns - 3);
  return `<g opacity="${opacity}" class="calendar-grid">${calendar.cells.map(cell => {
    const point = center(calendar, cell);
    return `<rect x="${n(point.x - size / 2)}" y="${n(point.y - size / 2)}" width="${n(size)}" height="${n(size)}" rx="3" fill="${palette.colors[cell.level]}"/>`;
  }).join('')}</g>`;
}
export function visible(start: number, end: number, duration: number): string {
  const from = Math.max(0, Math.min(start, duration));
  const to = Math.max(from, Math.min(end, duration));
  return discrete('opacity', [
    { time: 0, value: from === 0 ? '1' : '0' },
    ...(from > 0 ? [{ time: from, value: '1' }] : []),
    ...(to < duration ? [{ time: to, value: '0' }] : []),
    { time: duration, value: from === 0 ? '1' : '0' },
  ], duration);
}
export function appear(time: number, duration: number): string { return visible(time, duration, duration); }
export function tween(attribute: string, events: { time: number; value: string | number }[], duration: number, mode = 'linear'): string {
  if (!events.length) return '';
  const frames = [...events].sort((a, b) => a.time - b.time);
  if (frames[0].time > 0) frames.unshift({ ...frames[0], time: 0 });
  if (frames.at(-1)!.time < duration) frames.push({ ...frames.at(-1)!, time: duration });
  return `<animate attributeName="${attribute}" values="${frames.map(frame => frame.value).join(';')}" keyTimes="${frames.map(frame => (frame.time / duration).toFixed(6)).join(';')}" calcMode="${mode}" dur="${n(duration)}s" repeatCount="indefinite"/>`;
}
export function text(x: number, y: number, value: string | number, color: string, size = 12, extra = ''): string {
  return `<text x="${n(x)}" y="${n(y)}" fill="${color}" font-size="${size}" ${extra}>${escapeXML(String(value))}</text>`;
}
export function randomFor(seed: string): () => number {
  let value = 2166136261;
  for (const char of seed) value = Math.imul(value ^ char.charCodeAt(0), 16777619);
  return () => { value += 0x6d2b79f5; let t = Math.imul(value ^ value >>> 15, 1 | value); t ^= t + Math.imul(t ^ t >>> 7, 61 | t); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
export function weeks(calendar: Calendar): { column: number; count: number; active: number; cells: Cell[] }[] {
  return Array.from({ length: calendar.columns }, (_, column) => {
    const cells = calendar.cells.filter(cell => cell.column === column);
    return { column, count: cells.reduce((sum, cell) => sum + cell.count, 0), active: cells.filter(cell => cell.count > 0).length, cells };
  });
}
export function colors(theme: Theme): string[] {
  const p = THEMES[theme];
  return theme === 'dark' ? [p.secondary, p.accent, '#a9b7d0', '#b9a9c9', '#8ebeb6'] : [p.secondary, p.accent, '#627d9f', '#8a729c', '#4f9088'];
}

/** Each producer owns its model and drawing; the shared card owns the shell. */
export function film(calendar: Calendar, definition: Pick<SceneDefinition, 'id' | 'number' | 'title' | 'description'>, options: {
  duration: number;
  events: SceneEvent[];
  metrics: Record<string, string | number>;
  checkpoints?: number[];
  draw: (theme: Theme, animated: boolean) => string;
  footer?: (theme: Theme, animated: boolean) => string;
}): SceneFilm {
  const events = [...options.events].sort((a, b) => a.time - b.time);
  return {
    duration: options.duration, events, metrics: options.metrics,
    checkpoints: options.checkpoints || [2, options.duration * 0.5, options.duration - 2],
    render: (theme, animated = true) => renderCard(calendar, theme, {
      label: `${definition.number} / ${definition.title.toUpperCase()}`, scene: definition.id,
      duration: options.duration, description: definition.description,
      attributes: { active: calendar.activeDays, events: events.length },
      content: calendarGrid(calendar, theme) + (animated ? `<g class="reduced">${options.draw(theme, false)}</g><g class="animated">${options.draw(theme, true)}</g>` : options.draw(theme, false)),
      footer: options.footer?.(theme, animated) || '',
    }),
  };
}

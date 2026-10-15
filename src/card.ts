import type { Calendar } from './calendar.js';
import { BOARD } from './layout.js';

export type Theme = 'dark' | 'light';
export const THEMES = {
  dark: {
    background: '#111a17', border: '#2a3730', ink: '#eef3e9', muted: '#8b9c90',
    empty: '#202d26', colors: ['#202d26', '#365c49', '#58866a', '#88b591', '#c3dfb5'],
    accent: '#efc8a4', line: '#2b3930', secondary: '#b5ccb0',
  },
  light: {
    background: '#fbfcf8', border: '#dce3d6', ink: '#26392c', muted: '#788574',
    empty: '#eaf0e4', colors: ['#eaf0e4', '#c4d8b8', '#98bc8d', '#6d986e', '#426c50'],
    accent: '#b66d49', line: '#e0e7d9', secondary: '#53765a',
  },
};
export const escapeXML = (value: string): string => value.replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;',
})[character]!);
export const n = (value: number): string => Number(value.toFixed(3)).toString();
export const number = (value: number): string => value.toLocaleString('en-US');

export function discrete(attribute: string, events: { time: number; value: string }[], duration: number): string {
  return `<animate attributeName="${attribute}" values="${events.map(event => event.value).join(';')}" keyTimes="${events.map(event => (event.time / duration).toFixed(6)).join(';')}" calcMode="discrete" dur="${n(duration)}s" repeatCount="indefinite"/>`;
}

export function motion(points: { time: number; x: number; y: number }[], duration: number): string {
  const ordered = [...points].sort((a, b) => a.time - b.time);
  const frames = [{ ...ordered[0], time: 0 }];
  for (const point of ordered) {
    if (point.time - frames.at(-1)!.time < 0.00001) frames[frames.length - 1] = point;
    else frames.push(point);
  }
  frames.push({ ...frames.at(-1)!, time: duration });
  return `<animateTransform attributeName="transform" type="translate" values="${frames.map(point => `${n(point.x)} ${n(point.y)}`).join(';')}" keyTimes="${frames.map(point => (point.time / duration).toFixed(6)).join(';')}" dur="${n(duration)}s" repeatCount="indefinite"/>`;
}

function monthLabels(calendar: Calendar, muted: string): string {
  let previous = '';
  return calendar.cells.filter(day => day.row === 0 || day.date === calendar.from).map(day => {
    const month = day.date.slice(0, 7);
    if (month === previous) return '';
    previous = month;
    const x = BOARD.left + day.column * BOARD.gridWidth / calendar.columns + 2;
    if (x > BOARD.right - 24) return '';
    const label = new Date(`${day.date}T00:00:00Z`).toLocaleString('en-US', { month: 'short', timeZone: 'UTC' });
    return `<text x="${n(x)}" y="97" fill="${muted}" font-size="10">${label}</text>`;
  }).join('');
}

export function renderCard(calendar: Calendar, theme: Theme, options: {
  label: string;
  scene: string;
  description: string;
  duration: number;
  content: string;
  footer?: string;
  attributes?: Record<string, string | number>;
}): string {
  const palette = THEMES[theme];
  const { width, height } = BOARD;
  const fromYear = calendar.from.slice(0, 4);
  const toYear = calendar.to.slice(0, 4);
  const attributes = Object.entries(options.attributes || {}).map(([key, value]) => ` data-${key}="${escapeXML(String(value))}"`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" style="background:${palette.background};border-radius:20px" role="img" aria-labelledby="title desc" data-duration="${n(options.duration)}" data-scene="${options.scene}"${attributes}>
  <title id="title">${escapeXML(calendar.login)} · Contribution Arcade · ${escapeXML(options.label)}</title>
  <desc id="desc">${number(calendar.total)} GitHub contributions across ${calendar.activeDays} active days, ${calendar.from} to ${calendar.to}. ${escapeXML(options.description)}</desc>
  <style>text{font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif}.mono{font-family:'SFMono-Regular',Consolas,'Liberation Mono',monospace}.reduced{display:none}@media(prefers-reduced-motion:reduce){.animated{display:none}.reduced{display:inline}[data-cleared-at]{opacity:var(--still-opacity,1)!important}}</style>
  <rect x="0.5" y="0.5" width="${width - 1}" height="${height - 1}" rx="20" fill="${palette.background}" stroke="${palette.border}"/>
  <g fill="${palette.secondary}"><rect x="48" y="32" width="6" height="6" rx="1.3"/><rect x="57" y="32" width="6" height="6" rx="1.3" opacity="0.5"/><rect x="48" y="41" width="6" height="6" rx="1.3" opacity="0.5"/><rect x="57" y="41" width="6" height="6" rx="1.3"/></g>
  <text x="77" y="45" font-size="14" font-weight="600" fill="${palette.ink}" letter-spacing="-0.2">contribution arcade</text>
  <text x="1072" y="44" text-anchor="end" font-size="10" class="mono" letter-spacing="1.5" fill="${palette.muted}">${escapeXML(options.label)}</text>
  <path d="M48 65H1072" stroke="${palette.line}"/>
  ${monthLabels(calendar, palette.muted)}
  ${options.content}
  <path d="M48 376H1072" stroke="${palette.line}"/>
  <text x="48" y="406" font-size="15" font-weight="600" fill="${palette.ink}">@${escapeXML(calendar.login)}</text>
  <text x="48" y="425" font-size="10" fill="${palette.muted}" class="mono">${fromYear}${fromYear === toYear ? '' : ` — ${toYear}`}</text>
  <text x="343" y="406" font-size="15" font-weight="600" fill="${palette.ink}">${number(calendar.total)}<tspan dx="7" font-size="11" font-weight="400" fill="${palette.muted}">contributions</tspan></text>
  <text x="343" y="425" font-size="10" fill="${palette.muted}">${calendar.activeDays} active days · ${calendar.longestStreak} day longest streak</text>
  ${options.footer || ''}
  <g transform="translate(958 401)">${palette.colors.map((color, index) => `<rect x="${index * 16}" width="11" height="11" rx="2.5" fill="${color}"/>`).join('')}</g>
  <text x="1072" y="425" text-anchor="end" font-size="9" letter-spacing="1" fill="${palette.muted}" class="mono">YOUR COMMITS. YOUR GAME.</text>
</svg>`.replace(/[ \t]+$/gm, '');
}

#!/usr/bin/env node
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { parseArgs } from 'node:util';
import { fetchCalendar, normalizeCalendar, type CalendarInput } from './calendar.js';
import { simulate } from './breakout.js';
import { renderSVG } from './svg.js';
import { simulateSnake } from './snake.js';
import { renderSnakeSVG } from './snake-svg.js';
import { fetchContext } from './context.js';
import { scenes } from './scenes/index.js';
import type { SceneContext } from './scenes/types.js';

async function main(): Promise<void> {
  const { values } = parseArgs({ options: {
    username: { type: 'string' }, input: { type: 'string' }, output: { type: 'string', default: 'generated' },
    seed: { type: 'string' }, context: { type: 'string' }, help: { type: 'boolean', short: 'h' },
  } });
  if (values.help) {
    console.log('Contribution Arcade\n\nnode lib/cli.js --username N0zoM1z0 [--output generated] [--seed name]\nnode lib/cli.js --input generated/calendar.json\n\nGenerates all nineteen scenes in both themes, with animated and static exports. Optional offline enrichment: --context generated/context.json.\nAuthentication: GH_TOKEN or GITHUB_TOKEN, with gh CLI as a local fallback.');
    return;
  }
  if (!values.input && !values.username) throw new Error('Provide --username or --input. Use --help for examples.');
  let input: CalendarInput;
  let token: string | undefined;
  if (values.input) input = JSON.parse(await readFile(resolve(values.input), 'utf8')) as CalendarInput;
  else {
    token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
    if (!token) {
      try { token = execFileSync('gh', ['auth', 'token'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); }
      catch { throw new Error('Set GH_TOKEN / GITHUB_TOKEN, or sign in with gh auth login.'); }
    }
    input = await fetchCalendar(values.username!, token);
  }
  const calendar = normalizeCalendar(input);
  let context: SceneContext = { source: 'calendar-only', languages: [], coverage: 'Calendar counts only; no language or typed activity attribution.' };
  if (values.context) context = JSON.parse(await readFile(resolve(values.context), 'utf8')) as SceneContext;
  else if (token) {
    try { context = await fetchContext(calendar.login, calendar.from, calendar.to, token); }
    catch { console.warn('Public activity enrichment unavailable; using calendar-only scenes.'); }
  }
  const additions = scenes.map(definition => ({ definition, film: definition.build(calendar, context) }));
  const scene = simulate(calendar, values.seed);
  const snake = simulateSnake(calendar);
  const directory = resolve(values.output!);
  await mkdir(directory, { recursive: true });
  for (const theme of ['dark', 'light'] as const) {
    await writeFile(resolve(directory, `breakout-${theme}.svg`), renderSVG(calendar, scene, theme));
    await writeFile(resolve(directory, `breakout-${theme}-static.svg`), renderSVG(calendar, scene, theme, false));
    await writeFile(resolve(directory, `snake-${theme}.svg`), renderSnakeSVG(calendar, snake, theme));
    await writeFile(resolve(directory, `snake-${theme}-static.svg`), renderSnakeSVG(calendar, snake, theme, false));
  }
  for (const { definition, film } of additions) {
    for (const theme of ['dark', 'light'] as const) {
      await writeFile(resolve(directory, `${definition.id}-${theme}.svg`), film.render(theme));
      await writeFile(resolve(directory, `${definition.id}-${theme}-static.svg`), film.render(theme, false));
    }
    await writeFile(resolve(directory, `${definition.id}-summary.json`), `${JSON.stringify({
      username: calendar.login, id: definition.id, duration: film.duration, metrics: film.metrics,
      checkpoints: film.checkpoints, events: film.events,
    }, null, 2)}\n`);
  }
  await writeFile(resolve(directory, 'context.json'), `${JSON.stringify(context, null, 2)}\n`);
  await writeFile(resolve(directory, 'calendar.json'), `${JSON.stringify(input, null, 2)}\n`);
  await writeFile(resolve(directory, 'summary.json'), `${JSON.stringify({
    username: calendar.login, from: calendar.from, to: calendar.to,
    contributions: calendar.total, activeDays: calendar.activeDays, longestStreak: calendar.longestStreak,
    duration: Number(scene.duration.toFixed(2)), cleared: scene.cleared, hits: scene.totalHits,
    balls: scene.balls.length,
  }, null, 2)}\n`);
  await writeFile(resolve(directory, 'snake-summary.json'), `${JSON.stringify({
    username: calendar.login, from: calendar.from, to: calendar.to,
    contributions: calendar.total, activeDays: calendar.activeDays,
    duration: Number(snake.duration.toFixed(2)), playEnd: snake.playEnd,
    initialLength: snake.initialLength, finalLength: snake.finalLength, growthEvery: snake.growthEvery, maxLength: snake.maxLength, order: 'count-ascending', eaten: snake.meals.length,
    meals: snake.meals.map(meal => ({ time: meal.time, date: meal.cell.date, count: meal.cell.count, length: meal.length })),
  }, null, 2)}\n`);
  await writeFile(resolve(directory, 'arcade.json'), `${JSON.stringify({
    username: calendar.login, from: calendar.from, to: calendar.to,
    scenes: [
      { id: 'breakout', category: 'Arcade', number: '01', title: 'Breakout', caption: 'Your history is the level.',
        description: 'One ball to begin. A long streak brings a second, then a third. A gentle start, a little more momentum, and your year begins again.',
        duration: Number(scene.duration.toFixed(2)) },
      { id: 'snake', category: 'Arcade', number: '02', title: 'Growing Snake', caption: 'Small steps. A little growth.',
        description: `Start with the smallest contribution counts and plan a path upward. Grow once every ${snake.growthEvery} dates, with a compact ${snake.maxLength}-segment limit.`,
        duration: Number(snake.duration.toFixed(2)) },
      ...additions.map(({ definition, film }) => ({
        id: definition.id, number: definition.number, title: definition.title, caption: definition.caption,
        description: definition.description, category: definition.category, duration: Number(film.duration.toFixed(3)),
      })),
    ],
  }, null, 2)}\n`);
  console.log(`@${calendar.login}: ${calendar.total.toLocaleString('en-US')} contributions · ${calendar.activeDays} active days`);
  console.log(`${scene.cleared}/${calendar.activeDays} bricks cleared · ${scene.totalHits} hits · ${scene.balls.length} ball(s) · ${scene.duration.toFixed(1)}s loop`);
  console.log(`Snake: ${snake.initialLength} → ${snake.finalLength} segments · ${snake.meals.length} days eaten · ${snake.duration.toFixed(1)}s loop`);
  console.log(`${scenes.length + 2} scenes · ${(scenes.length + 2) * 4} SVG exports written to ${directory}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Generation failed.');
  process.exitCode = 1;
});

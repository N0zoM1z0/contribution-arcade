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

async function main(): Promise<void> {
  const { values } = parseArgs({ options: {
    username: { type: 'string' }, input: { type: 'string' }, output: { type: 'string', default: 'generated' },
    seed: { type: 'string' }, help: { type: 'boolean', short: 'h' },
  } });
  if (values.help) {
    console.log('Contribution Arcade\n\nnode lib/cli.js --username N0zoM1z0 [--output generated] [--seed name]\nnode lib/cli.js --input generated/calendar.json\n\nGenerates Breakout and Growing Snake in both themes.\nAuthentication: GH_TOKEN or GITHUB_TOKEN, with gh CLI as a local fallback.');
    return;
  }
  if (!values.input && !values.username) throw new Error('Provide --username or --input. Use --help for examples.');
  let input: CalendarInput;
  if (values.input) input = JSON.parse(await readFile(resolve(values.input), 'utf8')) as CalendarInput;
  else {
    let token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
    if (!token) {
      try { token = execFileSync('gh', ['auth', 'token'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); }
      catch { throw new Error('Set GH_TOKEN / GITHUB_TOKEN, or sign in with gh auth login.'); }
    }
    input = await fetchCalendar(values.username!, token);
  }
  const calendar = normalizeCalendar(input);
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
    initialLength: snake.initialLength, finalLength: snake.finalLength, eaten: snake.meals.length,
    meals: snake.meals.map(meal => ({ time: meal.time, date: meal.cell.date, length: meal.length })),
  }, null, 2)}\n`);
  await writeFile(resolve(directory, 'arcade.json'), `${JSON.stringify({
    username: calendar.login, from: calendar.from, to: calendar.to,
    scenes: [
      { id: 'breakout', number: '01', title: 'Breakout', caption: 'Your history is the level.',
        description: 'One ball to begin. A long streak brings a second, then a third. A gentle start, a little more momentum, and your year begins again.',
        duration: Number(scene.duration.toFixed(2)) },
      { id: 'snake', number: '02', title: 'Growing Snake', caption: 'Every good day makes you grow.',
        description: `Four segments to begin. One more for every active day. Watch your year become a ${snake.finalLength}-segment snake, one small square at a time.`,
        duration: Number(snake.duration.toFixed(2)) },
    ],
  }, null, 2)}\n`);
  console.log(`@${calendar.login}: ${calendar.total.toLocaleString('en-US')} contributions · ${calendar.activeDays} active days`);
  console.log(`${scene.cleared}/${calendar.activeDays} bricks cleared · ${scene.totalHits} hits · ${scene.balls.length} ball(s) · ${scene.duration.toFixed(1)}s loop`);
  console.log(`Snake: ${snake.initialLength} → ${snake.finalLength} segments · ${snake.meals.length} days eaten · ${snake.duration.toFixed(1)}s loop`);
  console.log(`SVGs written to ${directory}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Generation failed.');
  process.exitCode = 1;
});

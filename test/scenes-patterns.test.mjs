import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalizeCalendar } from '../lib/calendar.js';
import { nextGeneration, buildLifeModel, buildAntModel, buildWeatherModel, buildMusicModel, patternsScenes } from '../lib/scenes/patterns.js';
const real = normalizeCalendar(JSON.parse(readFileSync('generated/calendar.json')));
const empty = { ...real, total: 0, activeDays: 0, longestStreak: 0, cells: real.cells.map(cell => ({ ...cell, count: 0, level: 0 })) };

test('Conway rules preserve blocks, alternate blinkers, and keep empty worlds empty', () => {
  const block = new Set(['1,1', '1,2', '2,1', '2,2']);
  assert.deepEqual(nextGeneration(block, 6, 6), block);
  const blinker = new Set(['1,2', '2,2', '3,2']);
  const upright = nextGeneration(blinker, 6, 6);
  assert.deepEqual(upright, new Set(['2,1', '2,2', '2,3']));
  assert.deepEqual(nextGeneration(upright, 6, 6), blinker);
  assert.deepEqual(nextGeneration(new Set(), 6, 6), new Set());
  assert.deepEqual(nextGeneration(new Set(['0,0']), 6, 6), new Set());
  const model = buildLifeModel(real);
  assert.equal(model.generations[0].alive.length, real.activeDays);
  assert.ok(buildLifeModel(empty).generations.every(generation => !generation.alive.length));
});

test('Life uses exactly the original day coordinates and never births into an absent date', () => {
  const cells = [
    { date: '2026-01-04', column: 0, row: 0, count: 1, level: 1 },
    { date: '2026-01-05', column: 0, row: 1, count: 1, level: 1 },
    { date: '2026-01-11', column: 1, row: 0, count: 1, level: 1 },
  ];
  const calendar = { ...real, columns: 2, cells, activeDays: 3, total: 3 };
  const before = structuredClone(calendar), model = buildLifeModel(calendar);
  assert.deepEqual(calendar, before);
  assert.equal(model.width, 2); assert.equal(model.height, 7);
  assert.deepEqual(model.generations[0].alive, ['0,0', '0,1', '1,0']);
  const available = new Set(cells.map(cell => `${cell.column},${cell.row}`));
  assert.ok(model.generations.every(generation => generation.alive.every(key => available.has(key))));
  assert.ok(!model.generations[1].alive.includes('1,1'), 'a missing date cannot become a synthetic tile');
});

test('ants collect each real deposit once, smallest first, and return before their next trip', () => {
  const model = buildAntModel(real);
  assert.equal(model.trips.length, real.activeDays);
  assert.equal(model.totalResources, real.total);
  assert.equal(new Set(model.trips.map(trip => trip.cell.date)).size, real.activeDays);
  for (const [index, trip] of model.trips.entries()) {
    assert.ok(trip.depart < trip.harvest && trip.harvest < trip.deposit);
    if (index) { assert.ok(trip.harvest > model.trips[index - 1].harvest); assert.ok(trip.cell.count >= model.trips[index - 1].cell.count); }
    const previous = model.trips.slice(0, index).filter(previous => previous.ant === trip.ant).at(-1);
    if (previous) assert.ok(previous.deposit < trip.depart);
  }
  assert.equal(buildAntModel(empty).trips.length, 0);
});

test('weather follows real weekly counts and only positive records celebrate', () => {
  const model = buildWeatherModel(real);
  assert.equal(model.states.reduce((sum, state) => sum + state.count, 0), real.total);
  let peak = 0;
  for (const state of model.states) {
    assert.equal(state.record, state.count > peak);
    assert.equal(state.sky === 'rain', state.count === 0);
    peak = Math.max(peak, state.count);
  }
  assert.ok(buildWeatherModel(empty).states.every(state => state.sky === 'rain' && !state.record));
});

test('missing dates break weather streaks instead of implying unseen activity', () => {
  const cells = real.cells.slice(0, 14).filter((_, index) => index !== 6).map(cell => ({ ...cell, count: 1, level: 1 }));
  const model = buildWeatherModel({ ...real, columns: 2, cells, activeDays: cells.length, total: cells.length });
  assert.deepEqual(model.states.map(state => state.streak), [6, 7]);
});

test('the silent score preserves every week and activity note without creating contributions', () => {
  const model = buildMusicModel(real);
  assert.equal(model.beats.length, real.columns);
  assert.equal(model.beats.reduce((sum, beat) => sum + beat.notes.length, 0), real.activeDays);
  assert.equal(model.beats.reduce((sum, beat) => sum + beat.count, 0), real.total);
  assert.ok(buildMusicModel(empty).beats.every(beat => !beat.notes.length && !beat.pitch && !beat.strength));
});

test('pattern films are deterministic, script-free, and retain both static themes', () => {
  for (const calendar of [real, empty]) for (const definition of patternsScenes) {
    const scene = definition.build(calendar);
    assert.deepEqual(scene.events, definition.build(calendar).events);
    assert.ok(scene.events.every((event, index) => event.time >= 0 && event.time < scene.duration && (!index || event.time >= scene.events[index - 1].time)));
    for (const theme of ['dark', 'light']) {
      const svg = scene.render(theme);
      assert.ok(svg.includes(`data-scene="${definition.id}"`));
      assert.ok(!/NaN|Infinity|<script|<foreignObject/.test(svg));
      assert.ok(!scene.render(theme, false).includes('<animate'));
      for (const match of svg.matchAll(/keyTimes="([^"]+)"/g)) {
        const times = match[1].split(';').map(Number);
        assert.equal(times[0], 0); assert.equal(times.at(-1), 1);
        assert.ok(times.every((time, index) => !index || time >= times[index - 1]));
      }
    }
  }
});

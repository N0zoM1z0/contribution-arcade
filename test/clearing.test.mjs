import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeCalendar } from '../lib/calendar.js';
import { calendarClears, calendarGrid } from '../lib/scenes/kit.js';

const calendar = normalizeCalendar({ login: 'clearing', calendar: { totalContributions: 4, weeks: [
  { contributionDays: [
    { date: '2026-01-04', weekday: 0, contributionCount: 0, contributionLevel: 'NONE' },
    { date: '2026-01-05', weekday: 1, contributionCount: 1, contributionLevel: 'FIRST_QUARTILE' },
  ] },
  { contributionDays: [
    { date: '2026-01-11', weekday: 0, contributionCount: 3, contributionLevel: 'FOURTH_QUARTILE' },
  ] },
] } });

test('successful interactions clear dates; exposure, damage, and misses retain them', () => {
  const events = [
    { time: 1, type: 'mole-pop', date: '2026-01-05' },
    { time: 2, type: 'hammer-miss', date: '2026-01-05' },
    { time: 3, type: 'ship-fire', date: '2026-01-11' },
    { time: 4, type: 'hammer-hit', date: '2026-01-05' },
    { time: 5, type: 'hammer-hit', date: '2026-01-05' },
  ];
  assert.deepEqual(calendarClears(calendar, events.slice(0, 3)), []);
  assert.deepEqual(calendarClears(calendar, events), [{ date: '2026-01-05', time: 4 }]);
  for (const type of ['pellet', 'invader-hit', 'ore-excavate', 'room-loot', 'harvest']) {
    assert.deepEqual(calendarClears(calendar, [{ time: 2, type, date: '2026-01-11' }]), [{ date: '2026-01-11', time: 2 }]);
  }
});

test('a completed row removes its actual zero-count and active tiles without filling missing dates', () => {
  const clears = calendarClears(calendar, [{ time: 3, type: 'row-clear', data: { rows: [0] } }]);
  assert.deepEqual(clears, [{ date: '2026-01-04', time: 3 }, { date: '2026-01-11', time: 3 }]);
  const before = calendarGrid(calendar, 'dark', { duration: 8, clears, animated: false, stillTime: 2 });
  const after = calendarGrid(calendar, 'dark', { duration: 8, clears, animated: false, stillTime: 4 });
  assert.equal((before.match(/opacity="0"/g) || []).length, 0);
  assert.equal((after.match(/opacity="0"/g) || []).length, 2);
  assert.equal((after.match(/data-cell-date=/g) || []).length, 3, 'clearing changes visibility, not the original calendar geometry');
  assert.ok(!after.includes('<animate'), 'the corresponding still frame needs no animation');
});

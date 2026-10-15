import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { THEMES } from '../lib/card.js';

async function seek(page, time) {
  await page.evaluate(time => { document.documentElement.pauseAnimations(); document.documentElement.setCurrentTime(time); }, time);
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}
async function state(page) {
  return page.locator('.animated [data-actor="civilization-rocket"]').evaluate(rocket => {
    const matrix = rocket.getCTM();
    return { x: matrix.e, y: matrix.f, opacity: Number(getComputedStyle(rocket).opacity),
      flame: Number(getComputedStyle(rocket.querySelector('[data-rocket-flame]')).opacity), bottom: rocket.getBoundingClientRect().bottom };
  });
}

/** Verify ignition, actual upward travel beyond the ribbon, departure, and reset. */
export async function verifyCivilizationLaunch(page, summary, theme) {
  const ignition = summary.events.find(event => event.type === 'rocket-ignition');
  if (!ignition) {
    assert.equal(await page.locator('[data-actor="civilization-rocket"]').count(), 0);
    return;
  }
  const liftoff = summary.events.find(event => event.type === 'rocket-liftoff').time;
  const escape = summary.events.find(event => event.type === 'rocket-escape').time;
  const space = summary.events.find(event => event.type === 'era' && event.data.era === 6).time;
  assert.ok(ignition.time > Math.max(...summary.events.filter(event => event.type === 'resources').map(event => event.time)));
  await seek(page, space - .01); assert.equal((await state(page)).opacity, 0);
  await seek(page, ignition.time - .01);
  const parked = await state(page); assert.equal(parked.opacity, 1); assert.equal(parked.flame, 0);
  await seek(page, ignition.time + .1);
  const burning = await state(page); assert.equal(burning.flame, 1); assert.equal(burning.y, parked.y);
  await seek(page, liftoff + .8); assert.ok((await state(page)).y < parked.y - 10);
  await seek(page, liftoff + 2.8);
  const flying = await state(page);
  assert.ok(flying.y < 270 && flying.opacity === 1, 'The rocket must leave the settlement ribbon.');
  const frame = await page.screenshot(), inspector = await page.context().browser().newPage();
  try {
    const pixel = await inspector.evaluate(async ({ png, x, y }) => {
      const image = new Image(); image.src = `data:image/png;base64,${png}`; await image.decode();
      const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
      const context = canvas.getContext('2d'); context.drawImage(image, 0, 0);
      return [...context.getImageData(Math.round(x), Math.round(y), 1, 1).data].slice(0, 3);
    }, { png: frame.toString('base64'), x: flying.x, y: flying.y - 15 });
    const rocketColor = THEMES[theme].secondary.match(/[\da-f]{2}/gi).map(hex => Number.parseInt(hex, 16));
    assert.deepEqual(pixel, rocketColor, 'The flying rocket must actually paint above the old clip boundary.');
  } finally { await inspector.close(); }
  await seek(page, escape - .02); assert.ok((await state(page)).bottom < 0, 'The complete rocket and exhaust must fly off the card.');
  await seek(page, escape + .02); assert.equal((await state(page)).opacity, 0);
  await seek(page, summary.duration + .01); assert.equal((await state(page)).opacity, 0);
  await seek(page, ignition.time - .01); assert.deepEqual(await state(page), parked, 'Replay restores the unlit rocket on its pad.');
  console.log(`Civilization launch passed: ${theme}, ignition, liftoff, visible ascent, escape, and replay.`);
}

if (process.argv[1]?.endsWith('/verify-civilization.mjs')) {
  const { chromium } = await import('playwright');
  const { serve } = await import('./serve.mjs');
  const summary = JSON.parse(await readFile('generated/civilization-summary.json', 'utf8'));
  const server = await serve(0), browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1120, height: 448 } });
    for (const theme of ['dark', 'light']) {
      await page.goto(`http://127.0.0.1:${server.address().port}/generated/civilization-${theme}.svg`);
      await verifyCivilizationLaunch(page, summary, theme);
      if (process.argv.includes('--capture')) {
        await seek(page, summary.checkpoints.at(-1));
        await page.screenshot({ path: `previews/civilization-${theme}.png` });
      }
    }
  } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
}

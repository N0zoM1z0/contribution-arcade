const collection = document.querySelector('#collection');
const index = document.querySelector('#scene-index');
const template = document.querySelector('#scene-template');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const players = new Map();
let theme = document.documentElement.dataset.theme;
let category = 'All';
const visibility = new IntersectionObserver(entries => {
  for (const entry of entries) {
    const player = players.get(entry.target.dataset.scene);
    if (player) { player.visible = entry.isIntersecting; updatePause(player); }
  }
}, { rootMargin: '120px' });

function root(player) {
  try { return player.board.contentDocument?.documentElement; }
  catch { return null; }
}

function updatePause(player) {
  const svg = root(player);
  if (svg?.pauseAnimations) (player.paused || !player.visible) ? svg.pauseAnimations() : svg.unpauseAnimations();
  player.pause.setAttribute('aria-pressed', String(player.paused));
  player.pause.setAttribute('aria-label', `${player.paused ? 'Play' : 'Pause'} ${player.title}`);
  player.icon.setAttribute('d', player.paused ? 'M7 4l8 6-8 6Z' : 'M7 5v10M13 5v10');
}

function updateTime(player) {
  player.time.textContent = reducedMotion.matches ? 'STILL FRAME · REDUCED MOTION' : `${Math.round(player.duration)}s LOOP · AUTOPLAY`;
}

function setAsset(player) {
  const path = `generated/${player.id}-${theme}.svg`;
  player.board.data = path;
  player.download.href = path;
}

function addScene(scene) {
  if (!/^[a-z][a-z0-9-]*$/.test(scene.id)) throw new Error('Invalid scene identifier.');
  const fragment = template.content.cloneNode(true);
  const section = fragment.querySelector('.scene');
  section.id = scene.id;
  section.dataset.scene = scene.id;
  section.setAttribute('aria-labelledby', `${scene.id}-title`);
  const title = fragment.querySelector('[data-role="title"]');
  title.id = `${scene.id}-title`;
  title.textContent = scene.title;
  fragment.querySelector('.number').textContent = scene.number;
  fragment.querySelector('.scene-subtitle').textContent = scene.caption;
  fragment.querySelector('[data-role="description"]').textContent = scene.description;
  const player = {
    ...scene, section, paused: false, visible: true, preservedTime: 0,
    board: fragment.querySelector('.board'),
    pause: fragment.querySelector('[data-action="pause"]'),
    replay: fragment.querySelector('[data-action="replay"]'),
    download: fragment.querySelector('.download'),
    icon: fragment.querySelector('[data-role="pause-icon"]'),
    time: fragment.querySelector('.time'),
  };
  player.board.id = `${scene.id}-board`;
  player.board.setAttribute('aria-label', `${scene.title} animation made from GitHub contributions`);
  player.replay.setAttribute('aria-label', `Replay ${scene.title}`);
  player.download.setAttribute('aria-label', `Download ${scene.title} SVG`);
  player.board.addEventListener('load', () => {
    const svg = root(player);
    if (svg?.setCurrentTime) svg.setCurrentTime(player.preservedTime);
    updatePause(player);
    updateTime(player);
  });
  player.pause.addEventListener('click', () => { player.paused = !player.paused; updatePause(player); });
  player.replay.addEventListener('click', () => {
    player.preservedTime = 0;
    root(player)?.setCurrentTime?.(0);
    player.paused = false;
    updatePause(player);
  });
  updatePause(player);
  updateTime(player);
  setAsset(player);
  players.set(scene.id, player);
  collection.append(fragment);

  visibility.observe(section);
}

document.querySelectorAll('button[data-theme]').forEach(button => button.addEventListener('click', () => {
  if (theme === button.dataset.theme) return;
  theme = button.dataset.theme;
  document.documentElement.dataset.theme = theme;
  document.querySelectorAll('button[data-theme]').forEach(other => other.setAttribute('aria-pressed', String(other === button)));
  for (const player of players.values()) {
    player.preservedTime = root(player)?.getCurrentTime?.() ?? player.preservedTime;
    setAsset(player);
  }
}));

document.addEventListener('keydown', event => {
  if (event.code !== 'Space' || event.target !== document.body) return;
  const player = [...players.values()].find(player => {
    const rect = player.section.getBoundingClientRect();
    return rect.bottom > 0 && rect.top < innerHeight;
  });
  if (player) { event.preventDefault(); player.pause.click(); }
});
reducedMotion.addEventListener('change', () => players.forEach(updateTime));

async function initialize() {
  const response = await fetch('generated/arcade.json');
  if (!response.ok) throw new Error('The arcade catalog is not available.');
  const catalog = await response.json();
  if (!Array.isArray(catalog.scenes) || !catalog.scenes.length) throw new Error('The arcade catalog has no scenes.');
  document.title = `Contribution Arcade · ${catalog.username}`;
  const profile = document.querySelector('#profile');
  profile.textContent = `@${catalog.username}`;
  profile.href = `https://github.com/${encodeURIComponent(catalog.username)}`;
  if (catalog.layout) document.querySelector('#calendar-label').textContent = `${catalog.layout.days} original day tiles · ${catalog.layout.columns} weeks`;

  const date = value => new Date(`${value}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' }).toUpperCase();
  document.querySelector('#date-label').textContent = `${date(catalog.from)} — ${date(catalog.to)}`;
  collection.replaceChildren();
  catalog.scenes.forEach(addScene);
  for (const name of ['All', 'Arcade', 'Worlds', 'Journeys', 'Patterns']) {
    const button = document.createElement('button');
    button.type = 'button';
    const count = name === 'All' ? catalog.scenes.length : catalog.scenes.filter(scene => scene.category === name).length;
    button.append(document.createTextNode(name));
    const badge = document.createElement('span'); badge.textContent = count; button.append(badge);
    button.setAttribute('aria-pressed', String(name === category));
    button.addEventListener('click', () => {
      category = name;
      for (const other of index.querySelectorAll('button')) other.setAttribute('aria-pressed', String(other === button));
      for (const player of players.values()) player.section.hidden = category !== 'All' && player.category !== category;
    });
    index.append(button);
  }
  collection.setAttribute('aria-busy', 'false');
  if (location.hash) document.getElementById(location.hash.slice(1))?.scrollIntoView();
}

initialize().catch(() => {
  collection.innerHTML = '<p class="error">Generate the arcade with <code>npm run generate -- --username YOUR_USERNAME</code>, then open this page with <code>npm run preview</code>. You can also view the <a href="generated/breakout-dark.svg">Breakout SVG</a> or <a href="generated/snake-dark.svg">Growing Snake SVG</a> directly.</p>';
  collection.setAttribute('aria-busy', 'false');
});

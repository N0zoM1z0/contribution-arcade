import { arcadeScenes } from './arcade.js';
import { worldsScenes } from './worlds.js';
import { journeysScenes } from './journeys.js';
import { patternsScenes } from './patterns.js';

export const scenes = [...arcadeScenes, ...worldsScenes, ...journeysScenes, ...patternsScenes]
  .sort((a, b) => Number(a.number) - Number(b.number));

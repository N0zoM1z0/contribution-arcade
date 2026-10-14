import type { Calendar } from '../calendar.js';
import type { Theme } from '../card.js';

export interface SceneContext {
  source: 'github-public' | 'calendar-only';
  languages: { name: string; weight: number; color: string }[];
  activity?: { commits: number; issues: number; pullRequests: number; reviews: number };
}
export interface SceneEvent {
  time: number;
  type: string;
  date?: string;
  value?: number;
  data?: Record<string, unknown>;
}
export interface SceneFilm {
  duration: number;
  events: SceneEvent[];
  metrics: Record<string, string | number>;
  checkpoints: number[];
  render: (theme: Theme, animated?: boolean) => string;
}
export interface SceneDefinition {
  id: string;
  number: string;
  title: string;
  caption: string;
  description: string;
  category: 'Arcade' | 'Worlds' | 'Journeys' | 'Patterns';
  build: (calendar: Calendar, context?: SceneContext) => SceneFilm;
}

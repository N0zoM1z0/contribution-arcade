import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeContext } from '../lib/context.js';
test('public enrichment excludes private data and describes its sample boundaries', () => {
  const item = (privateRepo, count, name = 'TypeScript') => ({ repository: { isPrivate: privateRepo, primaryLanguage: { name, color: '#123456' } }, contributions: { totalCount: count, nodes: [{ commitCount: count }] } });
  const context = normalizeContext({ commits: [item(false, 5), item(true, 999, 'SECRET'), item(false, 3)], issues: [item(false, 2), item(true, 999)], pullRequests: [item(false, 4)], reviews: [item(false, 7)] });
  assert.deepEqual(context.activity, { commits: 8, issues: 2, pullRequests: 4, reviews: 7 });
  assert.deepEqual(context.languages, [{ name: 'TypeScript', weight: 8, color: '#123456' }]);
  assert.ok(!JSON.stringify(context).includes('SECRET'));
  assert.match(context.coverage, /100 repositories/);
});

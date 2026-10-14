import type { SceneContext } from './scenes/types.js';

interface RepositoryActivity {
  repository: { isPrivate: boolean; primaryLanguage?: { name: string; color: string | null } | null };
  contributions: { totalCount: number; nodes?: { commitCount: number }[] };
}
interface PublicCollection {
  commits: RepositoryActivity[];
  issues: RepositoryActivity[];
  pullRequests: RepositoryActivity[];
  reviews: RepositoryActivity[];
}
/** Context is an explicitly bounded public sample, never a day-to-language claim. */
export const CONTEXT_QUERY = `query($login: String!, $from: DateTime!, $to: DateTime!) {
  user(login: $login) {
    contributionsCollection(from: $from, to: $to) {
      commits: commitContributionsByRepository(maxRepositories: 100) {
        repository { isPrivate primaryLanguage { name color } }
        contributions(first: 100) { totalCount nodes { commitCount } }
      }
      issues: issueContributionsByRepository(maxRepositories: 100) {
        repository { isPrivate } contributions { totalCount }
      }
      pullRequests: pullRequestContributionsByRepository(maxRepositories: 100) {
        repository { isPrivate } contributions { totalCount }
      }
      reviews: pullRequestReviewContributionsByRepository(maxRepositories: 100) {
        repository { isPrivate } contributions { totalCount }
      }
    }
  }
}`;
export function normalizeContext(collection: PublicCollection): SceneContext {
  const visible = (items: RepositoryActivity[]) => items.filter(item => !item.repository.isPrivate);
  const languageWeights = new Map<string, { name: string; weight: number; color: string }>();
  let commits = 0;
  for (const item of visible(collection.commits)) {
    const count = (item.contributions.nodes || []).reduce((sum, day) => sum + day.commitCount, 0);
    commits += count;
    const language = item.repository.primaryLanguage;
    if (language && count > 0) {
      const previous = languageWeights.get(language.name);
      languageWeights.set(language.name, { name: language.name, weight: (previous?.weight || 0) + count, color: /^#[0-9a-fA-F]{6}$/.test(language.color || '') ? language.color! : '#88b591' });
    }
  }
  const total = (items: RepositoryActivity[]) => visible(items).reduce((sum, item) => sum + item.contributions.totalCount, 0);
  return { source: 'github-public', coverage: 'Observed public activity: up to 100 repositories per type and 100 commit days per repository. Languages use repository primary languages, weighted by sampled commits.',
    languages: [...languageWeights.values()].sort((a, b) => b.weight - a.weight || a.name.localeCompare(b.name)),
    activity: { commits, issues: total(collection.issues), pullRequests: total(collection.pullRequests), reviews: total(collection.reviews) } };
}
export async function fetchContext(login: string, from: string, to: string, token: string): Promise<SceneContext> {
  const earliest = new Date(`${to}T00:00:00Z`);
  earliest.setUTCFullYear(earliest.getUTCFullYear() - 1);
  earliest.setUTCDate(earliest.getUTCDate() + 1);
  const boundedFrom = from < earliest.toISOString().slice(0, 10) ? earliest.toISOString().slice(0, 10) : from;
  const response = await fetch('https://api.github.com/graphql', { method: 'POST', signal: AbortSignal.timeout(30_000),
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'User-Agent': 'contribution-arcade' },
    body: JSON.stringify({ query: CONTEXT_QUERY, variables: { login, from: `${boundedFrom}T00:00:00Z`, to: `${to}T23:59:59Z` } }),
  });
  if (!response.ok) throw new Error(`Public context request failed (${response.status}).`);
  const result = await response.json() as { errors?: { message: string }[]; data?: { user?: { contributionsCollection: PublicCollection } } };
  if (result.errors?.length || !result.data?.user) throw new Error('Public context unavailable.');
  const context = normalizeContext(result.data.user.contributionsCollection);
  context.coverage += ` Period: ${boundedFrom} to ${to}.`;
  return context;
}

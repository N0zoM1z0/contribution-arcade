export interface ContributionDay {
  date: string;
  weekday: number;
  contributionCount: number;
  contributionLevel: string;
}

export interface CalendarInput {
  login: string;
  calendar: {
    totalContributions: number;
    weeks: { firstDay: string; contributionDays: ContributionDay[] }[];
  };
}

export interface Cell {
  date: string;
  column: number;
  row: number;
  count: number;
  level: number;
}

export interface Calendar {
  login: string;
  total: number;
  columns: number;
  cells: Cell[];
  activeDays: number;
  longestStreak: number;
  from: string;
  to: string;
}

const LEVELS = ['NONE', 'FIRST_QUARTILE', 'SECOND_QUARTILE', 'THIRD_QUARTILE', 'FOURTH_QUARTILE'];

export function normalizeCalendar(input: CalendarInput): Calendar {
  if (!input?.login || !Array.isArray(input?.calendar?.weeks) || !input.calendar.weeks.length || input.calendar.weeks.length > 54) {
    throw new Error('Expected a GitHub contribution calendar with a login and at least one week.');
  }
  const cells: Cell[] = [];
  const dates = new Set<string>();
  input.calendar.weeks.forEach((week, column) => {
    const occupied = new Set<number>();
    for (const day of week.contributionDays) {
      const level = LEVELS.indexOf(day.contributionLevel);
      const date = new Date(`${day.date}T00:00:00Z`);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(day.date) || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== day.date ||
          !Number.isInteger(day.weekday) || day.weekday < 0 || day.weekday > 6 ||
          date.getUTCDay() !== day.weekday || !Number.isSafeInteger(day.contributionCount) || day.contributionCount < 0 || level < 0 ||
          dates.has(day.date) || occupied.has(day.weekday)) {
        throw new Error(`Invalid or duplicate contribution day: ${day.date}`);
      }
      dates.add(day.date);
      occupied.add(day.weekday);
      cells.push({ date: day.date, column, row: day.weekday, count: day.contributionCount, level });
    }
  });
  cells.sort((a, b) => a.date.localeCompare(b.date));
  if (!cells.length) throw new Error('The contribution calendar has no days.');
  let streak = 0;
  let longestStreak = 0;
  let previous = 0;
  for (const day of cells) {
    const time = Date.parse(`${day.date}T00:00:00Z`);
    streak = day.count > 0 ? (time - previous === 86_400_000 ? streak + 1 : 1) : 0;
    longestStreak = Math.max(longestStreak, streak);
    previous = time;
  }
  return {
    login: input.login,
    total: cells.reduce((sum, day) => sum + day.count, 0),
    columns: input.calendar.weeks.length,
    cells,
    activeDays: cells.filter(day => day.count > 0).length,
    longestStreak,
    from: cells[0].date,
    to: cells.at(-1)!.date,
  };
}

export const CALENDAR_QUERY = `query($login: String!) {
  user(login: $login) {
    login
    contributionsCollection {
      contributionCalendar {
        totalContributions
        weeks {
          firstDay
          contributionDays { date weekday contributionCount contributionLevel }
        }
      }
    }
  }
}`;

export async function fetchCalendar(login: string, token: string): Promise<CalendarInput> {
  const response = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    signal: AbortSignal.timeout(30_000),
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'User-Agent': 'contribution-arcade' },
    body: JSON.stringify({ query: CALENDAR_QUERY, variables: { login } }),
  });
  if (!response.ok) throw new Error(`GitHub request failed (${response.status}). Check the token and API limits.`);
  const result = await response.json() as {
    errors?: { message: string }[];
    data?: { user?: { login: string; contributionsCollection: { contributionCalendar: CalendarInput['calendar'] } } };
  };
  if (result.errors?.length) throw new Error(`GitHub: ${result.errors.map(error => error.message).join('; ')}`);
  const user = result.data?.user;
  if (!user) throw new Error(`GitHub user not found: ${login}`);
  return { login: user.login, calendar: user.contributionsCollection.contributionCalendar };
}

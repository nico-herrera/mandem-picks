/**
 * The-Odds-API is requested with oddsFormat=american, so prices arrive already as
 * American/moneyline integers (e.g. -205, 172) — matching what the sportsbook posts.
 * We only format for display; no lossy decimal->american conversion.
 */

/** Format an American odds value for display: -205 stays "-205", 172 becomes "+172". */
export function formatAmerican(price: number | string): string {
	const n = typeof price === 'string' ? parseFloat(price) : price;
	if (!Number.isFinite(n)) return 'N/A';
	return n > 0 ? `+${n}` : `${n}`;
}

/**
 * Implied win probability from American odds (includes the book's vig).
 *   favorite (-N): N / (N + 100)
 *   underdog (+N): 100 / (N + 100)
 * Returns e.g. "67%".
 */
export function impliedProbability(price: number | string): string {
	const n = typeof price === 'string' ? parseFloat(price) : price;
	if (!Number.isFinite(n) || n === 0) return '—';
	const prob = n > 0 ? 100 / (n + 100) : -n / (-n + 100);
	return `${Math.round(prob * 100)}%`;
}

/** Profit on a $100 bet for an American line: +172 -> 172, -110 -> ~91. */
export function profitOnHundred(price: number | string): number {
	const n = typeof price === 'string' ? parseFloat(price) : price;
	if (!Number.isFinite(n) || n === 0) return 0;
	return Math.round(n > 0 ? n : 10000 / -n);
}

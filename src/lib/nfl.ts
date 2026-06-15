/**
 * NFL week helpers. The season kickoff is derived dynamically (the Thursday after
 * Labor Day, i.e. the first Monday of September) for the correct season year, so
 * this never needs a yearly manual edit.
 */

/** Returns the Week 1 kickoff (Thursday after Labor Day) for the season active at `date`. */
export function getSeasonKickoff(date: Date = new Date()): Date {
	// The NFL season runs Sep–Feb. From Mar onward we target this calendar year's
	// season; in Jan/Feb the active season started the previous year.
	const seasonYear = date.getMonth() >= 2 ? date.getFullYear() : date.getFullYear() - 1;

	const sept1 = new Date(seasonYear, 8, 1);
	const offsetToFirstMonday = (1 - sept1.getDay() + 7) % 7; // 0=Sun..6=Sat -> Monday=1
	const laborDay = 1 + offsetToFirstMonday;

	return new Date(seasonYear, 8, laborDay + 3); // Thursday after Labor Day
}

/** 1-indexed NFL week number for a given date (clamped to >= 1). */
export function getNFLWeek(date: Date = new Date()): number {
	const kickoff = getSeasonKickoff(date);

	if (date < kickoff) return 1;

	const daysSinceKickoff = Math.floor((date.getTime() - kickoff.getTime()) / (1000 * 60 * 60 * 24));
	return Math.floor(daysSinceKickoff / 7) + 1;
}

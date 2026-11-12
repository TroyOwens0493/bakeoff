/** Preserve event order inside one millisecond, including membership departure cutoffs. */
let previous = 0;
export function now(): number {
	previous = Math.max(Date.now(), previous + 0.001);
	return previous;
}

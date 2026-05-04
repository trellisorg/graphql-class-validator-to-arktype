import { type } from 'arktype';

/**
 * Replaces `IsInt + Min(0)`. An integer ≥ 0.
 */
export const ZeroOrHigherInt = type('number.integer >= 0');

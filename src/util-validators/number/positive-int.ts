import { type } from 'arktype';

/**
 * Replaces `IsInt + IsPositive`. An integer strictly greater than zero.
 */
export const PositiveInt = type('number.integer > 0');

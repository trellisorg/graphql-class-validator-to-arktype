import { type } from 'arktype';

/**
 * Replaces `IsNumber + IsPositive`. Any number (float or integer) strictly greater than zero.
 */
export const PositiveNumber = type('number > 0');

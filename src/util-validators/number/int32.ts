import { type } from 'arktype';

/**
 * Replaces `IsInt32`. A signed 32-bit integer: -2^31 ≤ n ≤ 2^31 - 1.
 *
 * The original validator allowed -2147483647 as the lower bound (off-by-one); we use the canonical `INT32_MIN` of
 * -2147483648.
 */
export const Int32 = type('-2147483648 <= number.integer <= 2147483647');

import { type } from 'arktype';
import { Int32 } from '../number/int32';

/**
 * Replaces `IsSelectedPurchasable`. An object whose values are all 32-bit non-negative integers (≥ 0). Empty
 * objects are allowed.
 */
export const RecordOfNonNegativeInt = type({
    '[string]': Int32.narrow((value, ctx) => (value >= 0 ? true : ctx.mustBe('a non-negative 32-bit integer'))),
});

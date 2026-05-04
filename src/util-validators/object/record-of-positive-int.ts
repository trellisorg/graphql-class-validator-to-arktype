import { type } from 'arktype';
import { Int32 } from '../number/int32';

/**
 * Replaces `IsRecordStringPositiveInteger`. An object whose values are all 32-bit positive integers (> 0). Empty
 * objects are allowed, matching the original's semantics.
 */
export const RecordOfPositiveInt = type({
    '[string]': Int32.narrow((value, ctx) => (value > 0 ? true : ctx.mustBe('a positive 32-bit integer'))),
});

import { type } from 'arktype';

/**
 * Replaces `IsSinglePropertyObject` from class-validator. An object with exactly one defined (non-undefined)
 * property value. Used as a top-level shape constraint for "discriminator-style" objects where exactly one variant
 * is set.
 *
 * The narrow runs on the _output_ shape, so it ignores keys whose values are `undefined` — same semantics as the
 * class-validator original.
 */
export const SinglePropertyObject = type('object').narrow((value, ctx) => {
    // Object.values is typed against an indexable record; the narrow callback
    // Gives us a structurally-typed value already, so no coercion is needed.
    const defined = Object.values(value).filter((v) => v !== undefined);
    return defined.length === 1 ? true : ctx.mustBe('an object with exactly one defined property');
});

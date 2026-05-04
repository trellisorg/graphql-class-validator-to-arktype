import type { Type } from 'arktype';

/**
 * Replaces `ArrayDistinct(propName)`. A factory that takes the _element schema_ and a key, and returns an array
 * schema that's narrowed so each element's value at `key` is unique across the array.
 *
 * The arktype version is more powerful than the class-validator one: the element schema is fully validated first,
 * so by the time the distinctness narrow runs the elements are known to be the right shape.
 *
 * @example
 *     const Tags = arrayDistinctBy(type({ id: 'string', label: 'string' }), 'id');
 */
export function arrayDistinctBy<TItem extends Type<Record<string, unknown>>>(
    itemSchema: TItem,
    key: keyof TItem['infer'] & string
) {
    return itemSchema.array().narrow((items, ctx) => {
        const seen = new Set<unknown>();
        for (const item of items) {
            // `item` is structurally a `Record<string, unknown>` thanks to the
            // Generic constraint, so reading the dynamic key is statically OK.
            const record: Record<string, unknown> = item;
            const k = record[key];
            if (seen.has(k)) {
                return ctx.mustBe(`an array with distinct ${key} values`);
            }
            seen.add(k);
        }
        return true;
    });
}

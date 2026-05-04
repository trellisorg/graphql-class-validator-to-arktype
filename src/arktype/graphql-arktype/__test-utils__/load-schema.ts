import type { Type as ArkType } from 'arktype';
import { assert } from 'vitest';
import { getArkSchema } from '../core';

/**
 * Test helper: pull an `ArkType` schema off a class produced by `createArkInputType` / `createArkObjectType` /
 * `createArkArgsType`. Asserts the schema is actually attached so callers don't need to handle `undefined`.
 *
 * Returning `getArkSchema`'s narrowed result avoids a coercion at the call site — `assert(schema, ...)` from
 * vitest narrows the type for us.
 */
export function loadAttachedSchema(target: Function): ArkType<unknown> {
    const schema = getArkSchema(target);
    assert(schema, 'expected an ArkType schema to be attached to the class');
    return schema;
}

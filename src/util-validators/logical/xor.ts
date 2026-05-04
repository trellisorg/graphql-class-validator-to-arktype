import type { Traversal } from 'arktype';

/**
 * Replaces `XorConstraint(otherProperty)`. Object-level narrow that enforces "exactly one of {a, b} is truthy".
 *
 * Apply to a schema with `.narrow(xorOf('a', 'b'))`. This is a structural shift from the class-validator pattern
 * (which annotated each side independently). Reach across siblings is now done at the parent.
 *
 * @example
 *     const Schema = type({ foo: 'string?', bar: 'string?' }).narrow(xorOf('foo', 'bar'));
 */
export const xorOf =
    <T extends Record<string, unknown>>(a: keyof T & string, b: keyof T & string) =>
    (value: T, ctx: Traversal): boolean =>
        Boolean(value[a]) !== Boolean(value[b]) ? true : ctx.mustBe(`exactly one of "${a}" or "${b}" set`);

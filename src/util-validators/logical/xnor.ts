import type { Traversal } from 'arktype';

/**
 * Replaces `XNorConstraint(otherProperty)`. Object-level narrow that enforces "either both {a, b} are truthy or
 * neither is" — the XNOR truth table.
 *
 * @example
 *     const Schema = type({ foo: 'string?', bar: 'string?' }).narrow(xnorOf('foo', 'bar'));
 */
export const xnorOf =
    <T extends Record<string, unknown>>(a: keyof T & string, b: keyof T & string) =>
    (value: T, ctx: Traversal): boolean =>
        Boolean(value[a]) === Boolean(value[b])
            ? true
            : ctx.mustBe(`either both "${a}" and "${b}" set, or neither`);

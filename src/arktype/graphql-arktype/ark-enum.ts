import { registerEnumType } from '@nestjs/graphql';
import { ArkErrors, type Type as ArkType } from 'arktype';
import { isPlainObject } from 'es-toolkit';

export interface RegisterArkEnumOptions {
    name: string;
    description?: string;
    /**
     * Per-value descriptions; key matches the enum value.
     */
    valuesMap?: Record<string, { description?: string; deprecationReason?: string }>;
}

/**
 * Turn an ArkType string-literal union (e.g. `type("'DRAFT' | 'PUBLISHED'")`) into a registered GraphQL enum AND
 * return both the runtime values map and the schema for downstream validation.
 *
 * @example
 *     const OrderStatusSchema = type("'PENDING' | 'PAID' | 'SHIPPED'");
 *     export const OrderStatus = registerArkEnum(OrderStatusSchema, { name: 'OrderStatus' });
 *
 *     // In an InputType:
 *     fields: {
 *         status: () => OrderStatus.gqlEnumRef;
 *     }
 */
/**
 * Bridge an ArkType string-literal union into a NestJS-registered GraphQL enum.
 *
 * @param schema An ArkType union of string literals — anything that, when serialised via `.toJsonSchema()`,
 *   produces a finite set of string consts. Numeric or non-string unions are rejected at runtime with a clear
 *   error.
 * @param options Schema-level metadata forwarded to `registerEnumType` (`name`, optional description, optional
 *   per-value docs).
 *
 * @returns The original schema (so the caller can keep validating with it), the extracted runtime values, the
 *   plain `gqlEnumRef` object you pass via a `fields` override, and the enum's registered GraphQL name.
 *
 *   The function generic is intentionally loose (`ArkType<unknown>`) so users can pass any candidate schema; the
 *   runtime guards reject invalid shapes. Tightening to `ArkType<string>` would force callers to type-check
 *   schemas up-front and would make the deliberate failure tests impossible to author.
 */
export function registerArkEnum<T extends ArkType<unknown>>(
    schema: T,
    options: RegisterArkEnumOptions
): {
    schema: T;
    values: string[];
    /**
     * The plain enum object passed to `registerEnumType` — pass via `{ type: () => ... }`.
     */
    gqlEnumRef: Record<string, string>;
    name: string;
} {
    const literals = extractStringLiterals(schema.toJsonSchema(), options.name);

    // Build the runtime enum table. `registerEnumType` expects a plain object
    // Whose keys/values are both the literal name — that's how the GraphQL
    // Serialiser maps incoming string values to "valid enum members".
    const enumObject: Record<string, string> = {};
    for (const literal of literals) {
        enumObject[literal] = literal;
    }

    registerEnumType(enumObject, {
        description: options.description,
        name: options.name,
        valuesMap: options.valuesMap,
    });

    return {
        gqlEnumRef: enumObject,
        name: options.name,
        schema,
        values: literals,
    };
}

/**
 * Walk the JSON-schema form of an ArkType string-literal union and pull every literal value out into a flat string
 * array.
 *
 * ArkType emits these unions in two slightly different shapes:
 *
 * 1. A single `enum` array at the root: `{ enum: ['A', 'B', 'C'] }`
 * 2. An `anyOf` of `const` branches: `{ anyOf: [{ const: 'A' }, ...] }`
 *
 * Either is valid input; anything else (numeric unions, regex shapes, etc.) is rejected up-front with a clear
 * error so the caller can correct the schema.
 *
 * @internal
 */
function extractStringLiterals(json: unknown, name: string): string[] {
    if (!isPlainObject(json)) {
        throw new Error(`registerArkEnum("${name}"): schema produced no JSON form`);
    }

    // `isPlainObject` narrows `json` to `Record<string, unknown>`, so each
    // Property access yields `unknown` and we validate the shape below.
    const enumArm = json.enum;
    const anyOfArm = json.anyOf;

    const raw: unknown[] = [];
    if (Array.isArray(enumArm)) {
        raw.push(...enumArm);
    } else if (Array.isArray(anyOfArm)) {
        for (const branch of anyOfArm) {
            if (!isPlainObject(branch)) {
                throw new Error(`registerArkEnum("${name}"): anyOf branch was not an object`);
            }
            if ('const' in branch) {
                raw.push(branch.const);
            } else if (Array.isArray(branch.enum)) {
                raw.push(...branch.enum);
            } else {
                throw new Error(
                    `registerArkEnum("${name}"): could not extract a finite set of string literals from the schema`
                );
            }
        }
    }

    if (raw.length === 0) {
        throw new Error(
            `registerArkEnum("${name}"): could not extract a finite set of string literals from the schema`
        );
    }

    // The runtime type of every value must be a plain string for it to be a
    // Valid GraphQL enum value. Reject early so a misuse like
    // `type('1 | 2 | 3')` produces a clear message instead of a malformed
    // GraphQL schema.
    const literals: string[] = [];
    for (const value of raw) {
        if (typeof value !== 'string') {
            throw new Error(
                `registerArkEnum("${name}"): only string-literal unions are supported (got ${typeof value})`
            );
        }
        literals.push(value);
    }
    return literals;
}

/**
 * Validate a single enum value at runtime against an ArkType string-literal union. Throws with the schema's error
 * summary if the value is not a member.
 *
 * Use this for one-off checks (e.g. an enum that arrives via a query parameter rather than embedded in an
 * `@InputType`). Inside an `@InputType`, the registered `ArkValidationPipe` already runs the parent schema and
 * validates the enum field as a side effect.
 *
 * The return value flows through arktype's distill type — for a plain string-literal union (no morphs) this is
 * identical to the inferred `T`, which is why TypeScript narrows the call-site nicely without a cast.
 */
export function validateArkEnum<T>(schema: ArkType<T>, value: unknown) {
    const out = schema(value);
    if (out instanceof ArkErrors) {
        throw new Error(out.summary);
    }
    return out;
}

import type { ReturnTypeFunc, ReturnTypeFuncValue } from '@nestjs/graphql';
import { Float, GraphQLISODateTime, ID, Int } from '@nestjs/graphql';
import { isFunction, isPlainObject } from 'es-toolkit';
import { arkRegistry } from './ark-meta';

/**
 * Subset of JSON Schema we actually consume during property → GraphQL field resolution. Typing this explicitly
 * (rather than walking an `any` tree) lets the resolver branches stay statically checked.
 */
export interface JsonSchemaProperty {
    type?: string;
    format?: string;
    items?: JsonSchemaProperty;
    properties?: Record<string, JsonSchemaProperty>;
    enum?: readonly unknown[];
    anyOf?: readonly JsonSchemaProperty[];
    description?: string;
}

/**
 * The reference shapes a caller can pass via the `fields` override map.
 *
 * Five accepted forms (TypeScript-friendly + ergonomic):
 *
 * 1. A class: `tags: TagInput`
 * 2. An array of class: `tags: [TagInput]`
 * 3. A thunk: `tags: () => [TagInput]`
 * 4. An explicit shape: `tags: { type: () => [TagInput], nullable: false }`
 * 5. Hide from the schema: `internalRowId: { hidden: true }`
 *
 * `unknown` is used (rather than `any`) to keep callers honest about what they're passing — the runtime narrowing
 * in `normalizeOverride` switches on shape regardless.
 */
export type FieldRef =
    | ReturnTypeFunc
    | { type: ReturnTypeFunc; nullable?: boolean }
    | { hidden: true }
    | readonly ReturnTypeFuncValue[]
    | NewableFunction;

export type FieldOverrides = Record<string, FieldRef>;

export interface ResolveOptions {
    /**
     * Format strings (e.g. `"uuid"`, `"date-time"`) that should map to ID.
     */
    idFormats?: ReadonlySet<string>;
    /**
     * Whether `format: "date-time"` maps to GraphQLISODateTime instead of String.
     */
    isoDateTime?: boolean;
}

export interface ResolvedField {
    type: ReturnTypeFunc;
    nullable: boolean;
    hidden?: boolean;
}

interface ResolveFieldArgs {
    ownerName: string;
    propName: string;
    propSchema: JsonSchemaProperty;
    required: boolean;
    overrides: FieldOverrides;
    options: ResolveOptions;
}

/**
 * Resolve the GraphQL field type for a single property. Order of precedence:
 *
 * 1. Explicit override in `overrides[propName]`.
 * 2. Schema-level registry lookup — matches inline objects to a previously-registered class with the same JSON shape.
 * 3. Pure derivation from the JSON-schema fragment.
 *
 * Throws when the property would otherwise resolve to an un-named GraphQL object, since `@nestjs/graphql` requires
 * a named class for those.
 */
export function resolveField(args: ResolveFieldArgs): ResolvedField {
    const { ownerName, propName, propSchema, required, overrides, options } = args;
    const nullable = !required;

    const override = overrides[propName];
    if (override !== undefined) {
        return normalizeOverride(override, nullable);
    }

    // Search the registry for an exact match before recursing — handles the
    // Common case where a nested object is the JSON form of a previously
    // Registered ArkType schema.
    const registered = registryLookupForProp(propSchema);
    if (registered !== undefined) {
        return { nullable, type: () => registered };
    }

    return derive(propSchema, ownerName, propName, options, nullable);
}

/**
 * Coerce one of the five accepted `FieldRef` shapes into the canonical `{ type, nullable, hidden }` resolved form.
 * Each branch is a runtime check against the override's structure — there are no static casts; the runtime shape
 * IS the proof.
 */
function normalizeOverride(override: FieldRef, nullable: boolean): ResolvedField {
    // Object-shaped override carrying the hidden marker — emit `@HideField()`
    // Upstream while keeping the field validated by the ArkType pipe.
    if (isPlainObject(override) && 'hidden' in override && override.hidden === true) {
        return { hidden: true, nullable, type: () => String };
    }
    // Object-shaped override with explicit { type, nullable }.
    if (isPlainObject(override) && 'type' in override && isFunction(override.type)) {
        const explicitType: ReturnTypeFunc = override.type;
        const nullableOverride = 'nullable' in override ? override.nullable : undefined;
        return {
            nullable: nullableOverride ?? nullable,
            type: explicitType,
        };
    }
    // Function override: distinguish a class from a thunk by whether the
    // Function carries a prototype slot. Class declarations do; arrow-function
    // Thunks (`() => SomeClass`) don't.
    if (isFunction(override)) {
        const fn = override;
        const typeFn: ReturnTypeFunc = isClassConstructor(fn)
            ? () => fn as unknown as ReturnTypeFuncValue
            : () => fn() as ReturnTypeFuncValue;
        return { nullable, type: typeFn };
    }
    // Tuple form: a one-element array signals an array of the inner ref.
    if (Array.isArray(override)) {
        const inner = override[0];
        return { nullable, type: () => [unwrapInner(inner)] as [ReturnTypeFuncValue] };
    }
    // Bare class reference (no array, no thunk) — treat as a class.
    return { nullable, type: () => override as ReturnTypeFuncValue };
}

/**
 * Heuristic for detecting class constructors vs ordinary functions — arrow-function thunks have no own
 * `prototype`. Used so callers can write `fields: { tag: TagClass }` AND `fields: { tag: () => TagClass }`
 * interchangeably.
 */
function isClassConstructor(fn: Function): boolean {
    return Boolean(fn.prototype) && fn.prototype.constructor === fn;
}

/**
 * Resolve the inner element of a tuple-form override. The inner element may itself be a class reference or a
 * thunk; we unwrap thunks at decoration time so the final `() => [Class]` shape that `@nestjs/graphql` expects is
 * correct.
 */
function unwrapInner(inner: unknown): ReturnTypeFuncValue {
    if (isFunction(inner)) {
        return (isClassConstructor(inner) ? inner : inner()) as ReturnTypeFuncValue;
    }
    return inner as ReturnTypeFuncValue;
}

/**
 * Look up a previously-registered GraphQL class whose JSON-schema shape is structurally identical to this
 * property's schema. Lets users pass a parent schema that inlines a child schema and have the nested type resolve
 * automatically — without an explicit `fields:` override.
 */
function registryLookupForProp(propSchema: JsonSchemaProperty): unknown {
    if (propSchema.type === 'object') {
        return arkRegistry.findByJsonSchema(propSchema);
    }
    if (propSchema.type === 'array' && propSchema.items?.type === 'object') {
        const cls = arkRegistry.findByJsonSchema(propSchema.items);
        if (cls) {
            return [cls];
        } // Tuple form signals an array-of-class to the caller
    }
    return undefined;
}

/**
 * Pure derivation: walk a JSON-schema fragment and pick the GraphQL scalar (or array) it maps to. Recurses through
 * `anyOf` (for nullable unions) and arrays. Throws on unsupported types or unnamed object children — the caller
 * should register the nested schema first or supply an explicit override.
 */
function derive(
    propSchema: JsonSchemaProperty,
    ownerName: string,
    propName: string,
    options: ResolveOptions,
    nullable: boolean
): ResolvedField {
    // `anyOf` with one non-null branch + null is just an optional/nullable
    // Field — recurse on the meaningful branch and propagate the null bit.
    if (Array.isArray(propSchema.anyOf)) {
        const nonNulls = propSchema.anyOf.filter((branch) => branch.type !== 'null');
        const hasNull = propSchema.anyOf.length > nonNulls.length;
        if (nonNulls.length === 1) {
            return derive(nonNulls[0], ownerName, propName, options, nullable || hasNull);
        }
    }

    // JSON-Schema string enums surface as plain `String` here; users wanting a
    // Real GraphQL enum should route through `registerArkEnum` and supply the
    // Returned ref via `fields: { status: () => OrderStatus.gqlEnumRef }`.
    if (Array.isArray(propSchema.enum) && propSchema.type === 'string') {
        return { nullable, type: () => String };
    }

    switch (propSchema.type) {
        case 'string': {
            const fmt = propSchema.format;
            if (fmt && options.idFormats?.has(fmt)) {
                return { nullable, type: () => ID };
            }
            if (fmt === 'date-time' && options.isoDateTime) {
                return { nullable, type: () => GraphQLISODateTime };
            }
            return { nullable, type: () => String };
        }
        case 'boolean': {
            return { type: () => Boolean, nullable };
        }
        case 'integer': {
            return { type: () => Int, nullable };
        }
        case 'number': {
            return { type: () => Float, nullable };
        }
        case 'array': {
            const { items } = propSchema;
            if (!items) {
                throw new Error(
                    `graphql-arktype: array property "${ownerName}.${propName}" has no items schema (supply a fields override)`
                );
            }
            if (items.type === 'object') {
                throw new Error(
                    `graphql-arktype: array of object property "${ownerName}.${propName}" did not match any registered ArkType class — register the inner schema before this one or supply an explicit fields override`
                );
            }
            const inner = derive(items, ownerName, `${propName}[]`, options, false);
            return { nullable, type: () => [inner.type()] };
        }
        case 'object': {
            throw new Error(
                `graphql-arktype: object property "${ownerName}.${propName}" did not match any registered ArkType class — register the nested schema before this one or supply an explicit fields override`
            );
        }
        default: {
            throw new Error(
                `graphql-arktype: unsupported JSON schema type "${propSchema.type}" for "${ownerName}.${propName}"`
            );
        }
    }
}

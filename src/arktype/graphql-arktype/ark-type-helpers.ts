import type { Type as ArkType } from 'arktype';
import { type CreateArkInputTypeOptions, createArkInputType } from './ark-input-type';
import { type CreateArkObjectTypeOptions, createArkObjectType } from './ark-object-type';
import { getArkKind, getArkSchema } from './core';

type Kind = 'input' | 'object';

interface DerivedOptions {
    name: string;
    description?: string;
    fields?: CreateArkInputTypeOptions['fields'];
    /**
     * Override the kind of the generated class; defaults to the parent's kind.
     */
    kind?: Kind;
}

/**
 * Surface of arktype's `Type` once we know the underlying schema is an object — which is the contract
 * `createArkInputType` / `createArkObjectType` enforce before stamping the schema onto the class. Declared
 * explicitly so the type-helper bodies don't have to coerce.
 */
type ObjectSchemaSurface = ArkType<any> & {
    partial(): ArkType<any>;
    pick(...keys: readonly string[]): ArkType<any>;
    omit(...keys: readonly string[]): ArkType<any>;
    required(): ArkType<any>;
    merge(other: ArkType<any>): ArkType<any>;
};

/**
 * Equivalent of NestJS's `PartialType` driven by ArkType. Wraps the parent's schema with `.partial()` — every key
 * becomes optional/nullable — and emits a new GraphQL class of the same kind (input or object) as the parent.
 */
export function arkPartial<T extends new () => unknown>(
    parent: T,
    options: DerivedOptions
): new () => Partial<InstanceType<T>> {
    const { schema, kind } = readParent(parent);
    return emit(schema.partial(), options, kind);
}

/**
 * Equivalent of NestJS's `PickType`.
 */
export function arkPick<T extends new () => unknown, K extends keyof InstanceType<T> & string>(
    parent: T,
    keys: readonly K[],
    options: DerivedOptions
): new () => Pick<InstanceType<T>, K> {
    const { schema, kind } = readParent(parent);
    return emit(schema.pick(...keys), options, kind);
}

/**
 * Equivalent of NestJS's `OmitType`.
 */
export function arkOmit<T extends new () => unknown, K extends keyof InstanceType<T> & string>(
    parent: T,
    keys: readonly K[],
    options: DerivedOptions
): new () => Omit<InstanceType<T>, K> {
    const { schema, kind } = readParent(parent);
    return emit(schema.omit(...keys), options, kind);
}

/**
 * Equivalent of NestJS's `IntersectionType` — merges the schemas of two generated classes via `ArkType.merge`.
 * Right-hand keys win on overlap (matches ArkType's merge semantics).
 */
export function arkIntersection<A extends new () => unknown, B extends new () => unknown>(
    a: A,
    b: B,
    options: DerivedOptions
): new () => InstanceType<A> & InstanceType<B> {
    const { schema: aSchema, kind: aKind } = readParent(a);
    const { schema: bSchema, kind: bKind } = readParent(b);
    if (aKind !== bKind && !options.kind) {
        throw new Error(
            `arkIntersection: parents have different kinds (${aKind}/${bKind}); pass options.kind to disambiguate`
        );
    }
    return emit(aSchema.merge(bSchema), options, options.kind ?? aKind);
}

/**
 * Equivalent of `Required` — flips all optional keys to required.
 */
export function arkRequired<T extends new () => unknown>(
    parent: T,
    options: DerivedOptions
): new () => Required<InstanceType<T>> {
    const { schema, kind } = readParent(parent);
    return emit(schema.required(), options, kind);
}

function readParent(parent: Function): { schema: ObjectSchemaSurface; kind: Kind } {
    const schema = getArkSchema(parent);
    const kind = getArkKind(parent);
    if (!schema) {
        throw new Error(
            `graphql-arktype type-helpers: "${parent.name}" was not produced by createArkInputType/createArkObjectType — no schema metadata found`
        );
    }
    if (kind !== 'input' && kind !== 'object') {
        throw new Error(`graphql-arktype type-helpers: parent "${parent.name}" has unsupported kind "${kind}"`);
    }
    if (!isObjectSchema(schema)) {
        throw new Error(
            `graphql-arktype type-helpers: schema attached to "${parent.name}" is missing object-type methods (partial/pick/omit/merge/required) — was it produced by createArkInputType/createArkObjectType?`
        );
    }
    return { kind, schema };
}

/**
 * Runtime guard: confirm that the schema attached to the parent class is the object-shaped variant of arktype's
 * `Type`, which is the only one that exposes `.partial()` / `.pick()` / `.omit()` / `.required()` / `.merge()`.
 *
 * Phrased as a type predicate so callers can narrow without a cast — the runtime check (does the value have these
 * methods?) IS the type proof.
 */
function isObjectSchema(schema: ArkType<unknown>): schema is ObjectSchemaSurface {
    return (
        'partial' in schema &&
        typeof schema.partial === 'function' &&
        'pick' in schema &&
        typeof schema.pick === 'function' &&
        'omit' in schema &&
        typeof schema.omit === 'function' &&
        'required' in schema &&
        typeof schema.required === 'function' &&
        'merge' in schema &&
        typeof schema.merge === 'function'
    );
}

function emit<TInstance>(schema: ArkType<unknown>, options: DerivedOptions, kind: Kind): new () => TInstance {
    const finalKind = options.kind ?? kind;
    const factoryOptions: CreateArkInputTypeOptions & CreateArkObjectTypeOptions = {
        description: options.description,
        fields: options.fields,
        name: options.name,
    };
    if (finalKind === 'input') {
        return createArkInputType(schema, factoryOptions) as new () => TInstance;
    }
    return createArkObjectType(schema, factoryOptions) as new () => TInstance;
}

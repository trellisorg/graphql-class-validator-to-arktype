import { Field, HideField } from '@nestjs/graphql';
import type { Type as ArkType } from 'arktype';
import { isPlainObject } from 'es-toolkit';
import { type ArkClassKind, arkRegistry, setArkSchema } from './ark-meta';
import {
    type FieldOverrides,
    type JsonSchemaProperty,
    type ResolveOptions,
    resolveField,
} from './json-schema-to-gql';

export interface BuildDecoratedClassOptions<T extends ArkType<any> = ArkType<any>> {
    schema: T;
    name: string;
    description?: string;
    fields?: FieldOverrides;
    resolveOptions?: ResolveOptions;
    kind: ArkClassKind;
    /**
     * Decorator that registers the class with @nestjs/graphql in the desired type system (e.g. `@InputType()` /
     * `@ObjectType()` / `@ArgsType()`). Called AFTER fields are decorated so the class metadata is collected.
     */
    classDecorator: ClassDecorator;
}

/**
 * The minimal shape `buildDecoratedClass` needs to see at the JSON-schema root — an object with a properties map
 * and an optional required-keys array. We type the root explicitly (rather than using `any`) so the
 * field-decoration loop is statically guarded against malformed schemas.
 */
interface ObjectJsonSchema {
    type: 'object';
    properties: Record<string, JsonSchemaProperty>;
    required?: readonly string[];
}

const DEFAULT_RESOLVE: ResolveOptions = {
    idFormats: new Set(['uuid']),
    isoDateTime: true,
};

/**
 * Type guard: confirm a value is the object-rooted JSON schema this factory accepts. Phrased as a predicate so the
 * caller can branch and emit a clear error message instead of letting a malformed schema produce a confusing
 * failure deep in the field-decoration loop.
 */
function isObjectJsonSchema(value: unknown): value is ObjectJsonSchema {
    if (!isPlainObject(value)) {
        return false;
    }
    return value.type === 'object' && isPlainObject(value.properties);
}

/**
 * Common pipeline shared by `createArkInputType`, `createArkObjectType`, and `createArkArgsType`.
 *
 * Steps:
 *
 * 1. Serialise the ArkType schema to JSON form (`toJsonSchema()`).
 * 2. Validate that the root is an object — these factories don't support primitive-rooted schemas; the caller should
 *    use a scalar field directly.
 * 3. Build a fresh class and rename it to the requested GraphQL type name.
 * 4. Walk every property and emit `@Field()` (or `@HideField()` when the caller marked the property hidden via
 *    `fields: { x: { hidden: true } }`).
 * 5. Apply the supplied `classDecorator` (`@InputType` / `@ObjectType` / `@ArgsType`) AFTER the fields are decorated
 *    so its metadata pass sees every field.
 * 6. Stamp the originating schema and kind onto the class so the validation pipe and type-helpers can re-derive them
 *    later.
 * 7. Register in `arkRegistry` so nested-type resolution can match this class to inline JSON-schema fragments in
 *    parent schemas.
 */
export function buildDecoratedClass<T extends ArkType<any>>(
    opts: BuildDecoratedClassOptions<T>
): new () => T['infer'] {
    const json: unknown = opts.schema.toJsonSchema();
    if (!isObjectJsonSchema(json)) {
        const seenType = isPlainObject(json) ? String(json.type) : typeof json;
        throw new Error(
            `graphql-arktype: schema for "${opts.name}" did not produce an object JSON schema (got type=${seenType}). The factory only handles object roots.`
        );
    }

    const required = new Set<string>(json.required ?? []);
    const overrides = opts.fields ?? {};
    const resolveOptions = { ...DEFAULT_RESOLVE, ...opts.resolveOptions };

    // Anonymous class, renamed to the GraphQL type name for nicer stacks /
    // Debugger output. We type it as a no-arg constructor — the per-field
    // Schema typing is captured separately on the metadata.
    const Cls = class {};
    Object.defineProperty(Cls, 'name', { value: opts.name });

    for (const [propName, propSchema] of Object.entries(json.properties)) {
        const resolved = resolveField({
            options: resolveOptions,
            overrides,
            ownerName: opts.name,
            propName,
            propSchema,
            required: required.has(propName),
        });
        if (resolved.hidden) {
            HideField()(Cls.prototype, propName);
        } else {
            Field(resolved.type, {
                description: propSchema.description,
                nullable: resolved.nullable,
            })(Cls.prototype, propName);
        }
    }

    opts.classDecorator(Cls);

    setArkSchema(Cls, opts.schema, opts.kind);
    arkRegistry.register(opts.schema, Cls, opts.name);

    // The runtime class is a no-arg constructor whose instance shape is
    // `T['infer']`. The Field/HideField decorators stamped above don't change
    // That contract; they configure GraphQL metadata.
    return Cls as new () => T['infer'];
}

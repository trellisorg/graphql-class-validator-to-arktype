import { Field } from '@nestjs/graphql';
import { type ZodType, z } from 'zod';
import { type FieldOverrides, type ResolveOptions, resolveField } from './json-schema-to-gql';
import { type ZodClassKind, setZodSchema, zodRegistry } from './zod-meta';

export interface BuildDecoratedClassOptions {
    schema: ZodType<any, any>;
    name: string;
    description?: string;
    fields?: FieldOverrides;
    resolveOptions?: ResolveOptions;
    kind: ZodClassKind;
    classDecorator: ClassDecorator;
}

const DEFAULT_RESOLVE: ResolveOptions = {
    idFormats: new Set(['uuid']),
    isoDateTime: true,
};

export function buildDecoratedClass(opts: BuildDecoratedClassOptions): any {
    const json = z.toJSONSchema(opts.schema, { unrepresentable: 'any' }) as any;
    if (!json || json.type !== 'object' || !json.properties) {
        throw new Error(
            `graphql-zod: schema for "${opts.name}" did not produce an object JSON schema (got type=${json?.type}). The factory only handles object roots.`
        );
    }

    const required = new Set<string>(Array.isArray(json.required) ? json.required : []);
    const overrides = opts.fields ?? {};
    const resolveOptions = { ...DEFAULT_RESOLVE, ...opts.resolveOptions };

    const Cls: any = class {};
    Object.defineProperty(Cls, 'name', { value: opts.name });

    for (const [propName, propSchema] of Object.entries<any>(json.properties)) {
        const resolved = resolveField({
            options: resolveOptions,
            overrides,
            ownerName: opts.name,
            propName,
            propSchema,
            required: required.has(propName),
        });
        Field(resolved.type, {
            description: propSchema.description,
            nullable: resolved.nullable,
        })(Cls.prototype, propName);
    }

    opts.classDecorator(Cls);

    setZodSchema(Cls, opts.schema, opts.kind);
    zodRegistry.register(opts.schema, json, Cls, opts.name);

    return Cls;
}

import { Field } from '@nestjs/graphql';
import { z, type ZodType } from 'zod';
import { setZodSchema, zodRegistry, type ZodClassKind } from './zod-meta';
import {
  resolveField,
  type FieldOverrides,
  type ResolveOptions,
} from './json-schema-to-gql';

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
      `graphql-zod: schema for "${opts.name}" did not produce an object JSON schema (got type=${json?.type}). The factory only handles object roots.`,
    );
  }

  const required = new Set<string>(Array.isArray(json.required) ? json.required : []);
  const overrides = opts.fields ?? {};
  const resolveOptions = { ...DEFAULT_RESOLVE, ...opts.resolveOptions };

  const Cls: any = class {};
  Object.defineProperty(Cls, 'name', { value: opts.name });

  for (const [propName, propSchema] of Object.entries<any>(json.properties)) {
    const resolved = resolveField({
      ownerName: opts.name,
      propName,
      propSchema,
      required: required.has(propName),
      overrides,
      options: resolveOptions,
    });
    Field(resolved.type, {
      nullable: resolved.nullable,
      description: propSchema.description,
    })(Cls.prototype, propName);
  }

  opts.classDecorator(Cls);

  setZodSchema(Cls, opts.schema, opts.kind);
  zodRegistry.register(opts.schema, json, Cls, opts.name);

  return Cls;
}

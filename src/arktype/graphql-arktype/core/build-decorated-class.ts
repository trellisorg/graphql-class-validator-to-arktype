import { Field } from '@nestjs/graphql';
import type { Type as ArkType } from 'arktype';
import { arkRegistry, setArkSchema, type ArkClassKind } from './ark-meta';
import {
  resolveField,
  type FieldOverrides,
  type ResolveOptions,
} from './json-schema-to-gql';

export interface BuildDecoratedClassOptions {
  schema: ArkType<any>;
  name: string;
  description?: string;
  fields?: FieldOverrides;
  resolveOptions?: ResolveOptions;
  kind: ArkClassKind;
  /**
   * Decorator that registers the class with @nestjs/graphql in the desired
   * type system (e.g. `@InputType()` / `@ObjectType()` / `@ArgsType()`).
   * Called AFTER fields are decorated so the class metadata is collected.
   */
  classDecorator: ClassDecorator;
}

const DEFAULT_RESOLVE: ResolveOptions = {
  idFormats: new Set(['uuid']),
  isoDateTime: true,
};

/**
 * Common pipeline shared by `createArkInputType`, `createArkObjectType`, and
 * `createArkArgsType`. Builds a class with the given name, walks the schema's
 * JSON form to call `@Field()` for each property, applies the supplied class
 * decorator, attaches the schema as metadata, and registers it for nested
 * lookups.
 */
export function buildDecoratedClass(opts: BuildDecoratedClassOptions): any {
  const json = opts.schema.toJsonSchema() as any;
  if (!json || json.type !== 'object' || !json.properties) {
    throw new Error(
      `graphql-arktype: schema for "${opts.name}" did not produce an object JSON schema (got type=${json?.type}). The factory only handles object roots.`,
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

  setArkSchema(Cls, opts.schema, opts.kind);
  arkRegistry.register(opts.schema, Cls, opts.name);

  return Cls;
}

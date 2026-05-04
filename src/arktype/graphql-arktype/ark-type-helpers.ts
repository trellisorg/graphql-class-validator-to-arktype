import type { Type as ArkType } from 'arktype';
import { createArkInputType, type CreateArkInputTypeOptions } from './ark-input-type';
import { createArkObjectType, type CreateArkObjectTypeOptions } from './ark-object-type';
import { getArkKind, getArkSchema } from './core';

type Kind = 'input' | 'object';

interface DerivedOptions {
  name: string;
  description?: string;
  fields?: CreateArkInputTypeOptions['fields'];
  /** Override the kind of the generated class; defaults to the parent's kind. */
  kind?: Kind;
}

/**
 * Equivalent of NestJS's `PartialType` driven by ArkType. Wraps the parent's
 * schema with `.partial()` — every key becomes optional/nullable — and emits
 * a new GraphQL class of the same kind (input or object) as the parent.
 */
export function arkPartial<T extends new () => any>(
  parent: T,
  options: DerivedOptions,
): new () => Partial<InstanceType<T>> {
  const { schema, kind } = readParent(parent);
  const newSchema = (schema as any).partial();
  return emit(newSchema, options, kind);
}

/** Equivalent of NestJS's `PickType`. */
export function arkPick<T extends new () => any, K extends keyof InstanceType<T>>(
  parent: T,
  keys: readonly K[],
  options: DerivedOptions,
): new () => Pick<InstanceType<T>, K> {
  const { schema, kind } = readParent(parent);
  const newSchema = (schema as any).pick(...keys);
  return emit(newSchema, options, kind);
}

/** Equivalent of NestJS's `OmitType`. */
export function arkOmit<T extends new () => any, K extends keyof InstanceType<T>>(
  parent: T,
  keys: readonly K[],
  options: DerivedOptions,
): new () => Omit<InstanceType<T>, K> {
  const { schema, kind } = readParent(parent);
  const newSchema = (schema as any).omit(...keys);
  return emit(newSchema, options, kind);
}

/**
 * Equivalent of NestJS's `IntersectionType` — merges the schemas of two
 * generated classes via `ArkType.merge`. Right-hand keys win on overlap
 * (matches ArkType's merge semantics).
 */
export function arkIntersection<A extends new () => any, B extends new () => any>(
  a: A,
  b: B,
  options: DerivedOptions,
): new () => InstanceType<A> & InstanceType<B> {
  const { schema: aSchema, kind: aKind } = readParent(a);
  const { schema: bSchema, kind: bKind } = readParent(b);
  if (aKind !== bKind && !options.kind) {
    throw new Error(
      `arkIntersection: parents have different kinds (${aKind}/${bKind}); pass options.kind to disambiguate`,
    );
  }
  const merged = (aSchema as any).merge(bSchema);
  return emit(merged, options, options.kind ?? aKind);
}

/** Equivalent of `Required` — flips all optional keys to required. */
export function arkRequired<T extends new () => any>(
  parent: T,
  options: DerivedOptions,
): new () => Required<InstanceType<T>> {
  const { schema, kind } = readParent(parent);
  const newSchema = (schema as any).required();
  return emit(newSchema, options, kind);
}

function readParent(parent: Function): { schema: ArkType<any>; kind: Kind } {
  const schema = getArkSchema(parent);
  const kind = getArkKind(parent);
  if (!schema) {
    throw new Error(
      `graphql-arktype type-helpers: "${parent.name}" was not produced by createArkInputType/createArkObjectType — no schema metadata found`,
    );
  }
  if (kind !== 'input' && kind !== 'object') {
    throw new Error(
      `graphql-arktype type-helpers: parent "${parent.name}" has unsupported kind "${kind}"`,
    );
  }
  return { schema, kind };
}

function emit(schema: ArkType<any>, options: DerivedOptions, kind: Kind): any {
  const finalKind = options.kind ?? kind;
  if (finalKind === 'input') {
    return createArkInputType(schema, {
      name: options.name,
      description: options.description,
      fields: options.fields as CreateArkInputTypeOptions['fields'],
    });
  }
  return createArkObjectType(schema, {
    name: options.name,
    description: options.description,
    fields: options.fields as CreateArkObjectTypeOptions['fields'],
  });
}

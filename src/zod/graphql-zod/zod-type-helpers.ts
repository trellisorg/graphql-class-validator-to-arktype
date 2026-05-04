import type { ZodType } from 'zod';
import { createZodInputType, type CreateZodInputTypeOptions } from './zod-input-type';
import { createZodObjectType, type CreateZodObjectTypeOptions } from './zod-object-type';
import { getZodKind, getZodSchema } from './core';

type Kind = 'input' | 'object';

interface DerivedOptions {
  name: string;
  description?: string;
  fields?: CreateZodInputTypeOptions['fields'];
  kind?: Kind;
}

export function zodPartial<T extends new () => any>(
  parent: T,
  options: DerivedOptions,
): new () => Partial<InstanceType<T>> {
  const { schema, kind } = readParent(parent);
  return emit((schema as any).partial(), options, kind);
}

export function zodPick<T extends new () => any, K extends keyof InstanceType<T> & string>(
  parent: T,
  keys: readonly K[],
  options: DerivedOptions,
): new () => Pick<InstanceType<T>, K> {
  const { schema, kind } = readParent(parent);
  const mask: Record<string, true> = {};
  for (const k of keys) mask[k] = true;
  return emit((schema as any).pick(mask), options, kind);
}

export function zodOmit<T extends new () => any, K extends keyof InstanceType<T> & string>(
  parent: T,
  keys: readonly K[],
  options: DerivedOptions,
): new () => Omit<InstanceType<T>, K> {
  const { schema, kind } = readParent(parent);
  const mask: Record<string, true> = {};
  for (const k of keys) mask[k] = true;
  return emit((schema as any).omit(mask), options, kind);
}

export function zodRequired<T extends new () => any>(
  parent: T,
  options: DerivedOptions,
): new () => Required<InstanceType<T>> {
  const { schema, kind } = readParent(parent);
  return emit((schema as any).required(), options, kind);
}

export function zodIntersection<A extends new () => any, B extends new () => any>(
  a: A,
  b: B,
  options: DerivedOptions,
): new () => InstanceType<A> & InstanceType<B> {
  const { schema: aSchema, kind: aKind } = readParent(a);
  const { schema: bSchema, kind: bKind } = readParent(b);
  if (aKind !== bKind && !options.kind) {
    throw new Error(
      `zodIntersection: parents have different kinds (${aKind}/${bKind}); pass options.kind to disambiguate`,
    );
  }
  // Zod v4 keeps `.merge()` on object schemas (rhs wins on overlap), matching ArkType semantics.
  const merged = (aSchema as any).merge(bSchema);
  return emit(merged, options, options.kind ?? aKind);
}

function readParent(parent: Function): { schema: ZodType<any, any>; kind: Kind } {
  const schema = getZodSchema(parent);
  const kind = getZodKind(parent);
  if (!schema) {
    throw new Error(
      `graphql-zod type-helpers: "${parent.name}" was not produced by createZodInputType/createZodObjectType — no schema metadata found`,
    );
  }
  if (kind !== 'input' && kind !== 'object') {
    throw new Error(`graphql-zod type-helpers: parent "${parent.name}" has unsupported kind "${kind}"`);
  }
  return { schema, kind };
}

function emit(schema: ZodType<any, any>, options: DerivedOptions, kind: Kind): any {
  const finalKind = options.kind ?? kind;
  if (finalKind === 'input') {
    return createZodInputType(schema, {
      name: options.name,
      description: options.description,
      fields: options.fields as CreateZodInputTypeOptions['fields'],
    });
  }
  return createZodObjectType(schema, {
    name: options.name,
    description: options.description,
    fields: options.fields as CreateZodObjectTypeOptions['fields'],
  });
}

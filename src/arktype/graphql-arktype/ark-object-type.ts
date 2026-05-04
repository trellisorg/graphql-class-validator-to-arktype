import { ObjectType } from '@nestjs/graphql';
import type { Type as ArkType } from 'arktype';
import {
  buildDecoratedClass,
  type FieldOverrides,
  type ResolveOptions,
} from './core';

export interface CreateArkObjectTypeOptions {
  name: string;
  description?: string;
  fields?: FieldOverrides;
  resolveOptions?: ResolveOptions;
  /** Forwarded to `@ObjectType()`. */
  isAbstract?: boolean;
  /** GraphQL interfaces this object type implements (forwarded to `@ObjectType()`). */
  implements?: () => any | (() => any[]);
}

/**
 * Generate a NestJS `@ObjectType` class from an ArkType schema. Use this for
 * resolver return types so the GraphQL output schema stays in sync with the
 * domain schema. Output validation is opt-in via `@ArkQuery({ validate: true })`
 * — running every response through `schema(value)` adds latency.
 */
export function createArkObjectType<T extends ArkType<any>>(
  schema: T,
  options: CreateArkObjectTypeOptions,
): new () => T['infer'] {
  const objectTypeOpts: any = {
    description: options.description,
    isAbstract: options.isAbstract,
  };
  if (options.implements) objectTypeOpts.implements = options.implements;

  return buildDecoratedClass({
    schema,
    name: options.name,
    description: options.description,
    fields: options.fields,
    resolveOptions: options.resolveOptions,
    kind: 'object',
    classDecorator: ObjectType(options.name, objectTypeOpts),
  });
}

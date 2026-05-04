import { ArgsType } from '@nestjs/graphql';
import type { Type as ArkType } from 'arktype';
import {
  buildDecoratedClass,
  type FieldOverrides,
  type ResolveOptions,
} from './core';

export interface CreateArkArgsTypeOptions {
  /** Optional — `@ArgsType()` types are anonymous in the schema by default. */
  name?: string;
  description?: string;
  fields?: FieldOverrides;
  resolveOptions?: ResolveOptions;
  isAbstract?: boolean;
}

/**
 * Generate a NestJS `@ArgsType()` class from an ArkType schema. Used as a
 * resolver argument bundle: every property becomes an inline GraphQL argument
 * rather than a named input type.
 *
 * @example
 *   const ListBooksArgsSchema = type({ limit: 'number.integer < 100', offset: 'number.integer >= 0' })
 *   class ListBooksArgs extends createArkArgsType(ListBooksArgsSchema, { name: 'ListBooksArgs' }) {}
 *   resolver: @Query() books(@Args() args: ListBooksArgs) {}
 */
export function createArkArgsType<T extends ArkType<any>>(
  schema: T,
  options: CreateArkArgsTypeOptions = {},
): new () => T['infer'] {
  const name = options.name ?? `ArkArgs${++ANON_ARGS_ID}`;
  return buildDecoratedClass({
    schema,
    name,
    description: options.description,
    fields: options.fields,
    resolveOptions: options.resolveOptions,
    kind: 'args',
    classDecorator: options.isAbstract
      ? ArgsType({ isAbstract: options.isAbstract })
      : ArgsType(),
  });
}

let ANON_ARGS_ID = 0;

import { ArgsType } from '@nestjs/graphql';
import type { ZodType } from 'zod';
import { buildDecoratedClass, type FieldOverrides, type ResolveOptions } from './core';

export interface CreateZodArgsTypeOptions {
  name?: string;
  description?: string;
  fields?: FieldOverrides;
  resolveOptions?: ResolveOptions;
  isAbstract?: boolean;
}

let ANON_ARGS_ID = 0;

export function createZodArgsType<T extends ZodType<any, any>>(
  schema: T,
  options: CreateZodArgsTypeOptions = {},
): new () => T['_output'] {
  const name = options.name ?? `ZodArgs${++ANON_ARGS_ID}`;
  return buildDecoratedClass({
    schema,
    name,
    description: options.description,
    fields: options.fields,
    resolveOptions: options.resolveOptions,
    kind: 'args',
    classDecorator: options.isAbstract ? ArgsType({ isAbstract: options.isAbstract }) : ArgsType(),
  });
}

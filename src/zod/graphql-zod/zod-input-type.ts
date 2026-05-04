import { InputType } from '@nestjs/graphql';
import type { ZodType } from 'zod';
import { buildDecoratedClass, type FieldOverrides, type ResolveOptions } from './core';

export interface CreateZodInputTypeOptions {
  name: string;
  description?: string;
  fields?: FieldOverrides;
  resolveOptions?: ResolveOptions;
  isAbstract?: boolean;
}

export function createZodInputType<T extends ZodType<any, any>>(
  schema: T,
  options: CreateZodInputTypeOptions,
): new () => T['_output'] {
  return buildDecoratedClass({
    schema,
    name: options.name,
    description: options.description,
    fields: options.fields,
    resolveOptions: options.resolveOptions,
    kind: 'input',
    classDecorator: InputType(options.name, {
      description: options.description,
      isAbstract: options.isAbstract,
    }),
  });
}

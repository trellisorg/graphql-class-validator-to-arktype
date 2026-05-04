import { ObjectType } from '@nestjs/graphql';
import type { ZodType } from 'zod';
import { buildDecoratedClass, type FieldOverrides, type ResolveOptions } from './core';

export interface CreateZodObjectTypeOptions {
  name: string;
  description?: string;
  fields?: FieldOverrides;
  resolveOptions?: ResolveOptions;
  isAbstract?: boolean;
  implements?: () => any | (() => any[]);
}

export function createZodObjectType<T extends ZodType<any, any>>(
  schema: T,
  options: CreateZodObjectTypeOptions,
): new () => T['_output'] {
  const objOpts: any = { description: options.description, isAbstract: options.isAbstract };
  if (options.implements) objOpts.implements = options.implements;
  return buildDecoratedClass({
    schema,
    name: options.name,
    description: options.description,
    fields: options.fields,
    resolveOptions: options.resolveOptions,
    kind: 'object',
    classDecorator: ObjectType(options.name, objOpts),
  });
}

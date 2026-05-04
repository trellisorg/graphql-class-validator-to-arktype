import { ArgsType } from '@nestjs/graphql';
import type { ZodType } from 'zod';
import { type FieldOverrides, type ResolveOptions, buildDecoratedClass } from './core';

export interface CreateZodArgsTypeOptions {
    name?: string;
    description?: string;
    fields?: FieldOverrides;
    resolveOptions?: ResolveOptions;
}

let ANON_ARGS_ID = 0;

export function createZodArgsType<T extends ZodType<any, any>>(
    schema: T,
    options: CreateZodArgsTypeOptions = {}
): new () => T['_output'] {
    const name = options.name ?? `ZodArgs${++ANON_ARGS_ID}`;
    return buildDecoratedClass({
        classDecorator: ArgsType(),
        description: options.description,
        fields: options.fields,
        kind: 'args',
        name,
        resolveOptions: options.resolveOptions,
        schema,
    });
}

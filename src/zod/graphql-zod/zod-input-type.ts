import { InputType } from '@nestjs/graphql';
import type { ZodType } from 'zod';
import { type FieldOverrides, type ResolveOptions, buildDecoratedClass } from './core';

export interface CreateZodInputTypeOptions {
    name: string;
    description?: string;
    fields?: FieldOverrides;
    resolveOptions?: ResolveOptions;
    isAbstract?: boolean;
}

export function createZodInputType<T extends ZodType<any, any>>(
    schema: T,
    options: CreateZodInputTypeOptions
): new () => T['_output'] {
    return buildDecoratedClass({
        classDecorator: InputType(options.name, {
            description: options.description,
            isAbstract: options.isAbstract,
        }),
        description: options.description,
        fields: options.fields,
        kind: 'input',
        name: options.name,
        resolveOptions: options.resolveOptions,
        schema,
    });
}

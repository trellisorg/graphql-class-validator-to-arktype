import { ObjectType } from '@nestjs/graphql';
import type { ZodType } from 'zod';
import { type FieldOverrides, type ResolveOptions, buildDecoratedClass } from './core';

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
    options: CreateZodObjectTypeOptions
): new () => T['_output'] {
    const objOpts: any = { description: options.description, isAbstract: options.isAbstract };
    if (options.implements) {
        objOpts.implements = options.implements;
    }
    return buildDecoratedClass({
        classDecorator: ObjectType(options.name, objOpts),
        description: options.description,
        fields: options.fields,
        kind: 'object',
        name: options.name,
        resolveOptions: options.resolveOptions,
        schema,
    });
}

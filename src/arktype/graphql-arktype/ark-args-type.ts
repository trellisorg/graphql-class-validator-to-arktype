import { ArgsType } from '@nestjs/graphql';
import type { Type as ArkType } from 'arktype';
import { type FieldOverrides, type ResolveOptions, buildDecoratedClass } from './core';

export interface CreateArkArgsTypeOptions {
    /**
     * Optional — `@ArgsType()` types are anonymous in the schema by default.
     */
    name?: string;
    description?: string;
    fields?: FieldOverrides;
    resolveOptions?: ResolveOptions;
}

/**
 * Generate a NestJS `@ArgsType()` class from an ArkType schema. Used as a resolver argument bundle: every property
 * becomes an inline GraphQL argument rather than a named input type.
 *
 * @example
 *     const ListBooksArgsSchema = type({ limit: 'number.integer < 100', offset: 'number.integer >= 0' })
 *     class ListBooksArgs extends createArkArgsType(ListBooksArgsSchema, { name: 'ListBooksArgs' }) {}
 *     resolver: @Query() books(@Args() args: ListBooksArgs) {}
 */
export function createArkArgsType<T extends ArkType<any>>(
    schema: T,
    options: CreateArkArgsTypeOptions = {}
): new () => T['infer'] {
    const name = options.name ?? `ArkArgs${++ANON_ARGS_ID}`;
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

let ANON_ARGS_ID = 0;

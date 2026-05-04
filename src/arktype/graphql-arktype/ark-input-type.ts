import { InputType } from '@nestjs/graphql';
import type { Type as ArkType } from 'arktype';
import { type FieldOverrides, type ResolveOptions, buildDecoratedClass } from './core';

export interface CreateArkInputTypeOptions {
    name: string;
    description?: string;
    /**
     * Override GraphQL field types for properties that can't be inferred from JSON schema alone (object refs,
     * array-of-object refs) or where you want to force a specific type (e.g. ID, custom scalar).
     *
     * Accepted shapes per entry:
     *
     * - A class: `tags: TagInput`
     * - An array of class: `tags: [TagInput]`
     * - A thunk: `tags: () => [TagInput]`
     * - A `{type, nullable}` obj: `tags: { type: () => [TagInput], nullable: false }`
     */
    fields?: FieldOverrides;
    /**
     * Tunes scalar inference (e.g. uuid → ID, date-time → GraphQLISODateTime).
     */
    resolveOptions?: ResolveOptions;
    /**
     * Forwarded to `@InputType()` so the field is omitted from the gql schema.
     */
    isAbstract?: boolean;
}

/**
 * Generate a NestJS `@InputType` class from an ArkType schema. The schema is also attached to the class so
 * `ArkValidationPipe` can run it on the request.
 */
export function createArkInputType<T extends ArkType<any>>(
    schema: T,
    options: CreateArkInputTypeOptions
): new () => T['infer'] {
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

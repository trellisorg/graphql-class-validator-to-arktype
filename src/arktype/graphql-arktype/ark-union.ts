import { createUnionType } from '@nestjs/graphql';
import { ArkErrors } from 'arktype';
import { getArkSchema } from './core';

export interface CreateArkUnionOptions<T extends readonly NewableFunction[]> {
    name: string;
    description?: string;
    /**
     * Override the default discriminator. The default tries each member class's attached ArkType schema, in order,
     * and returns the first one whose validator accepts the value. This works for unions whose members have
     * structurally distinct shapes; supply an explicit `resolveType` when the shapes overlap (or when you want a
     * faster discriminator that doesn't run a full schema validation per value).
     */
    resolveType?: (value: unknown) => T[number] | string | undefined;
}

/**
 * Bridge a heterogeneous result type into a NestJS GraphQL union.
 *
 * Every member must already be a class produced by `createArkObjectType` (so it has an attached schema for the
 * default discriminator). Returns whatever `createUnionType` returns — a value, not a class — which you pass to
 * `@Mutation(() => MyResultUnion)` or any other position that accepts a return-type ref.
 *
 * @example
 *     const CreateBookResult = createArkUnion('CreateBookResult', [Book, ValidationError]);
 *
 *     @Mutation(() => CreateBookResult)
 *     createBook(@ArkArgs('input', CreateBookInput) input: ...): typeof Book.infer | typeof ValidationError.infer {
 *         ...
 *     }
 */
export function createArkUnion<const T extends readonly NewableFunction[]>(
    members: T,
    options: CreateArkUnionOptions<T>
) {
    if (members.length < 2) {
        throw new Error(
            `createArkUnion("${options.name}"): a union needs at least two members; got ${members.length}`
        );
    }

    const resolveType = options.resolveType ?? defaultResolveType(members, options.name);

    return createUnionType({
        description: options.description,
        name: options.name,
        resolveType,
        types: () => members as unknown as readonly any[],
    });
}

function defaultResolveType<T extends readonly NewableFunction[]>(
    members: T,
    unionName: string
): (value: unknown) => T[number] | undefined {
    return (value) => {
        for (const member of members) {
            const schema = getArkSchema(member);
            if (!schema) {
                throw new Error(
                    `createArkUnion("${unionName}"): member "${member.name}" has no attached ArkType schema; was it produced by createArkObjectType? Supply an explicit resolveType to bypass this check.`
                );
            }
            const out = schema(value);
            if (!(out instanceof ArkErrors)) {
                return member as T[number];
            }
        }
        return undefined;
    };
}

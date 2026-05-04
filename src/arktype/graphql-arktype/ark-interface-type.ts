import { InterfaceType } from '@nestjs/graphql';
import type { Type as ArkType } from 'arktype';
import { type FieldOverrides, type ResolveOptions, buildDecoratedClass } from './core';

export interface CreateArkInterfaceTypeOptions {
    name: string;
    description?: string;
    fields?: FieldOverrides;
    resolveOptions?: ResolveOptions;
    /**
     * Required when concrete `@ObjectType` classes implement this interface — `@nestjs/graphql` calls this for each
     * value to determine which implementation it is. Receives the runtime value and should return the concrete
     * class (or its registered name).
     */
    resolveType?: (value: unknown) => Function | string | undefined;
    /**
     * Forwarded to `@InterfaceType()` so the interface itself is omitted from concrete schema generation when used
     * purely as a base class.
     */
    isAbstract?: boolean;
}

/**
 * Generate a NestJS `@InterfaceType` class from an ArkType schema. Use this for shared field-sets that multiple
 * `@ObjectType` classes implement; the `resolveType` callback discriminates a runtime value into one of the
 * concrete types (otherwise the GraphQL runtime can't pick which implementation to serialise).
 */
export function createArkInterfaceType<T extends ArkType<any>>(
    schema: T,
    options: CreateArkInterfaceTypeOptions
): new () => T['infer'] {
    const interfaceTypeOpts: Record<string, unknown> = {
        description: options.description,
        isAbstract: options.isAbstract,
    };
    if (options.resolveType) {
        interfaceTypeOpts.resolveType = options.resolveType;
    }

    return buildDecoratedClass({
        classDecorator: InterfaceType(options.name, interfaceTypeOpts),
        description: options.description,
        fields: options.fields,
        kind: 'interface',
        name: options.name,
        resolveOptions: options.resolveOptions,
        schema,
    });
}

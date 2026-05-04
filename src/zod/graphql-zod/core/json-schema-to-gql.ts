import { Float, GraphQLISODateTime, ID, Int } from '@nestjs/graphql';
import { zodRegistry } from './zod-meta';

export type FieldRef = (() => any) | { type: () => any; nullable?: boolean } | any[] | any;

export type FieldOverrides = Record<string, FieldRef>;

export interface ResolveOptions {
    idFormats?: ReadonlySet<string>;
    isoDateTime?: boolean;
}

export interface ResolvedField {
    type: () => any;
    nullable: boolean;
}

export function resolveField(args: {
    ownerName: string;
    propName: string;
    propSchema: any;
    required: boolean;
    overrides: FieldOverrides;
    options: ResolveOptions;
}): ResolvedField {
    const { ownerName, propName, propSchema, required, overrides, options } = args;
    const nullable = !required;

    const override = overrides[propName];
    if (override !== undefined) {
        return normalizeOverride(override, nullable);
    }

    const registered = registryLookupForProp(propSchema);
    if (registered) {
        return Array.isArray(registered)
            ? { nullable, type: () => [registered[0]] }
            : { nullable, type: () => registered };
    }

    return derive(propSchema, ownerName, propName, options, nullable);
}

function normalizeOverride(override: FieldRef, nullable: boolean): ResolvedField {
    if (override && typeof override === 'object' && !Array.isArray(override) && 'type' in override) {
        return { nullable: override.nullable ?? nullable, type: override.type };
    }
    if (typeof override === 'function') {
        const isClass = Boolean(override.prototype) && override.prototype.constructor === override;
        return { nullable, type: isClass ? () => override : (override as () => any) };
    }
    if (Array.isArray(override)) {
        const inner = override[0];
        return { nullable, type: () => [unwrapInner(inner)] };
    }
    return { nullable, type: () => override };
}

function unwrapInner(inner: any): any {
    if (typeof inner === 'function') {
        const isClass = Boolean(inner.prototype) && inner.prototype.constructor === inner;
        return isClass ? inner : inner();
    }
    return inner;
}

function registryLookupForProp(propSchema: any): any | any[] | undefined {
    if (!propSchema || typeof propSchema !== 'object') {
        return undefined;
    }
    if (propSchema.type === 'object') {
        return zodRegistry.findByJsonSchema(propSchema);
    }
    if (propSchema.type === 'array' && propSchema.items?.type === 'object') {
        const cls = zodRegistry.findByJsonSchema(propSchema.items);
        if (cls) {
            return [cls];
        }
    }
    return undefined;
}

function derive(
    propSchema: any,
    ownerName: string,
    propName: string,
    options: ResolveOptions,
    nullable: boolean
): ResolvedField {
    if (!propSchema || typeof propSchema !== 'object') {
        throw new Error(`graphql-zod: property "${ownerName}.${propName}" has no schema`);
    }

    if (Array.isArray(propSchema.anyOf)) {
        const nonNulls = propSchema.anyOf.filter((b: any) => b?.type !== 'null');
        const hasNull = propSchema.anyOf.length > nonNulls.length;
        if (nonNulls.length === 1) {
            return derive(nonNulls[0], ownerName, propName, options, nullable || hasNull);
        }
    }

    if (Array.isArray(propSchema.enum) && propSchema.type === 'string') {
        return { nullable, type: () => String };
    }

    switch (propSchema.type) {
        case 'string': {
            const fmt = propSchema.format as string | undefined;
            if (fmt && options.idFormats?.has(fmt)) {
                return { nullable, type: () => ID };
            }
            if (fmt === 'date-time' && options.isoDateTime) {
                return { nullable, type: () => GraphQLISODateTime };
            }
            return { nullable, type: () => String };
        }
        case 'boolean': {
            return { type: () => Boolean, nullable };
        }
        case 'integer': {
            return { type: () => Int, nullable };
        }
        case 'number': {
            return { type: () => Float, nullable };
        }
        case 'array': {
            const { items } = propSchema;
            if (!items) {
                throw new Error(
                    `graphql-zod: array property "${ownerName}.${propName}" has no items schema (supply a fields override)`
                );
            }
            if (items.type === 'object') {
                throw new Error(
                    `graphql-zod: array of object property "${ownerName}.${propName}" did not match any registered Zod class — register the inner schema first or supply an explicit fields override`
                );
            }
            const inner = derive(items, ownerName, `${propName}[]`, options, false);
            return { nullable, type: () => [inner.type()] };
        }
        case 'object': {
            throw new Error(
                `graphql-zod: object property "${ownerName}.${propName}" did not match any registered Zod class — register the nested schema first or supply an explicit fields override`
            );
        }
        default: {
            throw new Error(
                `graphql-zod: unsupported JSON schema type "${propSchema.type}" for "${ownerName}.${propName}"`
            );
        }
    }
}

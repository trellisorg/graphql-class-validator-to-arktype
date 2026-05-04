import { Float, GraphQLISODateTime, ID, Int } from '@nestjs/graphql';
import { arkRegistry } from './ark-meta';

/**
 * Either a class reference, an array containing a class reference, a thunk
 * returning either, or an object with `{ type, nullable }`. Exists so callers
 * can write `fields: { tags: [TagInput] }` instead of `() => [TagInput]`.
 */
export type FieldRef =
  | (() => any)
  | { type: () => any; nullable?: boolean }
  | any[]
  | any;

export type FieldOverrides = Record<string, FieldRef>;

export interface ResolveOptions {
  /** Format strings (e.g. `"uuid"`, `"date-time"`) that should map to ID. */
  idFormats?: ReadonlySet<string>;
  /** Whether `format: "date-time"` maps to GraphQLISODateTime instead of String. */
  isoDateTime?: boolean;
}

export interface ResolvedField {
  type: () => any;
  nullable: boolean;
}

/**
 * Resolve the GraphQL field type for a single property. Order of precedence:
 *   1. Explicit override in `overrides[propName]`
 *   2. Schema-level lookup via the global registry (matches inline objects
 *      to a previously-registered class with the same JSON shape)
 *   3. Pure derivation from the JSON-schema fragment
 *
 * Throws when the property would otherwise resolve to an un-named GraphQL
 * object, since `@nestjs/graphql` requires a named class for those.
 */
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

  // Search the registry for an exact match before recursing — handles the
  // common case where a nested object is the JSON form of a previously
  // registered ArkType schema.
  const registered = registryLookupForProp(propSchema);
  if (registered) {
    return { type: () => registered, nullable };
  }

  return derive(propSchema, ownerName, propName, options, nullable);
}

function normalizeOverride(override: FieldRef, nullable: boolean): ResolvedField {
  if (override && typeof override === 'object' && !Array.isArray(override) && 'type' in override) {
    return {
      type: override.type,
      nullable: override.nullable ?? nullable,
    };
  }
  if (typeof override === 'function') {
    // Could be a class constructor or a thunk. Distinguish by whether the
    // function has a `prototype` (class) — thunks returning classes are also
    // functions but typically arrow functions without a prototype.
    const isClass = !!override.prototype && override.prototype.constructor === override;
    return { type: isClass ? () => override : (override as () => any), nullable };
  }
  if (Array.isArray(override)) {
    const inner = override[0];
    return { type: () => [unwrapInner(inner)], nullable };
  }
  // Bare class instance? Treat as a class.
  return { type: () => override, nullable };
}

function unwrapInner(inner: any): any {
  if (typeof inner === 'function') {
    const isClass = !!inner.prototype && inner.prototype.constructor === inner;
    return isClass ? inner : inner();
  }
  return inner;
}

function registryLookupForProp(propSchema: any): any | undefined {
  if (!propSchema || typeof propSchema !== 'object') return undefined;
  if (propSchema.type === 'object') {
    return arkRegistry.findByJsonSchema(propSchema);
  }
  if (propSchema.type === 'array' && propSchema.items?.type === 'object') {
    const cls = arkRegistry.findByJsonSchema(propSchema.items);
    if (cls) return [cls]; // signal array-of-class to the caller
  }
  return undefined;
}

function derive(
  propSchema: any,
  ownerName: string,
  propName: string,
  options: ResolveOptions,
  nullable: boolean,
): ResolvedField {
  if (!propSchema || typeof propSchema !== 'object') {
    throw new Error(`graphql-arktype: property "${ownerName}.${propName}" has no schema`);
  }

  // anyOf with one non-null branch + null is just an optional/nullable field.
  if (Array.isArray(propSchema.anyOf)) {
    const nonNulls = propSchema.anyOf.filter((b: any) => b?.type !== 'null');
    const hasNull = propSchema.anyOf.length > nonNulls.length;
    if (nonNulls.length === 1) {
      return derive(nonNulls[0], ownerName, propName, options, nullable || hasNull);
    }
  }

  // JSON-Schema enum array (e.g. ['DRAFT', 'PUBLISHED']) we surface as String;
  // for an actual GraphQL enum users should use `registerArkEnum` and pass the
  // resulting class via `fields: { status: () => OrderStatus }`.
  if (Array.isArray(propSchema.enum) && propSchema.type === 'string') {
    return { type: () => String, nullable };
  }

  switch (propSchema.type) {
    case 'string': {
      const fmt = propSchema.format as string | undefined;
      if (fmt && options.idFormats?.has(fmt)) {
        return { type: () => ID, nullable };
      }
      if (fmt === 'date-time' && options.isoDateTime) {
        return { type: () => GraphQLISODateTime, nullable };
      }
      return { type: () => String, nullable };
    }
    case 'boolean':
      return { type: () => Boolean, nullable };
    case 'integer':
      return { type: () => Int, nullable };
    case 'number':
      return { type: () => Float, nullable };
    case 'array': {
      const items = propSchema.items;
      if (!items) {
        throw new Error(
          `graphql-arktype: array property "${ownerName}.${propName}" has no items schema (supply a fields override)`,
        );
      }
      if (items.type === 'object') {
        throw new Error(
          `graphql-arktype: array of object property "${ownerName}.${propName}" did not match any registered ArkType class — register the inner schema before this one or supply an explicit fields override`,
        );
      }
      const inner = derive(items, ownerName, propName + '[]', options, false);
      return { type: () => [inner.type()], nullable };
    }
    case 'object':
      throw new Error(
        `graphql-arktype: object property "${ownerName}.${propName}" did not match any registered ArkType class — register the nested schema before this one or supply an explicit fields override`,
      );
    default:
      throw new Error(
        `graphql-arktype: unsupported JSON schema type "${propSchema.type}" for "${ownerName}.${propName}"`,
      );
  }
}

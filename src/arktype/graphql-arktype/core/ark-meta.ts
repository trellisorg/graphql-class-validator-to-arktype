import type { Type as ArkType } from 'arktype';
import 'reflect-metadata';

/**
 * Metadata key under which the originating ArkType schema is attached to a generated class (input, object, args).
 * Pipes look it up to validate input, resolvers can opt into output validation by reading the same key.
 */
export const ARK_SCHEMA_METADATA = Symbol('ark:schema');

/**
 * Tag attached to every class produced by an `createArkXxxType` factory.
 */
export const ARK_KIND_METADATA = Symbol('ark:kind');

/**
 * Optional flag set by `@ArkQuery`/`@ArkMutation` to validate the return value.
 */
export const ARK_VALIDATE_OUTPUT_METADATA = Symbol('ark:validate-output');

export type ArkClassKind = 'input' | 'object' | 'args' | 'interface';

export function setArkSchema(target: Function, schema: ArkType<any>, kind: ArkClassKind): void {
    Reflect.defineMetadata(ARK_SCHEMA_METADATA, schema, target);
    Reflect.defineMetadata(ARK_KIND_METADATA, kind, target);
}

export function getArkSchema(target: Function): ArkType<any> {
    return Reflect.getMetadata(ARK_SCHEMA_METADATA, target);
}

export function getArkKind(target: Function): ArkClassKind {
    return Reflect.getMetadata(ARK_KIND_METADATA, target);
}

/**
 * Module-scoped registry mapping ArkType schemas (by reference identity) to the GraphQL classes generated from
 * them. Lets nested-type resolution work without callers having to thread refs through every factory call.
 *
 * Identity-based: the same ArkType `type({...})` value always produces the same key. Schemas built ad-hoc in a
 * property override won't be found here — that's the user's problem to wire via the explicit `fields:` map.
 */
class ArkSchemaRegistry {
    private bySchema = new Map<ArkType<any>, any>();
    private byJsonSig = new Map<string, any>();
    private byName = new Map<string, any>();

    register(schema: ArkType<any>, cls: any, name: string): void {
        this.bySchema.set(schema, cls);
        this.byName.set(name, cls);
        try {
            const sig = jsonSig(schema.toJsonSchema());
            // Multiple schemas with the same JSON shape would collide; that's a
            // User-side ambiguity. First registration wins so explicit `fields:`
            // Overrides remain authoritative when needed.
            if (!this.byJsonSig.has(sig)) {
                this.byJsonSig.set(sig, cls);
            }
        } catch {
            // ToJsonSchema can throw for some morphed types; skip the JSON index.
        }
    }

    findBySchema(schema: ArkType<any>): any | undefined {
        return this.bySchema.get(schema);
    }

    findByJsonSchema(json: any): any | undefined {
        if (!json) {
            return undefined;
        }
        return this.byJsonSig.get(jsonSig(json));
    }

    findByName(name: string): any | undefined {
        return this.byName.get(name);
    }
}

export const arkRegistry = new ArkSchemaRegistry();

function jsonSig(json: any): string {
    // Deterministic stringification sorted by key so two structurally identical
    // JSON Schemas collide. Cheaper than a full deep-equal scan at lookup time.
    return JSON.stringify(canon(json));
}

// Keys to drop before computing the signature. These are JSON-Schema
// Meta-keys that ArkType emits at the root (`$schema`, `$id`, `$ref`,
// `title`, `description`) but NOT on inline nested schemas, which would
// Otherwise prevent root-vs-nested collision.
const SIG_IGNORE = new Set(['$schema', '$id', '$ref', 'title', 'description']);

function canon(v: any): any {
    if (v === null || typeof v !== 'object') {
        return v;
    }
    if (Array.isArray(v)) {
        return v.map(canon);
    }
    const out: any = {};
    for (const k of Object.keys(v).toSorted()) {
        if (SIG_IGNORE.has(k)) {
            continue;
        }
        out[k] = canon(v[k]);
    }
    return out;
}

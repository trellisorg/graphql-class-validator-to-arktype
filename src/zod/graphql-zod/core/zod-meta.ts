import 'reflect-metadata';
import type { ZodType } from 'zod';

export const ZOD_SCHEMA_METADATA = Symbol('zod:schema');
export const ZOD_KIND_METADATA = Symbol('zod:kind');

export type ZodClassKind = 'input' | 'object' | 'args';

export function setZodSchema(target: Function, schema: ZodType<any, any>, kind: ZodClassKind): void {
    Reflect.defineMetadata(ZOD_SCHEMA_METADATA, schema, target);
    Reflect.defineMetadata(ZOD_KIND_METADATA, kind, target);
}

export function getZodSchema(target: Function): ZodType<any, any> | undefined {
    return Reflect.getMetadata(ZOD_SCHEMA_METADATA, target);
}

export function getZodKind(target: Function): ZodClassKind | undefined {
    return Reflect.getMetadata(ZOD_KIND_METADATA, target);
}

class ZodSchemaRegistry {
    private bySchema = new Map<ZodType<any, any>, any>();
    private byJsonSig = new Map<string, any>();
    private byName = new Map<string, any>();

    register(schema: ZodType<any, any>, jsonSchema: any, cls: any, name: string): void {
        this.bySchema.set(schema, cls);
        this.byName.set(name, cls);
        try {
            const sig = jsonSig(jsonSchema);
            if (!this.byJsonSig.has(sig)) {
                this.byJsonSig.set(sig, cls);
            }
        } catch {
            // Ignore
        }
    }

    findBySchema(schema: ZodType<any, any>): any | undefined {
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

export const zodRegistry = new ZodSchemaRegistry();

const SIG_IGNORE = new Set(['$schema', '$id', '$ref', 'title', 'description', 'additionalProperties']);

function jsonSig(json: any): string {
    return JSON.stringify(canon(json));
}

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

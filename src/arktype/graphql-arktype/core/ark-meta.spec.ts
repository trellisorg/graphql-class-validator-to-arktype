import { type } from 'arktype';
import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { arkRegistry, getArkKind, getArkSchema, setArkSchema } from './ark-meta';

describe('setArkSchema / getArkSchema / getArkKind', () => {
    it('round-trips a schema and kind through reflect metadata', () => {
        const Schema = type({ a: 'string' });
        class Cls {}
        setArkSchema(Cls, Schema, 'input');
        expect(getArkSchema(Cls)).toBe(Schema);
        expect(getArkKind(Cls)).toBe('input');
    });

    it('returns undefined for a class with no attached metadata', () => {
        class Bare {}
        expect(getArkSchema(Bare)).toBeUndefined();
        expect(getArkKind(Bare)).toBeUndefined();
    });
});

describe('arkRegistry', () => {
    it('looks up a class by schema reference, name, and equivalent JSON shape', () => {
        const Schema = type({ id: 'string.uuid.v4', label: 'string > 0' });
        class FakeClass {}
        arkRegistry.register(Schema, FakeClass, 'FakeClassUnique1');

        expect(arkRegistry.findBySchema(Schema)).toBe(FakeClass);
        expect(arkRegistry.findByName('FakeClassUnique1')).toBe(FakeClass);
        // Same JSON shape from a freshly-built schema should resolve too.
        const Mirror = type({ id: 'string.uuid.v4', label: 'string > 0' });
        expect(arkRegistry.findByJsonSchema(Mirror.toJsonSchema())).toBe(FakeClass);
    });

    it('returns undefined for unknown lookups', () => {
        expect(arkRegistry.findByName('definitely-not-registered-Unique1')).toBeUndefined();
        expect(arkRegistry.findByJsonSchema(undefined)).toBeUndefined();
    });
});

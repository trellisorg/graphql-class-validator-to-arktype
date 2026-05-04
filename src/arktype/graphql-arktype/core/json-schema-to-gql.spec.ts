import { Float, GraphQLISODateTime, ID, Int } from '@nestjs/graphql';
import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { type FieldOverrides, type ResolveOptions, resolveField } from './json-schema-to-gql';

const defaultOptions: ResolveOptions = {
    idFormats: new Set(['uuid']),
    isoDateTime: true,
};

const args = (
    propSchema: object,
    required: boolean,
    overrides: FieldOverrides = {},
    options: ResolveOptions = defaultOptions
) => ({
    options,
    overrides,
    ownerName: 'Owner',
    propName: 'prop',
    propSchema,
    required,
});

describe('resolveField — derivation', () => {
    it('marks non-required properties nullable', () => {
        const out = resolveField(args({ type: 'string' }, false));
        expect(out.nullable).toBe(true);
        expect(out.type()).toBe(String);
    });

    it('marks required properties non-nullable', () => {
        const out = resolveField(args({ type: 'string' }, true));
        expect(out.nullable).toBe(false);
    });

    it('maps integer → Int', () => {
        expect(resolveField(args({ type: 'integer' }, true)).type()).toBe(Int);
    });

    it('maps number → Float', () => {
        expect(resolveField(args({ type: 'number' }, true)).type()).toBe(Float);
    });

    it('maps boolean → Boolean', () => {
        expect(resolveField(args({ type: 'boolean' }, true)).type()).toBe(Boolean);
    });

    it('maps string format=uuid → ID when configured', () => {
        expect(resolveField(args({ format: 'uuid', type: 'string' }, true)).type()).toBe(ID);
    });

    it('maps string format=date-time → GraphQLISODateTime when isoDateTime: true', () => {
        expect(resolveField(args({ format: 'date-time', type: 'string' }, true)).type()).toBe(GraphQLISODateTime);
    });

    it('treats anyOf with one non-null branch + null as nullable', () => {
        const out = resolveField(args({ anyOf: [{ type: 'string' }, { type: 'null' }] }, true));
        expect(out.type()).toBe(String);
        expect(out.nullable).toBe(true);
    });

    it('arrays of primitives wrap the inner type', () => {
        const out = resolveField(args({ items: { type: 'string' }, type: 'array' }, true));
        expect(out.type()).toEqual([String]);
    });

    it('throws on a bare unnamed object property', () => {
        expect(() => resolveField(args({ properties: {}, type: 'object' }, true))).toThrowError(
            /did not match any registered ArkType class/
        );
    });
});

describe('resolveField — overrides', () => {
    class FakeRef {}

    it('accepts a class override directly', () => {
        const out = resolveField(args({ type: 'string' }, true, { prop: FakeRef }));
        expect(out.type()).toBe(FakeRef);
    });

    it('accepts an array-of-class override', () => {
        const out = resolveField(args({ type: 'string' }, true, { prop: [FakeRef] }));
        expect(out.type()).toEqual([FakeRef]);
    });

    it('accepts a thunk override', () => {
        const out = resolveField(args({ type: 'string' }, true, { prop: () => FakeRef }));
        expect(out.type()).toBe(FakeRef);
    });

    it('accepts an explicit { type, nullable } override', () => {
        const out = resolveField(
            args({ type: 'string' }, true, {
                prop: { nullable: true, type: () => FakeRef },
            })
        );
        expect(out.type()).toBe(FakeRef);
        expect(out.nullable).toBe(true);
    });

    it('accepts a hidden override', () => {
        const out = resolveField(args({ type: 'string' }, true, { prop: { hidden: true } }));
        expect(out.hidden).toBe(true);
    });
});

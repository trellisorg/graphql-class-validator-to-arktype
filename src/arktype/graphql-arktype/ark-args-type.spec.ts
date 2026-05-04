import { ArkErrors, type } from 'arktype';
import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { loadAttachedSchema } from './__test-utils__/load-schema';
import { createArkArgsType } from './ark-args-type';
import { getArkKind } from './core';

describe('createArkArgsType', () => {
    const ListSchema = type({
        limit: '1 <= number.integer <= 100',
        offset: 'number.integer >= 0',
    });

    it('uses the supplied name when given', () => {
        const Args = createArkArgsType(ListSchema, { name: 'ListArgsUnique1' });
        expect(Args.name).toBe('ListArgsUnique1');
        expect(getArkKind(Args)).toBe('args');
    });

    it('falls back to an anonymous name when none provided', () => {
        const Anon = createArkArgsType(type({ q: 'string > 0' }));
        expect(Anon.name).toMatch(/^ArkArgs\d+$/);
    });

    it('attaches the schema for the validation pipe', () => {
        const Args = createArkArgsType(ListSchema, { name: 'ListArgsUnique2' });
        const schema = loadAttachedSchema(Args);
        expect(schema({ limit: 50, offset: 0 })).toEqual({ limit: 50, offset: 0 });
        expect(schema({ limit: 0, offset: 0 })).toBeInstanceOf(ArkErrors);
    });
});

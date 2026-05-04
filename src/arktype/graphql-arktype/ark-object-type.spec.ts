import { type } from 'arktype';
import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { loadAttachedSchema } from './__test-utils__/load-schema';
import { createArkObjectType } from './ark-object-type';
import { arkRegistry, getArkKind } from './core';

describe('createArkObjectType', () => {
    const ResultSchema = type({
        id: 'string.uuid.v4',
        total: 'number.integer >= 0',
    });

    const ResultObject = createArkObjectType(ResultSchema, { name: 'ResultObjectUnique1' });

    it('produces a class with the supplied name', () => {
        expect(ResultObject.name).toBe('ResultObjectUnique1');
    });

    it('records the kind as "object"', () => {
        expect(getArkKind(ResultObject)).toBe('object');
    });

    it('attaches the schema and validates against it', () => {
        const schema = loadAttachedSchema(ResultObject);
        expect(schema({ id: '550e8400-e29b-41d4-a716-446655440000', total: 0 })).toEqual({
            id: '550e8400-e29b-41d4-a716-446655440000',
            total: 0,
        });
    });

    it('registers in arkRegistry under schema reference and name', () => {
        expect(arkRegistry.findBySchema(ResultSchema)).toBe(ResultObject);
        expect(arkRegistry.findByName('ResultObjectUnique1')).toBe(ResultObject);
    });
});

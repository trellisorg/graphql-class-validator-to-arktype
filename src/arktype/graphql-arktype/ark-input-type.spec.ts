import { ArkErrors, type } from 'arktype';
import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { loadAttachedSchema } from './__test-utils__/load-schema';
import { createArkInputType } from './ark-input-type';
import { arkRegistry, getArkKind } from './core';

describe('createArkInputType', () => {
    const ItemSchema = type({
        id: 'string.uuid.v4',
        quantity: '1 <= number.integer <= 999',
    });

    const ItemInput = createArkInputType(ItemSchema, { name: 'ItemInputUnique1' });

    it('produces a class whose `name` matches the supplied option', () => {
        expect(ItemInput.name).toBe('ItemInputUnique1');
    });

    it('attaches the originating schema as metadata', () => {
        const schema = loadAttachedSchema(ItemInput);
        const out = schema({
            id: '550e8400-e29b-41d4-a716-446655440000',
            quantity: 5,
        });
        expect(out).toEqual({
            id: '550e8400-e29b-41d4-a716-446655440000',
            quantity: 5,
        });
    });

    it('records the kind as "input"', () => {
        expect(getArkKind(ItemInput)).toBe('input');
    });

    it('rejects payloads that fail the schema', () => {
        const schema = loadAttachedSchema(ItemInput);
        expect(schema({ id: 'not-a-uuid', quantity: 5 })).toBeInstanceOf(ArkErrors);
        expect(schema({ id: '550e8400-e29b-41d4-a716-446655440000', quantity: 0 })).toBeInstanceOf(ArkErrors);
    });

    it('registers the class with arkRegistry under both schema reference and name', () => {
        expect(arkRegistry.findBySchema(ItemSchema)).toBe(ItemInput);
        expect(arkRegistry.findByName('ItemInputUnique1')).toBe(ItemInput);
    });

    it('auto-resolves nested registered schemas without an explicit field override', () => {
        const CartSchema = type({
            cartId: 'string.uuid.v4',
            item: ItemSchema,
        });
        const CartInput = createArkInputType(CartSchema, { name: 'CartInputUnique1' });
        const cartSchema = loadAttachedSchema(CartInput);
        expect(
            cartSchema({
                cartId: '550e8400-e29b-41d4-a716-446655440000',
                item: { id: '11111111-1111-4111-8111-111111111111', quantity: 1 },
            })
        ).toEqual({
            cartId: '550e8400-e29b-41d4-a716-446655440000',
            item: { id: '11111111-1111-4111-8111-111111111111', quantity: 1 },
        });
    });

    it('throws when the schema is not an object root', () => {
        const PrimitiveSchema = type('string > 0');
        expect(() => createArkInputType(PrimitiveSchema, { name: 'PrimitiveInputUnique1' })).toThrow(
            /object JSON schema/
        );
    });
});

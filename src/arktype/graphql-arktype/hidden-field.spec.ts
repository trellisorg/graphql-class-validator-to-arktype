import { ArkErrors, type } from 'arktype';
import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { loadAttachedSchema } from './__test-utils__/load-schema';
import { createArkInputType } from './ark-input-type';
import { getArkSchema } from './core';

// Mirrors the migration target for class-validator's
// `GraphQLHiddenIdField` / `GraphQLRequiredHiddenStringField` /
// `GraphQLHiddenIntField` family — fields that are validated but not exposed
// In the GraphQL schema.
describe('createArkInputType with hidden: true', () => {
    const InternalRecordSchema = type({
        publicId: 'string.uuid.v4',
        internalRowId: 'string > 0', // Hidden ID — not in graph, still validated
        description: 'string',
    });

    const InternalRecordInput = createArkInputType(InternalRecordSchema, {
        fields: {
            internalRowId: { hidden: true },
        },
        name: 'InternalRecordInput',
    });

    it('attaches the schema to the class so the validation pipe can run it', () => {
        expect(getArkSchema(InternalRecordInput)).toBeDefined();
    });

    it('validates the hidden field as part of the schema', () => {
        const schema = loadAttachedSchema(InternalRecordInput);
        const out = schema({
            description: 'hi',
            internalRowId: '',
            publicId: '550e8400-e29b-41d4-a716-446655440000',
        });
        expect(out).toBeInstanceOf(ArkErrors);
    });

    it('accepts a payload that has all fields populated correctly', () => {
        const schema = loadAttachedSchema(InternalRecordInput);
        const out = schema({
            description: 'hi',
            internalRowId: 'row-42',
            publicId: '550e8400-e29b-41d4-a716-446655440000',
        });
        expect(out).not.toBeInstanceOf(ArkErrors);
    });

    // Asserting that the field is *actually omitted* from the GraphQL schema
    // (rather than just not validated as visible) requires booting the schema
    // Builder, which is exercised by the existing `arktype-demo` app's
    // Introspection. Kept out of this unit suite to avoid a Nest dependency.
});

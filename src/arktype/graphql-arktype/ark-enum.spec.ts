import { type } from 'arktype';
import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { registerArkEnum, validateArkEnum } from './ark-enum';

describe('registerArkEnum', () => {
    it('extracts string literals from a union and exposes them as values + gqlEnumRef', () => {
        const StatusSchema = type("'PENDING' | 'PAID' | 'SHIPPED'");
        const Status = registerArkEnum(StatusSchema, { name: 'OrderStatusUnique1' });

        expect(Status.name).toBe('OrderStatusUnique1');
        expect(new Set(Status.values)).toEqual(new Set(['PENDING', 'PAID', 'SHIPPED']));
        expect(Status.gqlEnumRef).toEqual({
            PAID: 'PAID',
            PENDING: 'PENDING',
            SHIPPED: 'SHIPPED',
        });
    });

    it('throws for a schema that is not a string-literal union', () => {
        const NumericUnion = type('number');
        expect(() => registerArkEnum(NumericUnion, { name: 'BadEnumUnique1' })).toThrowError(
            /finite set of string literals/
        );
    });
});

describe('validateArkEnum', () => {
    const StatusSchema = type("'A' | 'B'");

    it('returns the validated value when it matches the schema', () => {
        expect(validateArkEnum(StatusSchema, 'A')).toBe('A');
    });

    it('throws when the value is not in the enum', () => {
        expect(() => validateArkEnum(StatusSchema, 'C')).toThrowError(/must be/);
    });
});

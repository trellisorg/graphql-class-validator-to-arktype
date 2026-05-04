import { ArkErrors } from 'arktype';
import { describe, expect, it } from 'vitest';
import { RecordOfNonNegativeInt } from './record-of-non-negative-int';

describe('RecordOfNonNegativeInt', () => {
    it.each([
        { input: {}, label: 'empty object' },
        { input: { a: 0 }, label: 'a zero' },
        { input: { a: 1, b: 0, c: 100 }, label: 'mixed zero + positive' },
    ])('accepts $label', ({ input }) => {
        expect(RecordOfNonNegativeInt(input)).toEqual(input);
    });

    it.each([
        { input: { a: -1 }, label: 'a negative value' },
        { input: { a: 1.5 }, label: 'a non-integer' },
        { input: { a: 'one' }, label: 'a string value' },
    ])('rejects $label', ({ input }) => {
        expect(RecordOfNonNegativeInt(input)).toBeInstanceOf(ArkErrors);
    });
});

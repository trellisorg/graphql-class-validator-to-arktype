import { ArkErrors } from 'arktype';
import { describe, expect, it } from 'vitest';
import { RecordOfPositiveInt } from './record-of-positive-int';

describe('RecordOfPositiveInt', () => {
    it.each([
        { input: {}, label: 'empty object' },
        { input: { a: 1 }, label: 'single positive int' },
        { input: { a: 1, b: 2, c: 100 }, label: 'multiple positive ints' },
    ])('accepts $label', ({ input }) => {
        expect(RecordOfPositiveInt(input)).toEqual(input);
    });

    it.each([
        { input: { a: 0 }, label: 'a zero value' },
        { input: { a: -1 }, label: 'a negative value' },
        { input: { a: 1.5 }, label: 'a non-integer' },
        { input: { a: 1, b: 0 }, label: 'one bad value among good' },
        { input: { a: 'one' }, label: 'a string value' },
    ])('rejects $label', ({ input }) => {
        expect(RecordOfPositiveInt(input)).toBeInstanceOf(ArkErrors);
    });
});

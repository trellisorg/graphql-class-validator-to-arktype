import { ArkErrors } from 'arktype';
import { describe, expect, it } from 'vitest';
import { SinglePropertyObject } from './single-property-object';

describe('SinglePropertyObject', () => {
    it.each([
        { input: { a: 1 }, label: 'one defined property' },
        { input: { a: 'value', b: undefined }, label: 'one defined + one undefined' },
    ])('accepts $label', ({ input }) => {
        expect(SinglePropertyObject(input)).toEqual(input);
    });

    it.each([
        { input: {}, label: 'empty object' },
        { input: { a: 1, b: 2 }, label: 'two defined properties' },
        { input: { a: undefined, b: undefined }, label: 'all undefined' },
    ])('rejects $label', ({ input }) => {
        expect(SinglePropertyObject(input)).toBeInstanceOf(ArkErrors);
    });

    it('rejects non-objects', () => {
        expect(SinglePropertyObject(null)).toBeInstanceOf(ArkErrors);
        expect(SinglePropertyObject('foo')).toBeInstanceOf(ArkErrors);
    });
});

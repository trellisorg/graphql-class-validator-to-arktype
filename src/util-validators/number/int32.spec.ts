import { ArkErrors } from 'arktype';
import { describe, expect, it } from 'vitest';
import { Int32 } from './int32';

describe('Int32', () => {
    it.each([-2_147_483_648, 0, 2_147_483_647, 1, -1])('accepts %d', (value) => {
        expect(Int32(value)).toBe(value);
    });

    it.each([-2_147_483_649, 2_147_483_648, 1.1, Number.NaN, Infinity])('rejects %d', (value) => {
        expect(Int32(value)).toBeInstanceOf(ArkErrors);
    });

    it('rejects non-numbers', () => {
        expect(Int32('1')).toBeInstanceOf(ArkErrors);
        expect(Int32(null)).toBeInstanceOf(ArkErrors);
    });
});

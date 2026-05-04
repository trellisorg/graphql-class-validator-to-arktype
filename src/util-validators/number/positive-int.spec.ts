import { ArkErrors } from 'arktype';
import { describe, expect, it } from 'vitest';
import { PositiveInt } from './positive-int';

describe('PositiveInt', () => {
    it.each([1, 100, 999_999])('accepts %d', (value) => {
        expect(PositiveInt(value)).toBe(value);
    });

    it.each([0, -1, 1.5])('rejects %d', (value) => {
        expect(PositiveInt(value)).toBeInstanceOf(ArkErrors);
    });
});

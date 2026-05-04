import { ArkErrors } from 'arktype';
import { describe, expect, it } from 'vitest';
import { PositiveNumber } from './positive-number';

describe('PositiveNumber', () => {
    it.each([0.0001, 1, 1.5, 100])('accepts %d', (value) => {
        expect(PositiveNumber(value)).toBe(value);
    });

    it.each([0, -1, -0.0001])('rejects %d', (value) => {
        expect(PositiveNumber(value)).toBeInstanceOf(ArkErrors);
    });
});

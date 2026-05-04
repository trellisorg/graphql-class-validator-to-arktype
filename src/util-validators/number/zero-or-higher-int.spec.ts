import { ArkErrors } from 'arktype';
import { describe, expect, it } from 'vitest';
import { ZeroOrHigherInt } from './zero-or-higher-int';

describe('ZeroOrHigherInt', () => {
    it.each([0, 1, 100])('accepts %d', (value) => {
        expect(ZeroOrHigherInt(value)).toBe(value);
    });

    it.each([-1, 1.5, -0.0001])('rejects %d', (value) => {
        expect(ZeroOrHigherInt(value)).toBeInstanceOf(ArkErrors);
    });
});

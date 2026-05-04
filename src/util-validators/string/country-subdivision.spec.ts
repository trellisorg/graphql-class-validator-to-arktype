import { ArkErrors } from 'arktype';
import { describe, expect, it } from 'vitest';
import { CountrySubdivision } from './country-subdivision';

describe('CountrySubdivision', () => {
    it.each(['BC', 'ON', 'CA', 'WA', 'NSW'])('accepts %s', (value) => {
        expect(CountrySubdivision(value)).toBe(value);
    });

    it.each(['bc', 'B', 'BCDE', 'B1', '12'])('rejects %j', (value) => {
        expect(CountrySubdivision(value)).toBeInstanceOf(ArkErrors);
    });

    it('rejects non-strings', () => {
        expect(CountrySubdivision(undefined)).toBeInstanceOf(ArkErrors);
    });
});

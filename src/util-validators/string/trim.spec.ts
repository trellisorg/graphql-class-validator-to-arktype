import { ArkErrors } from 'arktype';
import { describe, expect, it } from 'vitest';
import { TrimmedString } from './trim';

describe('TrimmedString', () => {
    it.each([
        { expected: 'hello', input: '  hello  ' },
        { expected: 'hello', input: '\thello\n' },
        { expected: 'already-trimmed', input: 'already-trimmed' },
        { expected: '', input: '' },
    ])('trims $input → $expected', ({ input, expected }) => {
        expect(TrimmedString(input)).toBe(expected);
    });

    it('rejects non-strings', () => {
        expect(TrimmedString(null)).toBeInstanceOf(ArkErrors);
        expect(TrimmedString(undefined)).toBeInstanceOf(ArkErrors);
        expect(TrimmedString(42)).toBeInstanceOf(ArkErrors);
    });
});

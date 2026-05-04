import { ArkErrors } from 'arktype';
import { describe, expect, it } from 'vitest';
import { NonEmptyString } from './non-empty-string';

describe('NonEmptyString', () => {
    it.each(['a', 'hello', '   '])('accepts %j', (value) => {
        expect(NonEmptyString(value)).toBe(value);
    });

    it('rejects an empty string', () => {
        const out = NonEmptyString('');
        expect(out).toBeInstanceOf(ArkErrors);
    });

    it('rejects non-strings', () => {
        expect(NonEmptyString(42)).toBeInstanceOf(ArkErrors);
        expect(NonEmptyString(null)).toBeInstanceOf(ArkErrors);
        expect(NonEmptyString(undefined)).toBeInstanceOf(ArkErrors);
    });
});

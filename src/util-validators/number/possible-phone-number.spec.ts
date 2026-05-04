import { ArkErrors } from 'arktype';
import { describe, expect, it } from 'vitest';
import { PossiblePhoneNumber, possiblePhoneNumberFor } from './possible-phone-number';

describe('PossiblePhoneNumber (international-only)', () => {
    it.each(['+12509384519', '+1 250-938-4519', '+1 250 938 4519'])('accepts %s', (value) => {
        expect(PossiblePhoneNumber(value)).toBe(value);
    });

    it.each(['250-938-4519', '2509384519', '250 938 4519', '2509384518123', '250-inv-4519', ''])(
        'rejects %j (no default country)',
        (value) => {
            expect(PossiblePhoneNumber(value)).toBeInstanceOf(ArkErrors);
        }
    );
});

describe('possiblePhoneNumberFor("CA")', () => {
    const PossibleCanadianPhoneNumber = possiblePhoneNumberFor('CA');

    it.each(['250-938-4519', '2509384519', '+12509384519', '250 938 4519', '+1 250-938-4519', '+1 250 938 4519'])(
        'accepts %s',
        (value) => {
            expect(PossibleCanadianPhoneNumber(value)).toBe(value);
        }
    );

    it.each(['2509384518123', '250-inv-4519', ''])('rejects %j', (value) => {
        expect(PossibleCanadianPhoneNumber(value)).toBeInstanceOf(ArkErrors);
    });
});

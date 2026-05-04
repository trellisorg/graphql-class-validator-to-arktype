import { ArkErrors, type } from 'arktype';
import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import {
    CurrencyValue,
    PositiveInt,
    PossiblePhoneNumber,
    RecordOfPositiveInt,
    Timezone,
    TrimmedString,
    UrlOrLocalhost,
    arrayDistinctBy,
    xorOf,
} from './';

// Re-derive the schema from conversion-example.ts without going through
// `createArkInputType` (which registers `@nestjs/graphql` metadata). Keeps the
// Test focused on the validation behaviour, not GraphQL wiring.
const FulfilmentMethod = type("'PICKUP' | 'DELIVERY'");
const TagSchema = type({ id: 'string.uuid', label: TrimmedString });
const CheckoutSchema = type({
    'callbackUrl?': UrlOrLocalhost,
    cartId: 'string.uuid',
    'couponCode?': 'string > 0',
    currencyAmount: CurrencyValue,
    'giftMessage?': 'string > 0',
    method: FulfilmentMethod,
    phone: PossiblePhoneNumber.or('null'),
    selectedAddOns: RecordOfPositiveInt,
    tags: arrayDistinctBy(TagSchema, 'id'),
    timezone: Timezone,
    totalCents: PositiveInt,
}).narrow(xorOf('couponCode', 'giftMessage'));

const validInput = {
    callbackUrl: 'http://localhost:3000/hook',
    cartId: '550e8400-e29b-41d4-a716-446655440000',
    couponCode: 'SAVE10',
    currencyAmount: '$49.99',
    method: 'PICKUP' as const,
    phone: '+12509384519',
    selectedAddOns: { extras: 2, upgrade: 1 },
    tags: [
        { id: '11111111-1111-4111-8111-111111111111', label: '  vip  ' },
        { id: '22222222-2222-4222-8222-222222222222', label: 'gift' },
    ],
    timezone: 'America/Vancouver',
    totalCents: 4999,
};

describe('CheckoutSchema (conversion example)', () => {
    it('accepts a fully-valid input and morphs trim the tag labels', () => {
        const out = CheckoutSchema(validInput);
        expect(out).not.toBeInstanceOf(ArkErrors);
        if (out instanceof ArkErrors) {
            return;
        }
        expect(out.tags[0].label).toBe('vip');
        expect(out.tags[1].label).toBe('gift');
    });

    it('accepts the strict-nullable phone explicitly set to null', () => {
        const out = CheckoutSchema({ ...validInput, phone: null });
        expect(out).not.toBeInstanceOf(ArkErrors);
    });

    it('rejects when phone is undefined (strict-nullable, not strict-optional)', () => {
        const { phone: _drop, ...rest } = validInput;
        const out = CheckoutSchema(rest);
        expect(out).toBeInstanceOf(ArkErrors);
    });

    it('accepts when callbackUrl is omitted (strict-optional)', () => {
        const { callbackUrl: _drop, ...rest } = validInput;
        const out = CheckoutSchema(rest);
        expect(out).not.toBeInstanceOf(ArkErrors);
    });

    it('rejects when both XOR fields are set', () => {
        const out = CheckoutSchema({ ...validInput, giftMessage: 'happy birthday' });
        expect(out).toBeInstanceOf(ArkErrors);
    });

    it('rejects when neither XOR field is set', () => {
        const { couponCode: _drop, ...rest } = validInput;
        const out = CheckoutSchema(rest);
        expect(out).toBeInstanceOf(ArkErrors);
    });

    it('rejects duplicate tag ids', () => {
        const out = CheckoutSchema({
            ...validInput,
            tags: [
                { id: '11111111-1111-4111-8111-111111111111', label: 'a' },
                { id: '11111111-1111-4111-8111-111111111111', label: 'b' },
            ],
        });
        expect(out).toBeInstanceOf(ArkErrors);
    });

    it('rejects an invalid timezone', () => {
        expect(CheckoutSchema({ ...validInput, timezone: 'Mars/Olympus' })).toBeInstanceOf(ArkErrors);
    });

    it('rejects a non-positive totalCents', () => {
        expect(CheckoutSchema({ ...validInput, totalCents: 0 })).toBeInstanceOf(ArkErrors);
    });

    it('rejects a negative selectedAddOns value', () => {
        expect(CheckoutSchema({ ...validInput, selectedAddOns: { x: -1 } })).toBeInstanceOf(ArkErrors);
    });

    it('rejects a malformed currency string', () => {
        expect(CheckoutSchema({ ...validInput, currencyAmount: '49.999' })).toBeInstanceOf(ArkErrors);
    });
});

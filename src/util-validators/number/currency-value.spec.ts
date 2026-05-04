import { ArkErrors } from 'arktype';
import { describe, expect, it } from 'vitest';
import { CurrencyValue, PositiveCurrencyValue } from './currency-value';

describe('CurrencyValue', () => {
    it.each(['$12', '$12.14', '12.42', '0'])('accepts %s', (value) => {
        expect(CurrencyValue(value)).toBe(value);
    });

    it.each(['-1', '12.123', ''])('rejects %j', (value) => {
        expect(CurrencyValue(value)).toBeInstanceOf(ArkErrors);
    });
});

describe('PositiveCurrencyValue', () => {
    it.each(['$12', '$12.14', '12.42'])('accepts %s', (value) => {
        expect(PositiveCurrencyValue(value)).toBe(value);
    });

    it.each(['-1', '12.123', '0', ''])('rejects %j', (value) => {
        expect(PositiveCurrencyValue(value)).toBeInstanceOf(ArkErrors);
    });
});

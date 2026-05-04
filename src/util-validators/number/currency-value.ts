import { type } from 'arktype';

/**
 * Equivalent to the `CURRENCY_REGEX` referenced by `IsCurrencyValue` — accepts an optional `$` followed by one or
 * more digits, with up to two decimal places.
 */
const CURRENCY_REGEX = /^\$?\d+(\.\d{1,2})?$/;

/**
 * Replaces `IsCurrencyValue`. A currency-formatted string (e.g. `$12.34`, `0`, `100.5`).
 */
export const CurrencyValue = type('string').matching(CURRENCY_REGEX);

/**
 * Replaces `IsPositiveCurrencyValue`. Same shape as `CurrencyValue` but the numeric value must be > 0.
 */
export const PositiveCurrencyValue = CurrencyValue.narrow((value, ctx) => {
    const numeric = parseFloat(value.replace(/[^0-9.]/g, ''));
    return numeric > 0 ? true : ctx.mustBe('a positive currency value');
});

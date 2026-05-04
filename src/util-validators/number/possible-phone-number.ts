import { type } from 'arktype';
import type { CountryCode } from 'libphonenumber-js';
import { isPossiblePhoneNumber } from 'libphonenumber-js';

/**
 * Replaces `IsPossiblePhoneNumber`. A string that `libphonenumber-js` considers a _possible_ phone number (cheap
 * plausibility check, not a strict regional-validity check). Same trade-off the original chose.
 *
 * Without a default country only international-format numbers (with `+CC` prefix) are accepted. Use
 * `possiblePhoneNumberFor('CA')` to also accept national-format numbers like `250-938-4519`.
 */
export const PossiblePhoneNumber = type('string').narrow((value, ctx) =>
    isPossiblePhoneNumber(value) ? true : ctx.mustBe('a possible phone number')
);

/**
 * Factory: phone number narrowed against a default country, so national-format numbers (e.g. `250-938-4519` for
 * `'CA'`) are accepted.
 */
export const possiblePhoneNumberFor = (defaultCountry: CountryCode) =>
    type('string').narrow((value, ctx) =>
        isPossiblePhoneNumber(value, defaultCountry)
            ? true
            : ctx.mustBe(`a possible phone number for ${defaultCountry}`)
    );

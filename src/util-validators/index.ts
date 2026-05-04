// String fragments
export { CountrySubdivision } from './string/country-subdivision';
export { NonEmptyString } from './string/non-empty-string';
export { Timezone } from './string/timezone';
export { TrimmedString } from './string/trim';
export { UrlOrLocalhost } from './string/url-or-localhost';

// Number fragments
export { CurrencyValue, PositiveCurrencyValue } from './number/currency-value';
export { Int32 } from './number/int32';
export { PositiveInt } from './number/positive-int';
export { PositiveNumber } from './number/positive-number';
export { PossiblePhoneNumber, possiblePhoneNumberFor } from './number/possible-phone-number';
export { ZeroOrHigherInt } from './number/zero-or-higher-int';

// Object fragments
export { RecordOfNonNegativeInt } from './object/record-of-non-negative-int';
export { RecordOfPositiveInt } from './object/record-of-positive-int';
export { SinglePropertyObject } from './object/single-property-object';

// Array helpers
export { arrayDistinctBy } from './array/array-distinct-by';

// Logical helpers (apply at object level via .narrow())
export { xnorOf } from './logical/xnor';
export { xorOf } from './logical/xor';

import { type } from 'arktype';

/**
 * Replaces the `CountrySubdivisionValidators` bundle (MinLength(2) + MaxLength(3) + IsUppercase + IsNotEmpty +
 * IsString) used for province/state codes.
 *
 * 2 or 3 uppercase ASCII letters.
 */
export const CountrySubdivision = type(/^[A-Z]{2,3}$/);

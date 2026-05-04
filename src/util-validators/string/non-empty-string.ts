import { type } from 'arktype';

/**
 * Replaces `IsString + IsNotEmpty` from class-validator.
 *
 * A string with at least one character. Used as the default constraint for required string fields (graph IDs,
 * names, descriptions, etc).
 *
 * Compose into an object schema:
 *
 * Const Foo = type({ name: NonEmptyString });
 */
export const NonEmptyString = type('string > 0');

import { type } from 'arktype';

/**
 * Replaces `TrimString` (class-transformer @Transform that trims).
 *
 * A morph: validates the value is a string, then returns `value.trim()`. Run via `ArkValidationPipe`, the trimmed
 * value flows through to the resolver.
 */
export const TrimmedString = type('string').pipe((value) => value.trim());

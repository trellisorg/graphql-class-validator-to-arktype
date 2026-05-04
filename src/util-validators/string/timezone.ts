import { type } from 'arktype';

function isValidTimezone(value: string): boolean {
    try {
        new Intl.DateTimeFormat('en-US', { timeZone: value });
        return true;
    } catch {
        return false;
    }
}

/**
 * Replaces `IsTimezone`. A string narrowed by `Intl.DateTimeFormat` (the same underlying check the original
 * validator used via `Date.toLocaleString`).
 */
export const Timezone = type('string').narrow((value, ctx) =>
    isValidTimezone(value) ? true : ctx.mustBe('a valid IANA timezone')
);

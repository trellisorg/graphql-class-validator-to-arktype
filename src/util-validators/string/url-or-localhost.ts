import { type } from 'arktype';

const LOCALHOST_URL = /^https?:\/\/localhost(:\d+)?(\/.*)?$/;

function hasTld(value: string): boolean {
    try {
        const { hostname } = new URL(value);
        return hostname.includes('.');
    } catch {
        return false;
    }
}

/**
 * Replaces `IsUrlOrLocalhost`. Accepts a URL with a TLD OR `http(s)://localhost[:port][/path]`.
 *
 * Mirrors class-validator's `isURL` default (`require_tld: true`) plus the localhost escape hatch. Arktype's bare
 * `string.url` is looser — it accepts single-token hostnames like `https://trellis` — so we narrow it.
 */
export const UrlOrLocalhost = type('string.url')
    .narrow((value, ctx) => (hasTld(value) ? true : ctx.mustBe('a URL with a TLD')))
    .or(type('string').matching(LOCALHOST_URL));

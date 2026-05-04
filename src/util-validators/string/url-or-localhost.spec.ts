import { ArkErrors } from 'arktype';
import { describe, expect, it } from 'vitest';
import { UrlOrLocalhost } from './url-or-localhost';

describe('UrlOrLocalhost', () => {
    it.each([
        'https://trellis.org',
        'https://trellis.org/path',
        'http://example.com:8080/x?y=1',
        'http://localhost',
        'http://localhost:3000',
        'http://localhost:3000/test',
        'http://localhost/test',
        'https://localhost',
        'https://localhost:3000',
        'https://localhost:3000/test',
        'https://localhost/test',
    ])('accepts %s', (value) => {
        expect(UrlOrLocalhost(value)).toBe(value);
    });

    it.each(['https://trellis', 'not a url', '', 'localhost', 'http://'])('rejects %j', (value) => {
        expect(UrlOrLocalhost(value)).toBeInstanceOf(ArkErrors);
    });
});

import { ArkErrors } from 'arktype';
import { describe, expect, it } from 'vitest';
import { Timezone } from './timezone';

describe('Timezone', () => {
    it.each(['America/Vancouver', 'UTC', 'Europe/London', 'Asia/Tokyo'])('accepts %s', (value) => {
        expect(Timezone(value)).toBe(value);
    });

    it.each(['America/Vancouv', 'NotARegion/Place', '', 'random'])('rejects %j', (value) => {
        expect(Timezone(value)).toBeInstanceOf(ArkErrors);
    });
});

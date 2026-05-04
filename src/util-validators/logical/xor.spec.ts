import { ArkErrors, type } from 'arktype';
import { describe, expect, it } from 'vitest';
import { xorOf } from './xor';

describe('xorOf', () => {
    const Schema = type({
        'bar?': 'string',
        'foo?': 'string',
    }).narrow(xorOf('foo', 'bar'));

    it('accepts when only foo is set', () => {
        expect(Schema({ foo: 'x' })).toEqual({ foo: 'x' });
    });

    it('accepts when only bar is set', () => {
        expect(Schema({ bar: 'y' })).toEqual({ bar: 'y' });
    });

    it('rejects when both are set', () => {
        expect(Schema({ bar: 'y', foo: 'x' })).toBeInstanceOf(ArkErrors);
    });

    it('rejects when neither is set', () => {
        expect(Schema({})).toBeInstanceOf(ArkErrors);
    });
});

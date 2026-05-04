import { ArkErrors, type } from 'arktype';
import { describe, expect, it } from 'vitest';
import { xnorOf } from './xnor';

describe('xnorOf', () => {
    const Schema = type({
        'bar?': 'string',
        'foo?': 'string',
    }).narrow(xnorOf('foo', 'bar'));

    it('accepts when both are set', () => {
        expect(Schema({ bar: 'y', foo: 'x' })).toEqual({ bar: 'y', foo: 'x' });
    });

    it('accepts when neither is set', () => {
        expect(Schema({})).toEqual({});
    });

    it('rejects when only foo is set', () => {
        expect(Schema({ foo: 'x' })).toBeInstanceOf(ArkErrors);
    });

    it('rejects when only bar is set', () => {
        expect(Schema({ bar: 'y' })).toBeInstanceOf(ArkErrors);
    });
});

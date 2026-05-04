import type { ArgumentMetadata } from '@nestjs/common';
import { BadRequestException } from '@nestjs/common';
import { type } from 'arktype';
import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { createArkInputType } from './ark-input-type';
import { ArkValidationPipe } from './ark-validation.pipe';

type Metatype = ArgumentMetadata['metatype'];

/**
 * Build a tiny `ArgumentMetadata` fixture for the pipe transform call. The `metatype` parameter is typed against
 * Nest's own field rather than `unknown` so callers can't smuggle in non-class values.
 */
const meta = (metatype: Metatype): ArgumentMetadata => ({
    metatype,
    type: 'body',
});

describe('ArkValidationPipe', () => {
    const PaymentSchema = type({
        amountCents: 'number.integer > 0',
        currency: 'string == 3',
    });
    const PaymentInput = createArkInputType(PaymentSchema, { name: 'PaymentInputUnique1' });

    const pipe = new ArkValidationPipe();

    it('returns the morphed value when validation passes', () => {
        const out = pipe.transform({ amountCents: 4999, currency: 'USD' }, meta(PaymentInput));
        expect(out).toEqual({ amountCents: 4999, currency: 'USD' });
    });

    it('throws BadRequestException with a summary when validation fails', () => {
        expect(() => pipe.transform({ amountCents: 0, currency: 'USD' }, meta(PaymentInput))).toThrow(
            BadRequestException
        );
    });

    it('passes the value through unchanged when no metatype is supplied', () => {
        const value = { anything: true };
        expect(pipe.transform(value, meta(undefined))).toBe(value);
    });

    it('passes the value through unchanged when the metatype has no attached schema', () => {
        class PlainDto {}
        const value = { foo: 'bar' };
        expect(pipe.transform(value, meta(PlainDto))).toBe(value);
    });
});

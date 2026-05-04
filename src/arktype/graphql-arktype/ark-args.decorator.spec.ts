import { type } from 'arktype';
import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { ArkArgs } from './ark-args.decorator';
import { createArkInputType } from './ark-input-type';

describe('ArkArgs', () => {
    const InputSchema = type({ value: 'string > 0' });
    const Input = createArkInputType(InputSchema, { name: 'ArkArgsInputUnique1' });

    it('patches design:paramtypes to point at the supplied input class', () => {
        class Resolver {
            // Stand-in for a method whose first arg is typed as `any` so TS emits
            // `Object` for design:paramtypes — the case ArkArgs exists to fix.
            myMutation(_input: unknown): boolean {
                return true;
            }
        }

        ArkArgs('input', Input)(Resolver.prototype, 'myMutation', 0);

        const paramtypes: unknown[] =
            Reflect.getMetadata('design:paramtypes', Resolver.prototype, 'myMutation') ?? [];
        expect(paramtypes[0]).toBe(Input);
    });
});

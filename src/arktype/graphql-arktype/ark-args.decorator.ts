import { Args } from '@nestjs/graphql';
import 'reflect-metadata';

/**
 * Drop-in replacement for `@Args(name, { type: () => InputClass })` that ALSO sets the parameter's
 * `design:paramtypes` metadata to the input class.
 *
 * Why: when an InputType class is created programmatically (e.g. via `createArkInputType`), its TypeScript type
 * ends up as `new () => Shape` rather than a class declaration. Using such a value as a parameter type annotation
 * makes the TS compiler emit `Object` for `design:paramtypes`, which means downstream pipes see `metatype ===
 * Object` and can't resolve the per-class ArkType schema. Patching the metadata explicitly fixes it.
 */
export function ArkArgs(name: string, inputClass: NewableFunction): ParameterDecorator {
    const argsDecorator = Args(name, { type: () => inputClass });
    return (target, key, index) => {
        if (key === undefined) {
            return;
        }
        argsDecorator(target, key, index);
        const existing: unknown[] = Reflect.getMetadata('design:paramtypes', target, key) ?? [];
        while (existing.length <= index) {
            existing.push(Object);
        }
        existing[index] = inputClass;
        Reflect.defineMetadata('design:paramtypes', existing, target, key);
    };
}

import 'reflect-metadata';
import { Args } from '@nestjs/graphql';

/**
 * Drop-in replacement for `@Args(name, { type: () => InputClass })` that ALSO
 * sets the parameter's `design:paramtypes` metadata to the input class.
 * See ark-args.decorator.ts for the rationale — same trick.
 */
export function ZodArgs(name: string, inputClass: any): ParameterDecorator {
  const argsDecorator = Args(name, { type: () => inputClass });
  return (target, key, index) => {
    argsDecorator(target, key as string, index);
    if (key === undefined) return;
    const existing: any[] = Reflect.getMetadata('design:paramtypes', target, key) ?? [];
    while (existing.length <= index) existing.push(Object);
    existing[index] = inputClass;
    Reflect.defineMetadata('design:paramtypes', existing, target, key);
  };
}

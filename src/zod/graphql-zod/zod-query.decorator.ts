import { Mutation, Query, type ReturnTypeFunc } from '@nestjs/graphql';
import type { ZodType } from 'zod';
import { zodRegistry } from './core';

export interface ZodOperationOptions {
    name?: string;
    description?: string;
    nullable?: boolean;
    validate?: boolean;
    returnType?: ReturnTypeFunc;
}

export function ZodQuery(returnSchema: ZodType<any, any>, options: ZodOperationOptions = {}): MethodDecorator {
    return makeOpDecorator(Query, returnSchema, options);
}

export function ZodMutation(returnSchema: ZodType<any, any>, options: ZodOperationOptions = {}): MethodDecorator {
    return makeOpDecorator(Mutation, returnSchema, options);
}

function makeOpDecorator(
    factory: typeof Query,
    returnSchema: ZodType<any, any>,
    options: ZodOperationOptions
): MethodDecorator {
    const returnTypeFn: ReturnTypeFunc = options.returnType ?? defaultReturnType(returnSchema);
    const inner = factory(returnTypeFn, {
        description: options.description,
        name: options.name,
        nullable: options.nullable,
    });

    return (target, key, descriptor) => {
        if (options.validate) {
            const original = (descriptor as TypedPropertyDescriptor<any>).value;
            if (typeof original === 'function') {
                const opName = options.name ?? String(key);
                const wrapped = function wrapped(this: any, ...args: any[]) {
                    const result = original.apply(this, args);
                    return result && typeof result.then === 'function'
                        ? result.then((v: unknown) => assertOutput(v, returnSchema, opName))
                        : assertOutput(result, returnSchema, opName);
                };
                (descriptor as TypedPropertyDescriptor<any>).value = wrapped;
                (target as any)[key as any] = wrapped;
            }
        }
        inner(target, key, descriptor as any);
    };
}

function defaultReturnType(schema: ZodType<any, any>): ReturnTypeFunc {
    return () => {
        const cls = zodRegistry.findBySchema(schema);
        if (!cls) {
            throw new Error(
                `@ZodQuery/@ZodMutation: schema is not registered with the GraphQL registry. Pass options.returnType for scalar/array returns or call createZodObjectType(schema) first.`
            );
        }
        return cls;
    };
}

function assertOutput(value: unknown, schema: ZodType<any, any>, opName: string): unknown {
    const result = (schema as any).safeParse(value);
    if (!result.success) {
        throw new Error(
            `${opName} produced an output that failed schema validation: ${JSON.stringify(result.error.issues)}`
        );
    }
    return result.data;
}

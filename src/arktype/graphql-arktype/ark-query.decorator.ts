import { Mutation, Query, Subscription, type ReturnTypeFunc } from '@nestjs/graphql';
import { ArkErrors, type Type as ArkType } from 'arktype';
import { isPromise } from 'es-toolkit';
import { arkRegistry } from './core';

export interface ArkOperationOptions {
    /**
     * GraphQL field name; defaults to the resolver method name.
     */
    name?: string;
    description?: string;
    /**
     * GraphQL field nullability.
     */
    nullable?: boolean;
    /**
     * Set to true to validate the resolver's return value against the supplied schema. Off by default — output
     * validation is a per-call CPU cost that isn't usually worth paying once the inputs are validated.
     */
    validate?: boolean;
    /**
     * Force a specific return type when the schema isn't an object that maps to a registered class (e.g. a scalar
     * query). Same shape as `@Query()`'s arg.
     */
    returnType?: ReturnTypeFunc;
}

/**
 * `@ArkQuery(returnSchema, options)` is a wrapper around `@Query()` that derives the GraphQL return type from a
 * registered ArkType class automatically. If the schema is the one used to create an ObjectType (e.g. via
 * `createArkObjectType`), the registry lookup yields its class. Plain scalar / array returns can be specified via
 * `options.returnType`.
 */
export function ArkQuery(returnSchema: ArkType<any>, options: ArkOperationOptions = {}): MethodDecorator {
    return makeOpDecorator(Query, returnSchema, options);
}

/**
 * Mutation counterpart to {@link ArkQuery}.
 */
export function ArkMutation(returnSchema: ArkType<any>, options: ArkOperationOptions = {}): MethodDecorator {
    return makeOpDecorator(Mutation, returnSchema, options);
}

/**
 * Subscription counterpart to {@link ArkQuery}. The decorated method should return an `AsyncIterator` (typically
 * via `pubsub.asyncIterator(topic)`); NestJS will pass each emitted payload through the resolver pipeline.
 *
 * `options.validate` runs the registered schema against each payload before it leaves the server. Off by default
 * — most subscription pipelines validate at publish time instead.
 */
export function ArkSubscription(returnSchema: ArkType<any>, options: ArkOperationOptions = {}): MethodDecorator {
    return makeOpDecorator(Subscription as typeof Query, returnSchema, options);
}

function makeOpDecorator(
    factory: typeof Query,
    returnSchema: ArkType<any>,
    options: ArkOperationOptions
): MethodDecorator {
    const returnTypeFn: ReturnTypeFunc = options.returnType ?? defaultReturnType(returnSchema);
    const inner = factory(returnTypeFn, {
        description: options.description,
        name: options.name,
        nullable: options.nullable,
    });

    return (target, key, descriptor) => {
        if (options.validate) {
            // Wrap the resolver method BEFORE applying `@Query`/`@Mutation` so
            // NestJS sees the wrapped function as the resolver. We update both
            // The descriptor's `value` slot and the target prototype because
            // Different versions of @nestjs/graphql discover the method via
            // Different paths (descriptor for class methods, prototype lookup
            // When the method is reassigned post-decoration).
            const original = descriptor.value;
            if (typeof original === 'function') {
                const opName = options.name ?? String(key);
                const wrapped = function wrapped(this: unknown, ...args: unknown[]) {
                    const result = original.apply(this, args);
                    return isPromise(result)
                        ? result.then((v) => assertOutput(v, returnSchema, opName))
                        : assertOutput(result, returnSchema, opName);
                };
                // Reflect.set bypasses the descriptor's typed `value` slot —
                // The wrapped function deliberately has a different (broader)
                // Signature than the original method, and we don't want to
                // Widen the slot back to `any` to assign it.
                Reflect.set(descriptor, 'value', wrapped);
                Reflect.set(target, key, wrapped);
            }
        }
        inner(target, key, descriptor);
    };
}

function defaultReturnType(schema: ArkType<any>): ReturnTypeFunc {
    return () => {
        const cls = arkRegistry.findBySchema(schema);
        if (!cls) {
            throw new Error(
                `@ArkQuery/@ArkMutation: schema is not registered with the GraphQL registry. Pass options.returnType for scalar/array returns or call createArkObjectType(schema) first.`
            );
        }
        return cls;
    };
}

function assertOutput(value: unknown, schema: ArkType<any>, opName: string): unknown {
    const out = schema(value);
    if (out instanceof ArkErrors) {
        throw new Error(`${opName} produced an output that failed schema validation: ${out.summary}`);
    }
    return out;
}

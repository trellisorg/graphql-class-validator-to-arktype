import { Mutation, Query, type ReturnTypeFunc } from '@nestjs/graphql';
import { ArkErrors, type Type as ArkType } from 'arktype';
import { arkRegistry } from './core';

export interface ArkOperationOptions {
  /** GraphQL field name; defaults to the resolver method name. */
  name?: string;
  description?: string;
  /** GraphQL field nullability. */
  nullable?: boolean;
  /**
   * Set to true to validate the resolver's return value against the supplied
   * schema. Off by default — output validation is a per-call CPU cost that
   * isn't usually worth paying once the inputs are validated.
   */
  validate?: boolean;
  /**
   * Force a specific return type when the schema isn't an object that maps to
   * a registered class (e.g. a scalar query). Same shape as `@Query()`'s arg.
   */
  returnType?: ReturnTypeFunc;
}

/**
 * `@ArkQuery(returnSchema, options)` is a wrapper around `@Query()` that
 * derives the GraphQL return type from a registered ArkType class
 * automatically. If the schema is the one used to create an ObjectType (e.g.
 * via `createArkObjectType`), the registry lookup yields its class. Plain
 * scalar / array returns can be specified via `options.returnType`.
 */
export function ArkQuery(returnSchema: ArkType<any>, options: ArkOperationOptions = {}): MethodDecorator {
  return makeOpDecorator(Query, returnSchema, options);
}

/** Mutation counterpart to {@link ArkQuery}. */
export function ArkMutation(returnSchema: ArkType<any>, options: ArkOperationOptions = {}): MethodDecorator {
  return makeOpDecorator(Mutation, returnSchema, options);
}

function makeOpDecorator(
  factory: typeof Query,
  returnSchema: ArkType<any>,
  options: ArkOperationOptions,
): MethodDecorator {
  const returnTypeFn: ReturnTypeFunc = options.returnType ?? defaultReturnType(returnSchema);
  const inner = factory(returnTypeFn, {
    name: options.name,
    description: options.description,
    nullable: options.nullable,
  });

  return (target, key, descriptor) => {
    if (options.validate) {
      // Wrap before applying @Mutation/@Query so NestJS sees the wrapped fn.
      // Mutating both the descriptor AND the prototype slot covers whichever
      // path NestJS uses to look up the method at compile time.
      const original = (descriptor as TypedPropertyDescriptor<any>).value;
      if (typeof original === 'function') {
        const opName = options.name ?? String(key);
        const wrapped = function (this: any, ...args: any[]) {
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

function defaultReturnType(schema: ArkType<any>): ReturnTypeFunc {
  return () => {
    const cls = arkRegistry.findBySchema(schema);
    if (!cls) {
      throw new Error(
        `@ArkQuery/@ArkMutation: schema is not registered with the GraphQL registry. Pass options.returnType for scalar/array returns or call createArkObjectType(schema) first.`,
      );
    }
    return cls;
  };
}

function assertOutput(value: unknown, schema: ArkType<any>, opName: string): unknown {
  const out: any = (schema as any)(value);
  if (out instanceof ArkErrors) {
    throw new Error(`${opName} produced an output that failed schema validation: ${out.summary}`);
  }
  return out;
}

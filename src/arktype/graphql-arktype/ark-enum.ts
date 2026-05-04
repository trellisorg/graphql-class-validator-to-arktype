import { registerEnumType } from '@nestjs/graphql';
import { ArkErrors, type Type as ArkType } from 'arktype';

export interface RegisterArkEnumOptions {
  name: string;
  description?: string;
  /** Per-value descriptions; key matches the enum value. */
  valuesMap?: Record<string, { description?: string; deprecationReason?: string }>;
}

/**
 * Turn an ArkType string-literal union (e.g. `type("'DRAFT' | 'PUBLISHED'")`)
 * into a registered GraphQL enum AND return both the runtime values map and
 * the schema for downstream validation.
 *
 * @example
 *   const OrderStatusSchema = type("'PENDING' | 'PAID' | 'SHIPPED'");
 *   export const OrderStatus = registerArkEnum(OrderStatusSchema, { name: 'OrderStatus' });
 *
 *   // In an InputType:
 *   fields: { status: () => OrderStatus.gqlEnumRef }
 */
export function registerArkEnum<T extends ArkType<any>>(
  schema: T,
  options: RegisterArkEnumOptions,
): {
  schema: T;
  values: T['infer'][];
  /** The plain enum object passed to `registerEnumType` — pass via `{ type: () => ... }`. */
  gqlEnumRef: Record<string, T['infer']>;
  name: string;
} {
  const json = (schema as any).toJsonSchema();
  const literalValues = extractLiterals(json);
  if (literalValues.length === 0) {
    throw new Error(
      `registerArkEnum("${options.name}"): could not extract a finite set of string literals from the schema`,
    );
  }

  const enumObject: Record<string, any> = {};
  for (const v of literalValues) {
    if (typeof v !== 'string') {
      throw new Error(
        `registerArkEnum("${options.name}"): only string-literal unions are supported (got ${typeof v})`,
      );
    }
    enumObject[v] = v;
  }

  registerEnumType(enumObject, {
    name: options.name,
    description: options.description,
    valuesMap: options.valuesMap,
  });

  return {
    schema,
    values: literalValues as T['infer'][],
    gqlEnumRef: enumObject as Record<string, T['infer']>,
    name: options.name,
  };
}

function extractLiterals(json: any): unknown[] {
  if (!json) return [];
  if (Array.isArray(json.enum)) return [...json.enum];
  // ArkType may emit anyOf with `{const: 'A'}` branches.
  if (Array.isArray(json.anyOf)) {
    const consts: unknown[] = [];
    for (const branch of json.anyOf) {
      if (branch && 'const' in branch) consts.push(branch.const);
      else if (Array.isArray(branch?.enum)) consts.push(...branch.enum);
      else return [];
    }
    return consts;
  }
  return [];
}

/**
 * Validate a single enum value at runtime. Useful when an enum field is
 * passed as an argument and you've already extracted it from the parent
 * input — `ArkValidationPipe` handles the InputType-level case automatically.
 */
export function validateArkEnum<T>(schema: ArkType<T>, value: unknown): T {
  const out: any = (schema as any)(value);
  if (out instanceof ArkErrors) {
    throw new Error(out.summary);
  }
  return out;
}

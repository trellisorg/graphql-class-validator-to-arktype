import 'reflect-metadata';
import { Field, Float, InputType, Int } from '@nestjs/graphql';
import { z, ZodType } from 'zod';

export const ZOD_SCHEMA_METADATA = Symbol('zod:schema');

type GqlTypeFn = () => any;
type FieldOverride = GqlTypeFn | { type: GqlTypeFn; nullable?: boolean };
type FieldOverrides = Record<string, FieldOverride>;

export interface CreateZodInputTypeOptions {
  name: string;
  /**
   * Override GraphQL field types for properties whose nested type can't be
   * inferred from JSON schema alone (objects and arrays of objects).
   */
  fields?: FieldOverrides;
}

export function createZodInputType<T extends ZodType<any, any>>(
  schema: T,
  options: CreateZodInputTypeOptions,
): new () => z.infer<T> {
  const json = z.toJSONSchema(schema, { unrepresentable: 'any' }) as any;
  if (!json || json.type !== 'object' || !json.properties) {
    throw new Error(`createZodInputType: schema for "${options.name}" did not produce an object JSON schema`);
  }

  const requiredSet = new Set<string>(Array.isArray(json.required) ? json.required : []);
  const fieldOverrides = options.fields ?? {};

  const Cls: any = class {};
  Object.defineProperty(Cls, 'name', { value: options.name });

  for (const [propName, propSchema] of Object.entries<any>(json.properties)) {
    const nullable = !requiredSet.has(propName);
    const override = fieldOverrides[propName];

    let gqlType: GqlTypeFn;
    let extraNullable = nullable;
    if (override) {
      if (typeof override === 'function') {
        gqlType = override;
      } else {
        gqlType = override.type;
        extraNullable = override.nullable ?? nullable;
      }
    } else {
      gqlType = jsonToGqlType(propSchema, propName, options.name);
    }

    Field(gqlType, { nullable: extraNullable })(Cls.prototype, propName);
  }

  InputType(options.name)(Cls);

  Reflect.defineMetadata(ZOD_SCHEMA_METADATA, schema, Cls);

  return Cls;
}

export function getZodSchema(target: Function): ZodType<any, any> | undefined {
  return Reflect.getMetadata(ZOD_SCHEMA_METADATA, target);
}

function jsonToGqlType(propSchema: any, propName: string, ownerName: string): GqlTypeFn {
  if (!propSchema || typeof propSchema !== 'object') {
    throw new Error(`createZodInputType: property "${ownerName}.${propName}" has no schema`);
  }
  switch (propSchema.type) {
    case 'string':
      return () => String;
    case 'boolean':
      return () => Boolean;
    case 'integer':
      return () => Int;
    case 'number':
      return () => Float;
    case 'array': {
      const items = propSchema.items;
      if (!items) {
        throw new Error(`array property "${ownerName}.${propName}" needs items schema or a fields override`);
      }
      if (items.type === 'object') {
        throw new Error(
          `array of object property "${ownerName}.${propName}" must be supplied via the fields override map`,
        );
      }
      const innerFn = jsonToGqlType(items, propName + '[]', ownerName);
      return () => [innerFn()];
    }
    case 'object':
      throw new Error(
        `object property "${ownerName}.${propName}" must be supplied via the fields override map`,
      );
    default:
      throw new Error(
        `createZodInputType: unsupported JSON schema type "${propSchema.type}" for "${ownerName}.${propName}"`,
      );
  }
}

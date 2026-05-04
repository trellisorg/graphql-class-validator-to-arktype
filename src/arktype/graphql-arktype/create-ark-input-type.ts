import 'reflect-metadata';
import { Field, InputType, Int, Float } from '@nestjs/graphql';
import type { Type as ArkType } from 'arktype';

export const ARK_SCHEMA_METADATA = Symbol('ark:schema');

type GqlTypeFn = () => any;
type FieldOverride = GqlTypeFn | { type: GqlTypeFn; nullable?: boolean };
type FieldOverrides = Record<string, FieldOverride>;

export interface CreateArkInputTypeOptions {
  name: string;
  /**
   * Override GraphQL field types for properties whose type can't be inferred
   * from JSON schema alone (notably nested object/array-of-object fields).
   * The factory uses this map first; otherwise it derives the GraphQL type
   * from the ArkType-generated JSON schema.
   */
  fields?: FieldOverrides;
}

export function createArkInputType<T extends ArkType<any>>(
  schema: T,
  options: CreateArkInputTypeOptions,
): new () => T['infer'] {
  const json = schema.toJsonSchema() as any;
  if (!json || json.type !== 'object' || !json.properties) {
    throw new Error(`createArkInputType: schema for "${options.name}" did not produce an object JSON schema`);
  }

  const requiredSet = new Set<string>(Array.isArray(json.required) ? json.required : []);
  const fieldOverrides = options.fields ?? {};

  // Anonymous class with the supplied name. Properties get @Field decorators
  // applied below; @InputType() registers the class with @nestjs/graphql.
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

  // Decorate the class as an InputType.
  InputType(options.name)(Cls);

  // Attach the ArkType schema for later use by ArkValidationPipe.
  Reflect.defineMetadata(ARK_SCHEMA_METADATA, schema, Cls);

  return Cls;
}

export function getArkSchema(target: Function): ArkType<any> | undefined {
  return Reflect.getMetadata(ARK_SCHEMA_METADATA, target);
}

function jsonToGqlType(propSchema: any, propName: string, ownerName: string): GqlTypeFn {
  if (!propSchema || typeof propSchema !== 'object') {
    throw new Error(`createArkInputType: property "${ownerName}.${propName}" has no schema`);
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
        `createArkInputType: unsupported JSON schema type "${propSchema.type}" for "${ownerName}.${propName}"`,
      );
  }
}

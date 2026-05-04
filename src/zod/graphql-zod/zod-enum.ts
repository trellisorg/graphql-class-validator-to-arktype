import { registerEnumType } from '@nestjs/graphql';
import { type ZodType, z } from 'zod';

export interface RegisterZodEnumOptions {
    name: string;
    description?: string;
    valuesMap?: Record<string, { description?: string; deprecationReason?: string }>;
}

export function registerZodEnum<T extends ZodType<any, any>>(
    schema: T,
    options: RegisterZodEnumOptions
): {
    schema: T;
    values: T['_output'][];
    gqlEnumRef: Record<string, T['_output']>;
    name: string;
} {
    const json = z.toJSONSchema(schema) as any;
    const literalValues = extractLiterals(json);
    if (literalValues.length === 0) {
        throw new Error(
            `registerZodEnum("${options.name}"): could not extract a finite set of string literals from the schema`
        );
    }

    const enumObject: Record<string, any> = {};
    for (const v of literalValues) {
        if (typeof v !== 'string') {
            throw new Error(
                `registerZodEnum("${options.name}"): only string-literal unions are supported (got ${typeof v})`
            );
        }
        enumObject[v] = v;
    }

    registerEnumType(enumObject, {
        description: options.description,
        name: options.name,
        valuesMap: options.valuesMap,
    });

    return {
        gqlEnumRef: enumObject as Record<string, T['_output']>,
        name: options.name,
        schema,
        values: literalValues as T['_output'][],
    };
}

function extractLiterals(json: any): unknown[] {
    if (!json) {
        return [];
    }
    if (Array.isArray(json.enum)) {
        return [...json.enum];
    }
    if (Array.isArray(json.anyOf)) {
        const consts: unknown[] = [];
        for (const branch of json.anyOf) {
            if (branch && 'const' in branch) {
                consts.push(branch.const);
            } else if (Array.isArray(branch?.enum)) {
                consts.push(...branch.enum);
            } else {
                return [];
            }
        }
        return consts;
    }
    return [];
}

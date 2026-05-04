import type { ArgumentMetadata, PipeTransform } from '@nestjs/common';
import { BadRequestException, Injectable } from '@nestjs/common';
import { getZodSchema } from './core';

@Injectable()
export class ZodValidationPipe implements PipeTransform {
    transform(value: unknown, metadata: ArgumentMetadata): unknown {
        const target = metadata.metatype as Function | undefined;
        if (!target) {
            return value;
        }
        const schema = getZodSchema(target);
        if (!schema) {
            return value;
        }

        const result = schema.safeParse(value);
        if (!result.success) {
            throw new BadRequestException({ errors: result.error.issues, message: 'Validation failed' });
        }
        return result.data;
    }
}

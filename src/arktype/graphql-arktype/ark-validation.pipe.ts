import type { ArgumentMetadata, PipeTransform } from '@nestjs/common';
import { BadRequestException, Injectable } from '@nestjs/common';
import { ArkErrors } from 'arktype';
import { getArkSchema } from './core';

@Injectable()
export class ArkValidationPipe implements PipeTransform {
    transform(value: unknown, metadata: ArgumentMetadata): unknown {
        // `metadata.metatype` is a class constructor when set (Nest types it as
        // `Type<unknown>`). The runtime guard narrows out the `undefined` slot
        // And any non-class metatypes Nest may pass through.
        const target = metadata.metatype;
        if (typeof target !== 'function') {
            return value;
        }
        const schema = getArkSchema(target);
        if (!schema) {
            return value;
        }

        const out = schema(value);
        if (out instanceof ArkErrors) {
            throw new BadRequestException({ errors: out.summary, message: 'Validation failed' });
        }
        return out;
    }
}

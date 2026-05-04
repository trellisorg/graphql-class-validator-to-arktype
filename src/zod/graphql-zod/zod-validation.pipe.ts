import { ArgumentMetadata, BadRequestException, Injectable, PipeTransform } from '@nestjs/common';
import { getZodSchema } from './create-zod-input-type';

@Injectable()
export class ZodValidationPipe implements PipeTransform {
  transform(value: unknown, metadata: ArgumentMetadata): unknown {
    const target = metadata.metatype as Function | undefined;
    if (!target) return value;
    const schema = getZodSchema(target);
    if (!schema) return value;

    const result = schema.safeParse(value);
    if (!result.success) {
      throw new BadRequestException({ message: 'Validation failed', errors: result.error.issues });
    }
    return result.data;
  }
}

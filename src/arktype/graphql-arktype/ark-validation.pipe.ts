import { ArgumentMetadata, BadRequestException, Injectable, PipeTransform } from '@nestjs/common';
import { ArkErrors } from 'arktype';
import { getArkSchema } from './create-ark-input-type';

@Injectable()
export class ArkValidationPipe implements PipeTransform {
  transform(value: unknown, metadata: ArgumentMetadata): unknown {
    const target = metadata.metatype as Function | undefined;
    if (!target) return value;
    const schema = getArkSchema(target);
    if (!schema) return value;

    const out = (schema as any)(value);
    if (out instanceof ArkErrors) {
      throw new BadRequestException({ message: 'Validation failed', errors: out.summary });
    }
    return out;
  }
}

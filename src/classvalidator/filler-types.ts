// Inflates the global class-validator metadata storage so the per-call walk
// has realistic work to do. Aurora ships hundreds of decorated input types;
// validation cost grows with per-class metadata count and inheritance depth.

import { Field, InputType, Int } from '@nestjs/graphql';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  Min,
} from 'class-validator';

const FILLER_CLASS_COUNT = 80;
const FIELDS_PER_CLASS = 12;

export const FILLER_CLASSES: any[] = [];

for (let c = 0; c < FILLER_CLASS_COUNT; c++) {
  // Define a class with FIELDS_PER_CLASS validated properties.
  class FillerType {}
  Object.defineProperty(FillerType, 'name', { value: `FillerType${c}` });

  for (let f = 0; f < FIELDS_PER_CLASS; f++) {
    const propName = `field${f}`;
    // Shape rotates so each class has a mix of validators.
    const shape = (c + f) % 4;
    if (shape === 0) {
      Field(() => String)(FillerType.prototype, propName);
      IsString()(FillerType.prototype, propName);
      Length(1, 256)(FillerType.prototype, propName);
    } else if (shape === 1) {
      Field(() => Int)(FillerType.prototype, propName);
      IsInt()(FillerType.prototype, propName);
      Min(0)(FillerType.prototype, propName);
      Max(1_000_000)(FillerType.prototype, propName);
    } else if (shape === 2) {
      Field(() => String, { nullable: true })(FillerType.prototype, propName);
      IsOptional()(FillerType.prototype, propName);
      IsUUID('4')(FillerType.prototype, propName);
    } else {
      Field(() => Boolean, { nullable: true })(FillerType.prototype, propName);
      IsOptional()(FillerType.prototype, propName);
      IsBoolean()(FillerType.prototype, propName);
    }
  }
  InputType(`FillerType${c}`)(FillerType);
  FILLER_CLASSES.push(FillerType);
}

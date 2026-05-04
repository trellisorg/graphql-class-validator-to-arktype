// Mirror the class-validator/arktype filler footprints: same number of
// @InputType classes registered globally with the same field counts. Zod has
// no global registry walked at validation time, so this only affects schema
// build cost.

import { z } from 'zod';
import { createZodInputType } from './graphql-zod';

const FILLER_CLASS_COUNT = 80;
const FIELDS_PER_CLASS = 12;

export const FILLER_CLASSES: any[] = [];

for (let c = 0; c < FILLER_CLASS_COUNT; c++) {
  const shape: Record<string, any> = {};
  for (let f = 0; f < FIELDS_PER_CLASS; f++) {
    const propName = `field${f}`;
    const variant = (c + f) % 4;
    if (variant === 0) {
      shape[propName] = z.string().min(1).max(256);
    } else if (variant === 1) {
      shape[propName] = z.number().int().min(0).max(1_000_000);
    } else if (variant === 2) {
      shape[propName] = z.uuid().optional();
    } else {
      shape[propName] = z.boolean().optional();
    }
  }
  const schema = z.object(shape);
  const Cls = createZodInputType(schema, { name: `FillerType${c}` });
  FILLER_CLASSES.push(Cls);
}

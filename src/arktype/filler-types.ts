// Mirror the class-validator filler footprint: same number of @InputType
// Classes registered globally with the same field counts. ArkType has no
// global registry at validation time so this only affects schema build cost.

import { type } from 'arktype';
import { createArkInputType } from './graphql-arktype';

const FILLER_CLASS_COUNT = 80;
const FIELDS_PER_CLASS = 12;

export const FILLER_CLASSES: any[] = [];

for (let c = 0; c < FILLER_CLASS_COUNT; c++) {
    const props: Record<string, string> = {};
    for (let f = 0; f < FIELDS_PER_CLASS; f++) {
        const propName = `field${f}`;
        const shape = (c + f) % 4;
        if (shape === 0) {
            props[propName] = '1 <= string <= 256';
        } else if (shape === 1) {
            props[propName] = '0 <= number.integer <= 1000000';
        } else if (shape === 2) {
            props[`${propName}?`] = 'string.uuid.v4';
        } else {
            props[`${propName}?`] = 'boolean';
        }
    }
    const schema = type(props);
    const Cls = createArkInputType(schema as any, { name: `FillerType${c}` });
    FILLER_CLASSES.push(Cls);
}

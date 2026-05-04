// Type factories
export { createArkArgsType, type CreateArkArgsTypeOptions } from './ark-args-type';
export { createArkInputType, type CreateArkInputTypeOptions } from './ark-input-type';
export { createArkObjectType, type CreateArkObjectTypeOptions } from './ark-object-type';

// Enum support
export { registerArkEnum, validateArkEnum, type RegisterArkEnumOptions } from './ark-enum';

// Type helpers (NestJS PartialType / PickType / OmitType / IntersectionType analogues)
export { arkIntersection, arkOmit, arkPartial, arkPick, arkRequired } from './ark-type-helpers';

// Field-override helpers (force properties to GraphQL ID for prefixed/non-uuid ids)
export { arkId, arkIdArray, arkIdFields } from './ark-field-helpers';

// Resolver-side decorators and pipe
export { ArkArgs } from './ark-args.decorator';
export { ArkMutation, ArkQuery, type ArkOperationOptions } from './ark-query.decorator';
export { ArkValidationPipe } from './ark-validation.pipe';

// Core (low-level access for advanced users / library extension)
export {
    ARK_KIND_METADATA,
    ARK_SCHEMA_METADATA,
    ARK_VALIDATE_OUTPUT_METADATA,
    arkRegistry,
    getArkKind,
    getArkSchema,
    setArkSchema,
    type ArkClassKind,
    type FieldOverrides,
    type FieldRef,
    type ResolveOptions,
    type ResolvedField,
} from './core';

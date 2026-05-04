import {
    ArgsType,
    Field,
    InputType,
    Int,
    ObjectType,
    OmitType,
    PartialType,
    PickType,
    registerEnumType,
} from '@nestjs/graphql';
import {
    ArrayMaxSize,
    ArrayMinSize,
    IsEnum,
    IsInt,
    IsOptional,
    IsString,
    IsUUID,
    Length,
    Max,
    Min,
} from 'class-validator';

// ---- Enums ---------------------------------------------------------------

export enum OrderStatus {
    PENDING = 'PENDING',
    PAID = 'PAID',
    SHIPPED = 'SHIPPED',
    CANCELLED = 'CANCELLED',
}

registerEnumType(OrderStatus, {
    description: 'Status of a customer order through fulfilment.',
    name: 'OrderStatus',
    valuesMap: {
        CANCELLED: { description: 'Cancelled by user or system' },
        PAID: { description: 'Payment captured, ready to ship' },
        PENDING: { description: 'Awaiting payment' },
        SHIPPED: { description: 'Handed off to the carrier' },
    },
});

// ---- Object (output) types ----------------------------------------------

@ObjectType({ description: 'A book author.' })
export class Author {
    @Field()
    id!: string;

    @Field()
    name!: string;
}

@ObjectType({ description: 'A book in the catalog.' })
export class Book {
    @Field()
    id!: string;

    @Field()
    title!: string;

    @Field(() => Int)
    publishedYear!: number;

    @Field(() => Author)
    author!: Author;
}

@ObjectType()
export class Order {
    @Field()
    id!: string;

    @Field(() => [String])
    bookIds!: string[];

    @Field(() => OrderStatus)
    status!: OrderStatus;

    @Field()
    notes!: string;

    @Field(() => Int)
    totalCents!: number;
}

// ---- Input types --------------------------------------------------------

@InputType({ description: 'Payload to create a new book.' })
export class CreateBookInput {
    @Field()
    @IsString()
    @Length(1, 512)
    title!: string;

    @Field(() => Int)
    @IsInt()
    @Min(1500)
    @Max(3000)
    publishedYear!: number;

    @Field()
    @IsUUID('4')
    authorId!: string;
}

@InputType()
export class PlaceOrderInput {
    @Field(() => [String])
    @IsUUID('4', { each: true })
    @ArrayMinSize(1)
    @ArrayMaxSize(50)
    bookIds!: string[];

    @Field(() => OrderStatus)
    @IsEnum(OrderStatus)
    status!: OrderStatus;

    @Field()
    @IsString()
    @Length(0, 1000)
    notes!: string;
}

// ---- Type helpers (NestJS native) ---------------------------------------

@InputType({ description: 'Patch payload — every field is optional.' })
export class UpdateBookInput extends PartialType(CreateBookInput) {}

@ObjectType({ description: 'Listing-page projection of Book.' })
export class BookSummary extends PickType(Book, ['id', 'title'] as const, ObjectType) {}

@ObjectType()
export class PublicAuthor extends OmitType(Author, ['id'] as const, ObjectType) {}

// ---- Args types ---------------------------------------------------------

@ArgsType()
export class ListBooksArgs {
    @Field(() => Int, { nullable: true })
    @IsOptional()
    @IsInt()
    @Min(1)
    @Max(100)
    limit?: number;

    @Field(() => Int, { nullable: true })
    @IsOptional()
    @IsInt()
    @Min(0)
    offset?: number;

    @Field(() => OrderStatus, { nullable: true })
    @IsOptional()
    @IsEnum(OrderStatus)
    status?: OrderStatus;
}

import { Field, InputType, Int, ObjectType } from '@nestjs/graphql';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsInt,
  IsNotEmpty,
  IsPositive,
  IsString,
  IsUUID,
  Length,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

@InputType()
export class TagInput {
  @Field()
  @IsUUID('4')
  tagId!: string;

  @Field()
  @IsString()
  @Length(1, 64)
  name!: string;
}

@InputType()
export class SponsorInput {
  @Field()
  @IsUUID('4')
  sponsorId!: string;

  @Field(() => Int)
  @IsInt()
  @Min(1)
  @Max(1_000_000)
  weight!: number;

  @Field()
  @IsString()
  @Length(1, 128)
  label!: string;
}

@InputType()
export class CartItemInput {
  @Field()
  @IsUUID('4')
  itemId!: string;

  @Field(() => Int)
  @IsInt()
  @IsPositive()
  @Max(10_000)
  quantity!: number;

  @Field(() => Int)
  @IsInt()
  @Min(0)
  @Max(100_000_00)
  unitPriceCents!: number;

  @Field()
  @IsString()
  @Length(0, 1000)
  notes!: string;

  @Field(() => [TagInput])
  @ValidateNested({ each: true })
  @ArrayMinSize(0)
  @ArrayMaxSize(64)
  @Type(() => TagInput)
  tags!: TagInput[];

  @Field(() => [SponsorInput])
  @ValidateNested({ each: true })
  @ArrayMinSize(0)
  @ArrayMaxSize(64)
  @Type(() => SponsorInput)
  sponsors!: SponsorInput[];
}

@InputType()
export class CartSummaryInput {
  @Field()
  @IsUUID('4')
  cartId!: string;

  @Field()
  @IsUUID('4')
  userId!: string;

  @Field()
  @IsString()
  @Length(3, 3)
  currency!: string;

  @Field()
  @IsString()
  @IsNotEmpty()
  channel!: string;

  @Field(() => [CartItemInput])
  @ValidateNested({ each: true })
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @Type(() => CartItemInput)
  items!: CartItemInput[];
}

@ObjectType()
export class CartSummaryResult {
  @Field(() => Int)
  itemCount!: number;

  @Field(() => Int)
  totalCents!: number;

  @Field()
  cartId!: string;
}

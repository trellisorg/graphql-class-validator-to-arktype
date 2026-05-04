import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Module } from '@nestjs/common';
import { GraphQLModule } from '@nestjs/graphql';
import { ApolloDriver, ApolloDriverConfig } from '@nestjs/apollo';
import { ApolloServerPluginLandingPageDisabled } from '@apollo/server/plugin/disabled';
import { CartResolver } from './resolver';
import { ArkValidationPipe } from './graphql-arktype';
import { FILLER_CLASSES } from './filler-types';
import {
  CartItemInput,
  CartSummaryInput,
  CartSummaryResult,
  SponsorInput,
  TagInput,
} from './dtos';

@Module({
  imports: [
    GraphQLModule.forRoot<ApolloDriverConfig>({
      driver: ApolloDriver,
      autoSchemaFile: true,
      introspection: false,
      playground: false,
      plugins: [ApolloServerPluginLandingPageDisabled()],
      buildSchemaOptions: {
        orphanedTypes: [
          ...FILLER_CLASSES,
          TagInput,
          SponsorInput,
          CartItemInput,
          CartSummaryInput,
          CartSummaryResult,
        ],
      },
    }),
  ],
  providers: [CartResolver],
})
class AppModule {}

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: process.env.NEST_LOG === '1' ? ['error', 'warn', 'log'] : false,
    bodyParser: false,
  });
  const express = (await import('express')).default;
  app.use(express.json({ limit: '10mb' }));
  app.useGlobalPipes(new ArkValidationPipe());
  const port = Number(process.env.PORT ?? 3002);
  await app.listen(port);
  console.log(`[arktype] listening on http://localhost:${port}/graphql`);
}

bootstrap().catch((e) => {
  console.error(e);
  process.exit(1);
});

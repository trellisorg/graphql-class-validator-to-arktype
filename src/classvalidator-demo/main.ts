import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Module, ValidationPipe } from '@nestjs/common';
import { GraphQLModule } from '@nestjs/graphql';
import { ApolloDriver, ApolloDriverConfig } from '@nestjs/apollo';
import { ApolloServerPluginLandingPageDisabled } from '@apollo/server/plugin/disabled';
import { DemoResolver } from './resolver';
import {
  Author,
  Book,
  BookSummary,
  CreateBookInput,
  ListBooksArgs,
  Order,
  PlaceOrderInput,
  PublicAuthor,
  UpdateBookInput,
} from './dtos';

@Module({
  imports: [
    GraphQLModule.forRoot<ApolloDriverConfig>({
      driver: ApolloDriver,
      autoSchemaFile: true,
      sortSchema: true,
      introspection: true,
      playground: false,
      plugins: [ApolloServerPluginLandingPageDisabled()],
      buildSchemaOptions: {
        orphanedTypes: [
          Author,
          Book,
          Order,
          CreateBookInput,
          UpdateBookInput,
          PlaceOrderInput,
          ListBooksArgs,
          BookSummary,
          PublicAuthor,
        ],
      },
    }),
  ],
  providers: [DemoResolver],
})
class AppModule {}

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: process.env.NEST_LOG === '1' ? ['error', 'warn', 'log'] : false,
    bodyParser: false,
  });
  const express = (await import('express')).default;
  app.use(express.json({ limit: '10mb' }));
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidUnknownValues: true,
    }),
  );
  const port = Number(process.env.PORT ?? 3009);
  await app.listen(port);
  console.log(`[classvalidator-demo] listening on http://localhost:${port}/graphql`);
}

bootstrap().catch((e) => {
  console.error(e);
  process.exit(1);
});

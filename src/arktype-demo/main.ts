import { ApolloServerPluginLandingPageDisabled } from '@apollo/server/plugin/disabled';
import type { ApolloDriverConfig } from '@nestjs/apollo';
import { ApolloDriver } from '@nestjs/apollo';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { GraphQLModule } from '@nestjs/graphql';
import 'reflect-metadata';
import { ArkValidationPipe } from '../arktype/graphql-arktype';
import { mountBenchStats } from '../shared/bench-stats';
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
import { DemoResolver } from './resolver';

@Module({
    imports: [
        GraphQLModule.forRoot<ApolloDriverConfig>({
            autoSchemaFile: true,
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
            driver: ApolloDriver,
            introspection: true,
            playground: false,
            plugins: [ApolloServerPluginLandingPageDisabled()],
            sortSchema: true,
        }),
    ],
    providers: [DemoResolver],
})
class AppModule {}

async function bootstrap() {
    const app = await NestFactory.create(AppModule, {
        bodyParser: false,
        logger: process.env.NEST_LOG === '1' ? ['error', 'warn', 'log'] : false,
    });
    const express = (await import('express')).default;
    app.use(express.json({ limit: '10mb' }));
    app.useGlobalPipes(new ArkValidationPipe());
    mountBenchStats(app);
    const port = Number(process.env.PORT ?? 3010);
    await app.listen(port);
    console.log(`[arktype-demo] listening on http://localhost:${port}/graphql`);
}

bootstrap().catch((error) => {
    console.error(error);
    process.exit(1);
});

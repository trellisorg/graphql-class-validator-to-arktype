import { ApolloServerPluginLandingPageDisabled } from '@apollo/server/plugin/disabled';
import type { ApolloDriverConfig } from '@nestjs/apollo';
import { ApolloDriver } from '@nestjs/apollo';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { GraphQLModule } from '@nestjs/graphql';
import 'reflect-metadata';
import { CartItemInput, CartSummaryInput, CartSummaryResult, SponsorInput, TagInput } from './dtos';
import { FILLER_CLASSES } from './filler-types';
import { ArkValidationPipe } from './graphql-arktype';
import { CartResolver } from './resolver';

@Module({
    imports: [
        GraphQLModule.forRoot<ApolloDriverConfig>({
            autoSchemaFile: true,
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
            driver: ApolloDriver,
            introspection: false,
            playground: false,
            plugins: [ApolloServerPluginLandingPageDisabled()],
        }),
    ],
    providers: [CartResolver],
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
    const port = Number(process.env.PORT ?? 3002);
    await app.listen(port);
    console.log(`[arktype] listening on http://localhost:${port}/graphql`);
}

bootstrap().catch((error) => {
    console.error(error);
    process.exit(1);
});

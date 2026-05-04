import { ApolloServerPluginLandingPageDisabled } from '@apollo/server/plugin/disabled';
import type { ApolloDriverConfig } from '@nestjs/apollo';
import { ApolloDriver } from '@nestjs/apollo';
import { Module, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { GraphQLModule } from '@nestjs/graphql';
import 'reflect-metadata';
import { mountBenchStats } from '../shared/bench-stats';
import { CartItemInput, CartSummaryInput, CartSummaryResult, SponsorInput, TagInput } from './dtos';
import './filler-types';
import { FILLER_CLASSES } from './filler-types';
import { CartResolver } from './resolver';

@Module({
    imports: [
        GraphQLModule.forRoot<ApolloDriverConfig>({
            driver: ApolloDriver,
            autoSchemaFile: true,
            introspection: false,
            playground: false,
            plugins: [ApolloServerPluginLandingPageDisabled()],
            // Force the filler input types into the schema so their metadata is
            // Retained at validation time, mirroring Aurora's footprint.
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
        bodyParser: false,
        logger: process.env.NEST_LOG === '1' ? ['error', 'warn', 'log'] : false,
    });
    const express = (await import('express')).default;
    app.use(express.json({ limit: '10mb' }));
    app.useGlobalPipes(
        new ValidationPipe({
            forbidUnknownValues: true,
            transform: true,
            whitelist: true,
        })
    );
    mountBenchStats(app);
    const port = Number(process.env.PORT ?? 3001);
    await app.listen(port);
    // eslint-disable-next-line no-console
    console.log(`[class-validator] listening on http://localhost:${port}/graphql`);
}

bootstrap().catch((error) => {
    console.error(error);
    process.exit(1);
});

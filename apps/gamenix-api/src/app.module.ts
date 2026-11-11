import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule } from '@nestjs/config';
import { AppResolver } from './app.resolver';
import { GraphQLModule } from '@nestjs/graphql';
import { ApolloDriver } from '@nestjs/apollo'
import { ComponentsModule } from './components/components.module';
import { DatabaseModule } from './database/database.module';
import { T } from './libs/types/common';
import { SocketModule } from './socket/socket.module';


@Module({
  imports: [
    ConfigModule.forRoot(),
    GraphQLModule.forRoot({
      driver: ApolloDriver,
      playgroung: true,
      uploads: false,
      autoSchemaFile: true,
      formatError: (error: T) => {
        const graphQLFormattedError = {
          code: error?.extensions.code,
          message:
            error?.extensions?.exception?.response?.message ||
            error?.extensions?.response?.message ||
            error?.message,
          extensions: {
            code: error?.extensions.code,
          },
        };

        // Variable-coercion errors can include callback tokens before interceptors run.
        console.log("GRAPHQL GLOBAL ERR:", graphQLFormattedError.code);
        return graphQLFormattedError;
      },
    }),
    ComponentsModule,
    DatabaseModule,
    SocketModule
  ],
  controllers: [AppController],
  providers: [AppService, AppResolver],
})
export class AppModule { }

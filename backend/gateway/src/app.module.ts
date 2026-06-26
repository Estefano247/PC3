import { Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { JwtModule } from '@nestjs/jwt';
import { AppController } from './app.controller';
import { AuthModule } from './auth/auth.module';
import { RecordingsModule } from './recordings/recordings.module';

@Module({
  imports: [
    ClientsModule.register([
      {
        name: 'AUTH_SERVICE',
        transport: Transport.TCP,
        options: {
          host: process.env.AUTH_HOST || 'localhost',
          port: 3002,
        },
      },
      {
        name: 'CDR_SERVICE',
        transport: Transport.TCP,
        options: {
          host: process.env.CDR_HOST || 'localhost',
          port: 3003,
        },
      },
      {
        name: 'ASTERISK_SERVICE',
        transport: Transport.TCP,
        options: {
          host: process.env.ASTERISK_HOST || 'localhost',
          port: 3004,
        },
      },
    ]),
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'callcenter-secret-key',
      signOptions: { expiresIn: '24h' },
    }),
    AuthModule,
    RecordingsModule,
  ],
  controllers: [AppController],
})
export class AppModule {}

import { Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { RecorderService } from './recorder.service';

@Module({
  imports: [
    ClientsModule.register([
      {
        name: 'CDR_SERVICE',
        transport: Transport.TCP,
        options: {
          host: process.env.CDR_HOST || 'cdr-svc',
          port: 3003,
        },
      },
    ]),
  ],
  providers: [RecorderService],
})
export class RecorderModule {}

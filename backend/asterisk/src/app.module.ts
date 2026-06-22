import { Module } from '@nestjs/common';
import { AsteriskModule } from './asterisk.module';

@Module({
  imports: [AsteriskModule],
})
export class AppModule {}

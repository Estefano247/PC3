import { Module } from '@nestjs/common';
import { AsteriskController } from './asterisk.controller';
import { AsteriskService } from './asterisk.service';
import { SshService } from './ssh.service';

@Module({
  controllers: [AsteriskController],
  providers: [AsteriskService, SshService],
})
export class AsteriskModule {}

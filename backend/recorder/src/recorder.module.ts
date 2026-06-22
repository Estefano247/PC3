import { Module } from '@nestjs/common';
import { RecorderService } from './recorder.service';

@Module({
  providers: [RecorderService],
})
export class RecorderModule {}

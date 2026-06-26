import { Module } from '@nestjs/common';
import { RecordingsController } from './recordings.controller';

@Module({
  controllers: [RecordingsController],
})
export class RecordingsModule {}

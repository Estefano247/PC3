import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CdrService } from './cdr.service';
import { CdrController } from './cdr.controller';
import { Cdr } from './cdr.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Cdr])],
  controllers: [CdrController],
  providers: [CdrService],
})
export class CdrModule {}

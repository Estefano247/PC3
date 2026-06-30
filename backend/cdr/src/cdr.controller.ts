import { Controller } from '@nestjs/common';
import { MessagePattern } from '@nestjs/microservices';
import { CdrService } from './cdr.service';
import { CdrQueryDto } from './dto/cdr-query.dto';
import { StatsQueryDto } from './dto/stats-query.dto';

@Controller()
export class CdrController {
  constructor(private readonly cdrService: CdrService) {}

  @MessagePattern({ cmd: 'cdr.findAll' })
  async findAll(data: CdrQueryDto) {
    return this.cdrService.findAll(data);
  }

  @MessagePattern({ cmd: 'cdr.findOne' })
  async findOne(data: { id: number }) {
    return this.cdrService.findOne(data.id);
  }

  @MessagePattern({ cmd: 'cdr.stats' })
  async getStats(data: StatsQueryDto) {
    return this.cdrService.getStats(data);
  }

  @MessagePattern({ cmd: 'recording.uploaded' })
  async recordingUploaded(data: {
    filename: string;
    uniqueid: string;
    caller: string;
    callee: string;
    filesize: number;
    minio_url: string;
  }) {
    return this.cdrService.saveRecording(data);
  }
}

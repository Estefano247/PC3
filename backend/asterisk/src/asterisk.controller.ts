import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { AsteriskService } from './asterisk.service';
import { CreateExtensionDto } from './dto/create-extension.dto';

@Controller()
export class AsteriskController {
  constructor(private readonly asteriskService: AsteriskService) {}

  @MessagePattern({ cmd: 'asterisk.extensions.findAll' })
  async findAll() {
    return this.asteriskService.getExtensions();
  }

  @MessagePattern({ cmd: 'asterisk.extensions.create' })
  async create(@Payload() dto: CreateExtensionDto) {
    await this.asteriskService.createExtension(dto);
    return { success: true };
  }

  @MessagePattern({ cmd: 'asterisk.extensions.remove' })
  async remove(@Payload() payload: { extension: string }) {
    await this.asteriskService.removeExtension(payload.extension);
    return { success: true };
  }

  @MessagePattern({ cmd: 'asterisk.status' })
  async status() {
    return this.asteriskService.getStatus();
  }

  @MessagePattern({ cmd: 'asterisk.reload' })
  async reload() {
    return this.asteriskService.reload();
  }
}

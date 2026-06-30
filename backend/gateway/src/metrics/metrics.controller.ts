import { Controller, Get, Res } from '@nestjs/common';
import { Response } from 'express';
import { MetricsService } from './metrics.service';

@Controller()
export class MetricsController {
  constructor(private readonly metrics: MetricsService) {}

  @Get('metrics')
  async getMetrics(@Res() res: Response) {
    const metrics = await this.metrics.getMetrics();
    res.set('Content-Type', this.metrics.getContentType());
    res.send(metrics);
  }
}

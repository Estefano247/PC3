import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Cdr } from './cdr.entity';
import { Recordings } from './recordings.entity';
import { CdrQueryDto } from './dto/cdr-query.dto';
import { StatsQueryDto } from './dto/stats-query.dto';

@Injectable()
export class CdrService {
  private readonly logger = new Logger(CdrService.name);

  constructor(
    @InjectRepository(Cdr)
    private readonly cdrRepository: Repository<Cdr>,
    @InjectRepository(Recordings)
    private readonly recordingsRepository: Repository<Recordings>,
  ) {}

  async findAll(query: CdrQueryDto): Promise<{ data: Cdr[]; total: number }> {
    const qb = this.cdrRepository.createQueryBuilder('cdr');

    if (query.src) {
      qb.andWhere('cdr.src LIKE :src', { src: `%${query.src}%` });
    }
    if (query.dst) {
      qb.andWhere('cdr.dst LIKE :dst', { dst: `%${query.dst}%` });
    }
    if (query.startDate) {
      qb.andWhere('cdr.calldate >= :startDate', { startDate: query.startDate });
    }
    if (query.endDate) {
      qb.andWhere('cdr.calldate <= :endDate', { endDate: query.endDate });
    }
    if (query.disposition) {
      qb.andWhere('cdr.disposition = :disposition', { disposition: query.disposition });
    }

    const limit = query.limit ?? 50;
    const offset = query.offset ?? 0;

    const [data, total] = await qb
      .orderBy('cdr.calldate', 'DESC')
      .skip(offset)
      .take(limit)
      .getManyAndCount();

    return { data, total };
  }

  async findOne(id: number): Promise<Cdr> {
    return this.cdrRepository.findOne({ where: { id } });
  }

  async getStats(query: StatsQueryDto) {
    const qb = this.cdrRepository.createQueryBuilder('cdr');

    if (query.startDate) {
      qb.andWhere('cdr.calldate >= :startDate', { startDate: query.startDate });
    }
    if (query.endDate) {
      qb.andWhere('cdr.calldate <= :endDate', { endDate: query.endDate });
    }

    const stats = await qb
      .select('COUNT(*)', 'totalCalls')
      .addSelect("COUNT(CASE WHEN cdr.disposition = 'ANSWERED' THEN 1 END)", 'answeredCalls')
      .addSelect('AVG(cdr.duration)', 'avgDuration')
      .addSelect('AVG(cdr.billsec)', 'avgBillsec')
      .addSelect('SUM(cdr.duration)', 'totalDuration')
      .getRawOne();

    return {
      totalCalls: Number(stats.totalCalls) || 0,
      answeredCalls: Number(stats.answeredCalls) || 0,
      avgDuration: Math.round(Number(stats.avgDuration)) || 0,
      avgBillsec: Math.round(Number(stats.avgBillsec)) || 0,
      totalDuration: Number(stats.totalDuration) || 0,
    };
  }

  async saveRecording(data: {
    filename: string;
    uniqueid: string;
    caller: string;
    callee: string;
    filesize: number;
    minio_url: string;
  }) {
    try {
      await this.recordingsRepository.insert({
        filename: data.filename,
        uniqueid: data.uniqueid,
        caller: data.caller,
        callee: data.callee,
        filesize: data.filesize,
        minio_url: data.minio_url,
      });

      const result = await this.cdrRepository
        .createQueryBuilder()
        .update(Cdr)
        .set({ recordingUrl: data.minio_url })
        .where('uniqueid = :uniqueid', { uniqueid: data.uniqueid })
        .execute();

      if (result.affected && result.affected > 0) {
        this.logger.log(`Updated recording_url for CDR uniqueid=${data.uniqueid}`);
      } else {
        this.logger.warn(`No CDR record found for uniqueid=${data.uniqueid}`);
      }

      return { success: true };
    } catch (error) {
      this.logger.error(`Failed to save recording metadata: ${error.message}`);
      return { success: false, error: error.message };
    }
  }
}

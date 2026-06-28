import { Controller, Get, Param, UseGuards, Logger } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import * as Minio from 'minio';

@Controller('api/recordings')
@UseGuards(JwtAuthGuard)
export class RecordingsController {
  private readonly logger = new Logger(RecordingsController.name);
  private readonly minioClient: Minio.Client;
  private readonly bucketName: string;

  constructor() {
    const minioHost = process.env.MINIO_HOST || 'minio';
    const minioPort = Number(process.env.MINIO_PORT) || 9000;
    this.minioClient = new Minio.Client({
      endPoint: minioHost,
      port: minioPort,
      useSSL: false,
      accessKey: process.env.MINIO_ACCESS_KEY || 'minioadmin',
      secretKey: process.env.MINIO_SECRET_KEY || 'minioadmin123',
    });
    this.bucketName = process.env.MINIO_BUCKET || 'recordings';
  }

  private replaceMinioHost(url: string): string {
    const internalHost = `${process.env.MINIO_HOST || 'minio'}:${Number(process.env.MINIO_PORT) || 9000}`;
    const path = url.split(`://${internalHost}`)[1] || url;
    return `/minio${path}`;
  }

  private async getWavDuration(name: string): Promise<number> {
    try {
      const stream: any = await this.minioClient.getPartialObject(this.bucketName, name, 0, 4096);
      const chunks: Buffer[] = [];
      await new Promise<void>((resolve, reject) => {
        stream.on('data', (chunk: Buffer) => chunks.push(chunk));
        stream.on('end', () => resolve());
        stream.on('error', reject);
      });
      const buf = Buffer.concat(chunks);
      if (buf.length < 12 || buf.toString('ascii', 0, 4) !== 'RIFF') return 0;
      let sampleRate = 0, channels = 0, bitsPerSample = 0;
      let offset = 12;
      while (offset + 8 <= buf.length) {
        const chunkId = buf.toString('ascii', offset, offset + 4);
        const chunkSize = buf.readUInt32LE(offset + 4);
        if (chunkId === 'fmt ') {
          if (offset + 24 > buf.length) return 0;
          const audioFormat = buf.readUInt16LE(offset + 8);
          if (audioFormat !== 1 && audioFormat !== 0xFFFE) return 0;
          channels = buf.readUInt16LE(offset + 10);
          sampleRate = buf.readUInt32LE(offset + 12);
          bitsPerSample = buf.readUInt16LE(offset + 22);
          offset += 8 + chunkSize;
          continue;
        }
        if (chunkId === 'data') {
          const dataSize = chunkSize;
          if (!sampleRate || !channels || !bitsPerSample) return 0;
          const bytesPerSec = sampleRate * channels * (bitsPerSample / 8);
          return Math.round(dataSize / bytesPerSec);
        }
        offset += 8 + chunkSize + (chunkSize % 2);
      }
      return 0;
    } catch {
      return 0;
    }
  }

  @Get()
  async listRecordings() {
    const stream = this.minioClient.listObjects(this.bucketName, '', true);
    const items: any[] = [];

    return new Promise((resolve, reject) => {
      stream.on('data', (obj) => {
        if (obj.name?.endsWith('.wav')) {
          items.push(obj);
        }
      });
      stream.on('error', (err) => {
        this.logger.error(`Failed to list recordings: ${err.message}`);
        reject(err);
      });
      stream.on('end', async () => {
        items.sort((a, b) => {
          const da = a.lastModified ? new Date(a.lastModified).getTime() : 0;
          const db = b.lastModified ? new Date(b.lastModified).getTime() : 0;
          return db - da;
        });

        const results = await Promise.all(
          items.map(async (item) => {
            let presignedUrl = '';
            try {
              presignedUrl = await this.minioClient.presignedGetObject(
                this.bucketName,
                item.name,
                60 * 60,
              );
              presignedUrl = this.replaceMinioHost(presignedUrl);
            } catch (err) {
              this.logger.warn(`Could not generate presigned URL for ${item.name}: ${err.message}`);
            }
            const parts = item.name.replace('.wav', '').split('-');
            const duration = await this.getWavDuration(item.name);
            return {
              key: item.name,
              caller: parts[1] || '',
              callee: parts[2] || '',
              duration,
              size: item.size,
              lastModified: item.lastModified,
              url: presignedUrl,
            };
          }),
        );

        resolve(results);
      });
    });
  }

  @Get(':filename')
  async getRecordingUrl(@Param('filename') filename: string) {
    const url = this.replaceMinioHost(
      await this.minioClient.presignedGetObject(
        this.bucketName,
        filename,
        60 * 60,
      ),
    );
    return { url, filename };
  }
}

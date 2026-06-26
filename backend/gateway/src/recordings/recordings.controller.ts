import { Controller, Get, Param, UseGuards, Logger } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import * as Minio from 'minio';

@Controller('api/recordings')
@UseGuards(JwtAuthGuard)
export class RecordingsController {
  private readonly logger = new Logger(RecordingsController.name);
  private readonly minioClient: Minio.Client;
  private readonly bucketName: string;
  private readonly publicEndpoint: string;

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
    this.publicEndpoint = process.env.MINIO_PUBLIC_ENDPOINT || `localhost:${minioPort}`;
  }

  private replaceMinioHost(url: string): string {
    const internalHost = `${process.env.MINIO_HOST || 'minio'}:${Number(process.env.MINIO_PORT) || 9000}`;
    return url.split(`://${internalHost}`).join(`://${this.publicEndpoint}`);
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
            return {
              key: item.name,
              caller: parts[1] || '',
              callee: parts[2] || '',
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

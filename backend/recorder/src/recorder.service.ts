import { Injectable, OnApplicationBootstrap, OnApplicationShutdown, Logger } from '@nestjs/common';
import * as Minio from 'minio';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class RecorderService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(RecorderService.name);
  private readonly minioClient: Minio.Client;
  private readonly bucketName: string;
  private readonly watchDir: string;
  private readonly uploadedLog: Set<string> = new Set();
  private watcher: fs.FSWatcher | null = null;
  private pendingUploads: Map<string, NodeJS.Timeout> = new Map();

  constructor() {
    this.minioClient = new Minio.Client({
      endPoint: process.env.MINIO_HOST || 'minio',
      port: Number(process.env.MINIO_PORT) || 9000,
      useSSL: false,
      accessKey: process.env.MINIO_ACCESS_KEY || 'minioadmin',
      secretKey: process.env.MINIO_SECRET_KEY || 'minioadmin123',
    });
    this.bucketName = process.env.MINIO_BUCKET || 'recordings';
    this.watchDir = process.env.RECORDINGS_DIR || '/recordings';
  }

  async onApplicationBootstrap() {
    await this.ensureBucket();
    await this.uploadExistingFiles();
    this.startWatcher();
    this.startPoller();
  }

  onApplicationShutdown() {
    this.stopWatcher();
  }

  private async ensureBucket() {
    const maxRetries = 30;
    const retryDelay = 2000;

    for (let i = 1; i <= maxRetries; i++) {
      try {
        const exists = await this.minioClient.bucketExists(this.bucketName);
        if (!exists) {
          await this.minioClient.makeBucket(this.bucketName);
          this.logger.log(`Bucket '${this.bucketName}' created`);
        } else {
          this.logger.log(`Bucket '${this.bucketName}' already exists`);
        }

        this.logger.log(`Bucket '${this.bucketName}' configured (private access)`);
        return;
      } catch (error) {
        this.logger.warn(`MinIO not ready (attempt ${i}/${maxRetries}): ${error.message}`);
        if (i === maxRetries) {
          this.logger.error(`Failed to connect to MinIO after ${maxRetries} attempts`);
          return;
        }
        await this.delay(retryDelay);
      }
    }
  }

  private async uploadExistingFiles() {
    try {
      const files = (await fs.promises.readdir(this.watchDir)).filter((f) => f.endsWith('.wav'));
      for (const file of files) {
        await this.uploadFile(path.join(this.watchDir, file));
      }
    } catch (error) {
      this.logger.warn(`Could not scan existing recordings: ${error.message}`);
    }
  }

  private startWatcher() {
    try {
      fs.accessSync(this.watchDir, fs.constants.R_OK);
    } catch {
      this.logger.warn(`Watch directory ${this.watchDir} not available, watcher disabled`);
      return;
    }

    this.watcher = fs.watch(this.watchDir, (eventType, filename) => {
      if (filename && filename.endsWith('.wav')) {
        const filePath = path.join(this.watchDir, filename);

        const existing = this.pendingUploads.get(filename);
        if (existing) clearTimeout(existing);

        const timeout = setTimeout(async () => {
          this.pendingUploads.delete(filename);
          try {
            const stat = await fs.promises.stat(filePath);
            if (Date.now() - stat.mtimeMs < 5000) return;
          } catch {
            return;
          }
          await this.uploadFile(filePath);
        }, 5000);
        this.pendingUploads.set(filename, timeout);
      }
    });

    this.logger.log(`Watching ${this.watchDir} for new recordings`);
  }

  private startPoller() {
    setInterval(async () => {
      try {
        const files = (await fs.promises.readdir(this.watchDir)).filter((f) => f.endsWith('.wav'));
        for (const file of files) {
          if (this.uploadedLog.has(file)) continue;
          const filePath = path.join(this.watchDir, file);
          try {
            const stat = await fs.promises.stat(filePath);
            if (Date.now() - stat.mtimeMs < 5000) continue;
          } catch {
            continue;
          }
          await this.uploadFile(filePath);
        }
      } catch (err) {
        this.logger.warn(`Polling scan failed: ${err.message}`);
      }
    }, 15000);
    this.logger.log(`Polling ${this.watchDir} every 15s for missed recordings`);
  }

  private stopWatcher() {
    if (this.watcher) {
      this.watcher.close();
    }
    for (const timeout of this.pendingUploads.values()) {
      clearTimeout(timeout);
    }
    this.pendingUploads.clear();
  }

  private async uploadFile(filePath: string) {
    const filename = path.basename(filePath);

    if (this.uploadedLog.has(filename)) return;

    try {
      await fs.promises.access(filePath, fs.constants.R_OK);
    } catch {
      return;
    }

    try {
      await this.minioClient.fPutObject(this.bucketName, filename, filePath);
      this.uploadedLog.add(filename);
      this.logger.log(`Uploaded: ${filename}`);
    } catch (error) {
      this.logger.error(`Failed to upload ${filename}: ${error.message}`);
    }
  }

  private delay(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

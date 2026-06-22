import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Client } from 'ssh2';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class SshService implements OnModuleInit {
  private readonly logger = new Logger(SshService.name);
  private sshHost: string;
  private sshPort: number;
  private sshUser: string;
  private sshKey: string;

  onModuleInit() {
    this.sshHost = process.env.ASTERISK_SSH_HOST || 'asterisk';
    this.sshPort = Number(process.env.ASTERISK_SSH_PORT) || 22;
    this.sshUser = process.env.ASTERISK_SSH_USER || 'root';

    const keyPath = process.env.ASTERISK_SSH_KEY;
    if (keyPath) {
      const resolvedPath = path.resolve(keyPath);
      this.sshKey = fs.readFileSync(resolvedPath, 'utf-8');
      this.logger.log(`SSH key loaded from ${resolvedPath}`);
    } else {
      this.logger.warn('ASTERISK_SSH_KEY not set; SSH will likely fail');
    }
  }

  executeCommand(command: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const client = new Client();

      client.on('ready', () => {
        client.exec(command, (err, stream) => {
          if (err) {
            client.end();
            return reject(err);
          }

          let stdout = '';
          let stderr = '';

          stream.on('data', (data: Buffer) => {
            stdout += data.toString();
          });

          stream.stderr.on('data', (data: Buffer) => {
            stderr += data.toString();
          });

          stream.on('close', (code: number) => {
            client.end();
            if (code !== 0 && stderr) {
              reject(new Error(stderr.trim()));
            } else {
              resolve(stdout.trim());
            }
          });
        });
      });

      client.on('error', (err) => {
        reject(err);
      });

      client.connect({
        host: this.sshHost,
        port: this.sshPort,
        username: this.sshUser,
        privateKey: this.sshKey,
        readyTimeout: 10000,
      });
    });
  }
}

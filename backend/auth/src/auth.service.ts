import { Injectable, OnApplicationBootstrap, UnauthorizedException, ConflictException, NotFoundException, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import * as http from 'http';
import { User } from './user.entity';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';

@Injectable()
export class AuthService implements OnApplicationBootstrap {
  private readonly logger = new Logger(AuthService.name);
  private readonly midpointUrl: string;
  private readonly adminUser: string;
  private readonly adminPass: string;
  private readonly initDir: string;

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly jwtService: JwtService,
  ) {
    this.midpointUrl = process.env.MIDPOINT_URL || 'http://midpoint:8080/midpoint';
    this.adminUser = process.env.MP_ADMIN_USER || 'administrator';
    this.adminPass = process.env.MP_ADMIN_PASSWORD || 'Chang3M3!';
    this.initDir = process.env.MP_INIT_DIR || '/opt/midpoint/init';
  }

  async onApplicationBootstrap() {
    this.backgroundImport();
  }

  private async backgroundImport() {
    try {
      await this.importMidpointConfigs();
      await this.importMidpointUsers();
    } catch (err) {
      this.logger.error(`midPoint import failed: ${err.message}`);
    }
  }

  async login(dto: LoginDto) {
    const user = await this.userRepository.findOne({ where: { username: dto.username } });

    if (!user) {
      throw new UnauthorizedException('Credenciales inválidas');
    }
    if (!user.enabled) {
      throw new UnauthorizedException('Usuario deshabilitado');
    }

    let authenticated = false;

    try {
      const basicAuth = Buffer.from(`${dto.username}:${dto.password}`).toString('base64');
      const { statusCode } = await this.httpRequest(`${this.midpointUrl}/ws/rest/users/self`, {
        headers: { Authorization: `Basic ${basicAuth}` },
      });
      authenticated = statusCode >= 200 && statusCode < 300;
      if (authenticated) {
        this.logger.log(`midPoint validated credentials for ${dto.username}`);
      }
    } catch (error: any) {
      this.logger.warn(`midPoint unreachable (${error.message}), falling back to local auth`);
    }

    if (!authenticated) {
      if (!user.passwordHash) {
        throw new UnauthorizedException('Credenciales inválidas');
      }
      const passwordValid = await bcrypt.compare(dto.password, user.passwordHash);
      if (!passwordValid) {
        throw new UnauthorizedException('Credenciales inválidas');
      }
    } else {
      if (!user.sipPassword) {
        user.sipPassword = crypto.randomBytes(16).toString('hex');
        this.logger.log(`SIP password auto-generado para ${user.username}`);
      }
      if (!user.passwordHash) {
        const salt = await bcrypt.genSalt();
        user.passwordHash = await bcrypt.hash(dto.password, salt);
        this.logger.log(`Password hash generado para ${user.username} (fallback local)`);
      }
      if (user.sipPassword || user.passwordHash) {
        await this.userRepository.save(user);
      }
    }

    return this.generateToken(user);
  }

  async register(dto: RegisterDto) {
    const existing = await this.userRepository.findOne({ where: { username: dto.username } });
    if (existing) {
      throw new ConflictException('El usuario ya existe');
    }
    const maxUser = await this.userRepository
      .createQueryBuilder('user')
      .select('MAX(user.sipExtension)', 'max')
      .getRawOne();
    const nextExt = String((parseInt(maxUser?.max || '1099', 10) + 1));
    const salt = await bcrypt.genSalt();
    const passwordHash = await bcrypt.hash(dto.password, salt);
    const sipPassword = crypto.randomBytes(16).toString('hex');
    const user = this.userRepository.create({
      username: dto.username,
      fullName: dto.fullName,
      email: dto.email || null,
      passwordHash,
      sipPassword,
      sipExtension: nextExt,
    });
    await this.userRepository.save(user);
    return this.generateToken(user);
  }

  async validateToken(token: string) {
    try {
      const payload = this.jwtService.verify(token);
      const user = await this.userRepository.findOne({ where: { id: payload.sub } });
      if (!user) {
        throw new UnauthorizedException('Usuario no encontrado');
      }
      if (!user.enabled) {
        throw new UnauthorizedException('Usuario deshabilitado');
      }
      const { passwordHash, ...result } = user;
      return result;
    } catch {
      throw new UnauthorizedException('Token inválido o expirado');
    }
  }

  async getProfile(userId: number) {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('Usuario no encontrado');
    }
    const { passwordHash, ...result } = user;
    return result;
  }

  private async importMidpointConfigs() {
    await this.waitForMidpoint();
    const configs = [
      { file: 'resource-scripted-sql.xml', type: 'resources', label: 'DB Resource' },
      { file: 'role-agentecallcenter.xml', type: 'roles', label: 'AgenteCallCenter Role' },
      { file: 'object-template-user.xml', type: 'objectTemplates', label: 'User Object Template' },
    ];

    for (const cfg of configs) {
      const filePath = path.join(this.initDir, cfg.file);
      try {
        const content = fs.readFileSync(filePath, 'utf-8');
        const basicAuth = Buffer.from(`${this.adminUser}:${this.adminPass}`).toString('base64');
        const oidMatch = content.match(/oid="([^"]+)"/);
        const oid = oidMatch ? oidMatch[1] : null;

        if (oid) {
          await this.httpRequest(`${this.midpointUrl}/ws/rest/${cfg.type}/${oid}`, {
            method: 'DELETE',
            headers: { Authorization: `Basic ${basicAuth}` },
          }).catch(() => {});
        }

        const { statusCode, body } = await this.httpRequest(`${this.midpointUrl}/ws/rest/${cfg.type}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/xml',
            Accept: 'application/xml',
            Authorization: `Basic ${basicAuth}`,
          },
          body: content,
        });

        if (statusCode >= 200 && statusCode < 300) {
          this.logger.log(`${cfg.label} imported`);
        } else {
          this.logger.error(`Failed to import ${cfg.label}: HTTP ${statusCode} - ${body}`);
        }
      } catch (error: any) {
        this.logger.warn(`midPoint import ${cfg.file} skipped: ${error.message}`);
      }
    }
  }

  private async importMidpointUsers() {
    const basicAuth = Buffer.from(`${this.adminUser}:${this.adminPass}`).toString('base64');
    const roleOid = '00000000-0000-0000-0000-000000000010';

    const seedUsers = [
      { name: 'admin1', fullName: 'Admin Uno', email: 'admin1@callcenter.local', password: 'sip3001pass', telephoneNumber: '3001' },
      { name: 'admin2', fullName: 'Admin Dos', email: 'admin2@callcenter.local', password: 'sip3002pass', telephoneNumber: '3002' },
      { name: 'agente1', fullName: 'Agente Uno', email: 'agente1@callcenter.local', password: 'sip3005pass', telephoneNumber: '3003' },
      { name: 'agente2', fullName: 'Agente Dos', email: 'agente2@callcenter.local', password: 'sip3006pass', telephoneNumber: '3004' },
    ];

    const userXml = (u: typeof seedUsers[0]) => `<?xml version="1.0" encoding="UTF-8"?>
<user xmlns="http://midpoint.evolveum.com/xml/ns/public/common/common-3"
      xmlns:c="http://midpoint.evolveum.com/xml/ns/public/common/common-3"
      xmlns:xsd="http://www.w3.org/2001/XMLSchema">
    <name>${u.name}</name>
    <fullName>${u.fullName}</fullName>
    <emailAddress>${u.email}</emailAddress>
    <credentials>
        <password>
            <value>${u.password}</value>
        </password>
    </credentials>
    <assignment>
        <targetRef oid="${roleOid}" type="c:RoleType"/>
    </assignment>
    <telephoneNumber>${u.telephoneNumber}</telephoneNumber>
</user>`;

    for (const u of seedUsers) {
      let attempts = 0;
      while (attempts < 3) {
        attempts++;
        try {
          const { statusCode, body } = await this.httpRequest(`${this.midpointUrl}/ws/rest/users`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/xml',
              Accept: 'application/xml',
              Authorization: `Basic ${basicAuth}`,
            },
            body: userXml(u),
          });

          if (statusCode >= 200 && statusCode < 300 || statusCode === 409) {
            this.logger.log(`midPoint user ${u.name} created${statusCode === 409 ? ' (already exists)' : ''}`);
            break;
          }
          if (statusCode === 500 || statusCode === 503) {
            this.logger.warn(`midPoint user ${u.name} attempt ${attempts}/3 failed: HTTP ${statusCode}, retrying...`);
            await this.delay(5000);
            continue;
          }
          this.logger.warn(`Failed to create midPoint user ${u.name}: HTTP ${statusCode} - ${body}`);
          break;
        } catch (error: any) {
          this.logger.warn(`midPoint user ${u.name} attempt ${attempts}/3 failed: ${error.message}${attempts < 3 ? ', retrying...' : ''}`);
          if (attempts < 3) await this.delay(5000);
        }
      }
    }
  }

  private httpRequest(url: string, options: { method?: string; headers?: Record<string, string>; body?: string } = {}): Promise<{ statusCode: number; body: string }> {
    return new Promise((resolve, reject) => {
      const parsedUrl = new URL(url);
      const opts: http.RequestOptions = {
        hostname: parsedUrl.hostname,
        port: parsedUrl.port,
        path: parsedUrl.pathname + parsedUrl.search,
        method: options.method || 'GET',
        headers: options.headers || {},
        timeout: 15000,
      };
      const req = http.request(opts, (res) => {
        let data = '';
        res.on('data', (chunk) => data += chunk);
        res.on('end', () => resolve({ statusCode: res.statusCode || 0, body: data }));
      });
      req.on('error', reject);
      req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
      if (options.body) req.write(options.body);
      req.end();
    });
  }

  private async waitForMidpoint() {
    for (let i = 1; i <= 120; i++) {
      try {
        const { statusCode } = await this.httpRequest(this.midpointUrl);
        if (statusCode === 200 || statusCode === 302) return;
      } catch {
        // not ready
      }
      await this.delay(5000);
    }
  }

  private delay(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private generateToken(user: User) {
    const payload = { username: user.username, sub: user.id, role: user.role };
    return {
      access_token: this.jwtService.sign(payload),
      sip_password: user.sipPassword,
      user: {
        id: user.id,
        username: user.username,
        fullName: user.fullName,
        email: user.email,
        role: user.role,
        sipExtension: user.sipExtension,
        sipPassword: user.sipPassword,
        enabled: user.enabled,
      },
    };
  }
}

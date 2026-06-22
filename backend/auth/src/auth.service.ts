import { Injectable, OnApplicationBootstrap, UnauthorizedException, ConflictException, NotFoundException, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import * as fs from 'fs';
import * as path from 'path';
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
    this.importMidpointConfigs();
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
      const response = await fetch(`${this.midpointUrl}/ws/rest/users/self`, {
        headers: { Authorization: `Basic ${basicAuth}` },
      });
      authenticated = response.ok;
      if (authenticated) {
        this.logger.log(`midPoint validated credentials for ${dto.username}`);
      }
    } catch (error) {
      this.logger.warn(`midPoint unreachable (${error.message}), falling back to local auth`);
    }

    if (!authenticated) {
      const passwordValid = await bcrypt.compare(dto.password, user.passwordHash);
      if (!passwordValid) {
        throw new UnauthorizedException('Credenciales inválidas');
      }
    }

    return this.generateToken(user);
  }

  async register(dto: RegisterDto) {
    const existing = await this.userRepository.findOne({ where: { username: dto.username } });
    if (existing) {
      throw new ConflictException('El usuario ya existe');
    }
    const salt = await bcrypt.genSalt();
    const passwordHash = await bcrypt.hash(dto.password, salt);
    const user = this.userRepository.create({
      username: dto.username,
      fullName: dto.fullName,
      email: dto.email || null,
      passwordHash,
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
        const res = await fetch(`${this.midpointUrl}/ws/rest/${cfg.type}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/xml',
            Accept: 'application/xml',
            Authorization: `Basic ${basicAuth}`,
          },
          body: content,
        });

        if (res.ok || res.status === 409) {
          this.logger.log(`${cfg.label} imported${res.status === 409 ? ' (already exists)' : ''}`);
        } else {
          const text = await res.text();
          this.logger.error(`Failed to import ${cfg.label}: HTTP ${res.status} - ${text}`);
        }
      } catch (error) {
        this.logger.warn(`midPoint import ${cfg.file} skipped: ${error.message}`);
      }
    }
  }

  private async waitForMidpoint() {
    for (let i = 1; i <= 60; i++) {
      try {
        const res = await fetch(`${this.midpointUrl}/actuator/health`, {
          signal: AbortSignal.timeout(5000),
        });
        if (res.ok) return;
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
      user: {
        id: user.id,
        username: user.username,
        fullName: user.fullName,
        email: user.email,
        role: user.role,
        sipExtension: user.sipExtension,
        enabled: user.enabled,
      },
    };
  }
}

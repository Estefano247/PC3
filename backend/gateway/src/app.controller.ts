import {
  Controller, Post, Get, Delete, Body, Param, Query,
  UseGuards, Req, Inject, GatewayTimeoutException,
  BadRequestException, Logger,
} from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom, timeout, catchError } from 'rxjs';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { AdminGuard } from './auth/admin.guard';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { CreateExtensionDto } from './dto/create-extension.dto';
import { MetricsService } from './metrics/metrics.service';

@Controller()
export class AppController {
  private readonly timeoutMs = 10000;
  private readonly logger = new Logger(AppController.name);

  constructor(
    @Inject('AUTH_SERVICE') private readonly authClient: ClientProxy,
    @Inject('CDR_SERVICE') private readonly cdrClient: ClientProxy,
    @Inject('ASTERISK_SERVICE') private readonly asteriskClient: ClientProxy,
    private readonly metrics: MetricsService,
  ) {}

  private async sendWithTimeout<T>(client: ClientProxy, pattern: any, payload: any, service: string, operation: string): Promise<T> {
    const startTime = performance.now();
    try {
      const result = await firstValueFrom(
        client.send(pattern, payload).pipe(timeout(this.timeoutMs)),
      );
      const duration = (performance.now() - startTime) / 1000;
      this.metrics.microserviceRequestDuration.observe({ service, operation }, duration);
      return result;
    } catch (error: any) {
      const duration = (performance.now() - startTime) / 1000;
      this.metrics.microserviceRequestDuration.observe({ service, operation }, duration);
      this.metrics.microserviceErrorsTotal.inc({ service, operation });
      if (error?.name === 'TimeoutError') {
        throw new GatewayTimeoutException('El servicio no respondió a tiempo');
      }
      throw error;
    }
  }

  @Post('api/auth/login')
  async login(@Body() loginDto: LoginDto) {
    try {
      const result = await this.sendWithTimeout(this.authClient, { cmd: 'auth.login' }, loginDto, 'auth', 'login');
      this.metrics.activeSessions.inc();
      return result;
    } catch (error: any) {
      this.metrics.authFailuresTotal.inc({ reason: 'login_failed' });
      throw error;
    }
  }

  @Post('api/auth/register')
  async register(@Body() registerDto: RegisterDto) {
    try {
      return await this.sendWithTimeout(this.authClient, { cmd: 'auth.register' }, registerDto, 'auth', 'register');
    } catch (error: any) {
      this.metrics.authFailuresTotal.inc({ reason: 'register_failed' });
      throw error;
    }
  }

  @Get('api/auth/profile')
  @UseGuards(JwtAuthGuard)
  async getProfile(@Req() req) {
    return this.sendWithTimeout(this.authClient, { cmd: 'auth.profile' }, { userId: req.user.id }, 'auth', 'profile');
  }

  @Get('api/cdr')
  @UseGuards(JwtAuthGuard)
  async findAllCdr(
    @Query('src') src: string,
    @Query('dst') dst: string,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
    @Query('disposition') disposition: string,
    @Query('limit') limit: string,
    @Query('offset') offset: string,
  ) {
    this.metrics.callsProcessedTotal.inc({ status: 'queried' });
    return this.sendWithTimeout(
      this.cdrClient,
      { cmd: 'cdr.findAll' },
      { src, dst, startDate, endDate, disposition, limit, offset },
      'cdr', 'findAll',
    );
  }

  @Get('api/cdr/stats')
  @UseGuards(JwtAuthGuard)
  async getCdrStats(@Query('startDate') startDate: string, @Query('endDate') endDate: string) {
    const stats: any = await this.sendWithTimeout(this.cdrClient, { cmd: 'cdr.stats' }, { startDate, endDate }, 'cdr', 'stats');
    if (stats) {
      this.metrics.callsProcessedTotal.inc({ status: 'success' }, stats.answeredCalls || 0);
      this.metrics.callsProcessedTotal.inc({ status: 'failed' }, (stats.totalCalls || 0) - (stats.answeredCalls || 0));
    }
    return stats;
  }

  @Get('api/cdr/:id')
  @UseGuards(JwtAuthGuard)
  async findOneCdr(@Param('id') id: string) {
    return this.sendWithTimeout(this.cdrClient, { cmd: 'cdr.findOne' }, { id: Number(id) }, 'cdr', 'findOne');
  }

  @Get('api/asterisk/extensions')
  @UseGuards(JwtAuthGuard)
  async findAllExtensions() {
    return this.sendWithTimeout(this.asteriskClient, { cmd: 'asterisk.extensions.findAll' }, {}, 'asterisk', 'extensions.findAll');
  }

  @Post('api/asterisk/extensions')
  @UseGuards(JwtAuthGuard)
  async createExtension(@Body() createExtensionDto: CreateExtensionDto) {
    return this.sendWithTimeout(this.asteriskClient, { cmd: 'asterisk.extensions.create' }, createExtensionDto, 'asterisk', 'extensions.create');
  }

  @Post('api/asterisk/register-sip')
  @UseGuards(JwtAuthGuard)
  async registerSip(@Req() req, @Body() body: { password: string }) {
    const profile: any = await this.sendWithTimeout(
      this.authClient, { cmd: 'auth.profile' }, { userId: req.user.id }, 'auth', 'profile',
    );
    if (!profile.sipExtension) {
      throw new BadRequestException('El usuario no tiene una extension SIP asignada');
    }
    try {
      await this.sendWithTimeout(this.asteriskClient, { cmd: 'asterisk.extensions.create' }, {
        username: profile.username,
        extension: profile.sipExtension,
        password: body.password,
        displayName: profile.fullName,
      }, 'asterisk', 'extensions.create');
    } catch (err: any) {
      this.logger.warn(`Extension creation for ${profile.sipExtension}: ${err.message}`);
    }
    const wsUrl = `ws://${req.headers.host}/ws`;
    return { extension: profile.sipExtension, server: wsUrl };
  }

  @Delete('api/asterisk/extensions/:extension')
  @UseGuards(JwtAuthGuard)
  async removeExtension(@Param('extension') extension: string) {
    return this.sendWithTimeout(this.asteriskClient, { cmd: 'asterisk.extensions.remove' }, { extension }, 'asterisk', 'extensions.remove');
  }

  @Get('api/asterisk/status')
  @UseGuards(JwtAuthGuard)
  async getAsteriskStatus() {
    return this.sendWithTimeout(this.asteriskClient, { cmd: 'asterisk.status' }, {}, 'asterisk', 'status');
  }

  @Post('api/asterisk/reload')
  @UseGuards(JwtAuthGuard)
  async reloadAsterisk() {
    return this.sendWithTimeout(this.asteriskClient, { cmd: 'asterisk.reload' }, {}, 'asterisk', 'reload');
  }

  @Get('api/admin/users')
  @UseGuards(JwtAuthGuard, AdminGuard)
  async adminFindAllUsers() {
    return this.sendWithTimeout(this.authClient, { cmd: 'auth.users.findAll' }, {}, 'auth', 'users.findAll');
  }
}

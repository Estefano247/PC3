import {
  Controller, Post, Get, Delete, Body, Param, Query,
  UseGuards, Req, Inject,
} from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { LoginDto } from './dto/login.dto';
import { CreateExtensionDto } from './dto/create-extension.dto';

@Controller()
export class AppController {
  constructor(
    @Inject('AUTH_SERVICE') private readonly authClient: ClientProxy,
    @Inject('CDR_SERVICE') private readonly cdrClient: ClientProxy,
    @Inject('ASTERISK_SERVICE') private readonly asteriskClient: ClientProxy,
  ) {}

  @Post('api/auth/login')
  async login(@Body() loginDto: LoginDto) {
    return this.authClient.send({ cmd: 'auth.login' }, loginDto);
  }

  @Post('api/auth/register')
  async register(@Body() body: { username: string; password: string; fullName: string; email: string }) {
    return this.authClient.send({ cmd: 'auth.register' }, body);
  }

  @Get('api/auth/profile')
  @UseGuards(JwtAuthGuard)
  async getProfile(@Req() req) {
    return this.authClient.send({ cmd: 'auth.profile' }, { userId: req.user.id });
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
    return this.cdrClient.send(
      { cmd: 'cdr.findAll' },
      { src, dst, startDate, endDate, disposition, limit, offset },
    );
  }

  @Get('api/cdr/stats')
  @UseGuards(JwtAuthGuard)
  async getCdrStats(@Query('startDate') startDate: string, @Query('endDate') endDate: string) {
    return this.cdrClient.send({ cmd: 'cdr.stats' }, { startDate, endDate });
  }

  @Get('api/cdr/:id')
  @UseGuards(JwtAuthGuard)
  async findOneCdr(@Param('id') id: string) {
    return this.cdrClient.send({ cmd: 'cdr.findOne' }, { id });
  }

  @Get('api/asterisk/extensions')
  @UseGuards(JwtAuthGuard)
  async findAllExtensions() {
    return this.asteriskClient.send({ cmd: 'asterisk.extensions.findAll' }, {});
  }

  @Post('api/asterisk/extensions')
  @UseGuards(JwtAuthGuard)
  async createExtension(@Body() createExtensionDto: CreateExtensionDto) {
    return this.asteriskClient.send({ cmd: 'asterisk.extensions.create' }, createExtensionDto);
  }

  @Delete('api/asterisk/extensions/:extension')
  @UseGuards(JwtAuthGuard)
  async removeExtension(@Param('extension') extension: string) {
    return this.asteriskClient.send({ cmd: 'asterisk.extensions.remove' }, { extension });
  }

  @Get('api/asterisk/status')
  @UseGuards(JwtAuthGuard)
  async getAsteriskStatus() {
    return this.asteriskClient.send({ cmd: 'asterisk.status' }, {});
  }

  @Post('api/asterisk/reload')
  @UseGuards(JwtAuthGuard)
  async reloadAsterisk() {
    return this.asteriskClient.send({ cmd: 'asterisk.reload' }, {});
  }
}

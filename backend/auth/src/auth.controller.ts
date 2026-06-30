import { Controller } from '@nestjs/common';
import { MessagePattern } from '@nestjs/microservices';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';

@Controller()
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @MessagePattern({ cmd: 'auth.login' })
  async login(data: LoginDto) {
    return this.authService.login(data);
  }

  @MessagePattern({ cmd: 'auth.register' })
  async register(data: RegisterDto) {
    return this.authService.register(data);
  }

  @MessagePattern({ cmd: 'auth.validate' })
  async validateToken(data: { userId: number }) {
    return this.authService.getProfile(data.userId);
  }

  @MessagePattern({ cmd: 'auth.profile' })
  async getProfile(data: { userId: number }) {
    return this.authService.getProfile(data.userId);
  }

  @MessagePattern({ cmd: 'auth.users.findAll' })
  async findAllUsers() {
    return this.authService.findAllUsers();
  }
}

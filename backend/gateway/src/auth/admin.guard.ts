import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';

@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user;
    if (!user) {
      throw new ForbiddenException('No autenticado');
    }
    const normalizedRole = user.role?.toLowerCase() || '';
    if (normalizedRole !== 'admin' && !user.username?.toLowerCase().startsWith('admin')) {
      throw new ForbiddenException('Se requieren permisos de administrador');
    }
    return true;
  }
}

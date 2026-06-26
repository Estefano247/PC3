import { IsString, IsEmail, IsOptional } from 'class-validator';

export class RegisterDto {
  @IsString()
  username: string;

  @IsString()
  password: string;

  @IsString()
  fullName: string;

  @IsOptional()
  @IsEmail()
  email?: string;
}
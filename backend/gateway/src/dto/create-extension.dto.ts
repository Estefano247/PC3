import { IsString, IsOptional } from 'class-validator';

export class CreateExtensionDto {
  @IsString()
  username: string;

  @IsString()
  extension: string;

  @IsString()
  password: string;

  @IsOptional()
  @IsString()
  displayName?: string;
}

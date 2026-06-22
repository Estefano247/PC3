import { IsString } from 'class-validator';

export class ValidateDto {
  @IsString()
  token: string;
}

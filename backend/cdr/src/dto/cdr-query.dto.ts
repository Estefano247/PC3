import { IsOptional, IsString, IsDateString, IsNumber } from 'class-validator';
import { Type } from 'class-transformer';

export class CdrQueryDto {
  @IsOptional()
  @IsString()
  src?: string;

  @IsOptional()
  @IsString()
  dst?: string;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsString()
  disposition?: string;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  limit?: number = 50;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  offset?: number = 0;
}

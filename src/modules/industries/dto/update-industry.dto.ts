import { IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';

export class UpdateIndustryDto {
  @IsString()
  @IsNotEmpty()
  @IsOptional()
  name?: string;

  @IsUUID()
  @IsNotEmpty()
  @IsOptional()
  sectorId?: string;
}

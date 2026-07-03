import { IsNotEmpty, IsString, IsUUID } from 'class-validator';

export class CreateIndustryDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsUUID()
  @IsNotEmpty()
  sectorId: string;
}

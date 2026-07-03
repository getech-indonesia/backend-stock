import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class UpdateSectorDto {
  @IsString()
  @IsNotEmpty()
  @IsOptional()
  name?: string;
}

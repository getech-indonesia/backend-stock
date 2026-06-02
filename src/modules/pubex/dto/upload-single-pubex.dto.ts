import { IsInt, IsNotEmpty, IsString, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class UploadSinglePubExDto {
  @IsString()
  @IsNotEmpty()
  ticker!: string;

  @IsString()
  @IsNotEmpty()
  issuerName!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1900)
  @Max(9999)
  year!: number;

  @IsString()
  @IsNotEmpty()
  reportType!: string;
}


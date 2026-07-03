import { IsNotEmpty, IsString } from 'class-validator';

export class CreateSectorDto {
  @IsString()
  @IsNotEmpty()
  name: string;
}

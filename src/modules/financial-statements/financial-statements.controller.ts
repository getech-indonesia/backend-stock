import {
  BadRequestException,
  Body,
  Controller,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { FinancialStatementsService } from './financial-statements.service';
import { DeAccumulateFinancialStatementsDto } from './dto/de-accumulate-financial-statements.dto';

@Controller('admin/financial-statements')
export class FinancialStatementsController {
  constructor(private readonly financialStatementsService: FinancialStatementsService) { }

  @Post('de-accumulate')
  async deAccumulate(@Body() body: DeAccumulateFinancialStatementsDto) {
    return this.financialStatementsService.deAccumulateStatements(body);
  }

  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  async upload(@UploadedFile() file: Express.Multer.File) {
    this.validateUploadedFile(file);
    return this.financialStatementsService.uploadXbrl(file);
  }

  private validateUploadedFile(file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('File is required');
    }

    const extension = file.originalname.split('.').pop()?.toLowerCase();
    const mimeType = file.mimetype;

    const zipMimeTypes = [
      'application/zip',
      'application/x-zip-compressed',
      'multipart/x-zip',
      'application/x-compressed',
    ];

    const isZip = extension === 'zip' || zipMimeTypes.includes(mimeType);
    const isPdf = extension === 'pdf' || mimeType === 'application/pdf';

    if (!isZip && !isPdf) {
      throw new BadRequestException('Only ZIP and PDF files are allowed');
    }
  }
}

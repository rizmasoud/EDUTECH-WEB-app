import { Module } from '@nestjs/common';
import { DatabaseModule } from '../infrastructure/database/database.module';
import { AuthModule } from '../auth/auth.module';
import { StudentsModule } from '../students/students.module';
import { ClassesModule } from '../classes/classes.module';
import { ImportsController } from './presentation/imports.controller';
import { ImportsService } from './application/services/imports.service';
import { ShahvarValidatorService } from './application/services/shahvar-validator.service';
import { DrizzleImportJobRepository } from './infrastructure/drizzle-import-job.repository';
import { DrizzleImportResultRepository } from './infrastructure/drizzle-import-result.repository';
import { SheetJsExcelParserAdapter } from './infrastructure/adapters/sheetjs-excel-parser.adapter';
import {
  IMPORT_JOB_REPOSITORY,
  IMPORT_RESULT_REPOSITORY,
  EXCEL_PARSER,
} from './domain/tokens';

@Module({
  imports: [DatabaseModule, AuthModule, StudentsModule, ClassesModule],
  controllers: [ImportsController],
  providers: [
    ImportsService,
    ShahvarValidatorService,
    {
      provide: IMPORT_JOB_REPOSITORY,
      useClass: DrizzleImportJobRepository,
    },
    {
      provide: IMPORT_RESULT_REPOSITORY,
      useClass: DrizzleImportResultRepository,
    },
    {
      provide: EXCEL_PARSER,
      useClass: SheetJsExcelParserAdapter,
    },
  ],
  exports: [
    ImportsService,
    IMPORT_JOB_REPOSITORY,
    IMPORT_RESULT_REPOSITORY,
    EXCEL_PARSER,
  ],
})
export class ImportsModule {}


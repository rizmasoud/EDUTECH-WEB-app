import { Module } from '@nestjs/common';
import { DatabaseModule } from '../infrastructure/database/database.module';
import { AuthModule } from '../auth/auth.module';
import { AcademicTermsController } from './presentation/academic-terms.controller';
import { BooksController } from './presentation/books.controller';
import { BookPartsController } from './presentation/book-parts.controller';
import { BookSegmentsController } from './presentation/book-segments.controller';
import { SyllabiController } from './presentation/syllabi.controller';
import { SyllabusItemsController } from './presentation/syllabus-items.controller';
import { AcademicTermsService } from './application/services/academic-terms.service';
import { BooksService } from './application/services/books.service';
import { SyllabusService } from './application/services/syllabus.service';
import { DrizzleAcademicTermRepository } from './infrastructure/drizzle-academic-term.repository';
import { DrizzleBookRepository } from './infrastructure/drizzle-book.repository';
import { ACADEMIC_TERM_REPOSITORY, BOOK_REPOSITORY } from './domain/tokens';

@Module({
  imports: [DatabaseModule, AuthModule],
  controllers: [
    AcademicTermsController,
    BooksController,
    BookPartsController,
    BookSegmentsController,
    SyllabiController,
    SyllabusItemsController,
  ],
  providers: [
    AcademicTermsService,
    BooksService,
    SyllabusService,
    {
      provide: ACADEMIC_TERM_REPOSITORY,
      useClass: DrizzleAcademicTermRepository,
    },
    {
      provide: BOOK_REPOSITORY,
      useClass: DrizzleBookRepository,
    },
  ],
  exports: [
    AcademicTermsService,
    BooksService,
    SyllabusService,
    ACADEMIC_TERM_REPOSITORY,
    BOOK_REPOSITORY,
  ],
})
export class AcademicsModule {}

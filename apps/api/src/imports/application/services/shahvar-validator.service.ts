import { Injectable, Inject } from '@nestjs/common';
import { STUDENT_REPOSITORY } from '../../../students/domain/tokens';
import type { IStudentRepository } from '../../../students/domain/repositories/student.repository.interface';
import { Student } from '../../../students/domain/entities/student.entity';
import { CLASS_REPOSITORY } from '../../../classes/domain/tokens';
import type { IClassRepository } from '../../../classes/domain/repositories/class.repository.interface';
import type {
  ShahvarRawRow,
} from '@edutech/shared';

export interface ValidationOutput {
  results: Array<{
    rowNumber: number;
    status: 'SUCCESS' | 'WARNING' | 'ERROR' | 'SKIPPED';
    message: string;
  }>;
  studentsToCreate: Array<{ firstName: string; lastName: string; shahvarCode: string | null }>;
  studentsToMatch: Array<{ studentId: string; fullName: string; shahvarCode: string | null }>;
  validRows: number;
  invalidRows: number;
  warningRows: number;
  totalRows: number;
}

@Injectable()
export class ShahvarValidatorService {
  constructor(
    @Inject(STUDENT_REPOSITORY)
    private readonly studentRepo: IStudentRepository,
    @Inject(CLASS_REPOSITORY)
    private readonly classRepo: IClassRepository,
  ) {}

  async validateRows(
    importJobId: string,
    academicTermId: string,
    bookId: string,
    rows: ShahvarRawRow[],
  ): Promise<ValidationOutput> {
    const results: Array<{
      rowNumber: number;
      status: 'SUCCESS' | 'WARNING' | 'ERROR' | 'SKIPPED';
      message: string;
    }> = [];

    const studentsToCreate: Array<{
      firstName: string;
      lastName: string;
      shahvarCode: string | null;
    }> = [];

    const studentsToMatch: Array<{
      studentId: string;
      fullName: string;
      shahvarCode: string | null;
    }> = [];

    // 1. Verify Academic Term
    const termValid = await this.classRepo.verifyTermExistsAndNotClosed(academicTermId);
    if (!termValid) {
      return {
        results: [
          {
            rowNumber: 0,
            status: 'ERROR',
            message: 'Academic term does not exist or is in CLOSED status',
          },
        ],
        studentsToCreate: [],
        studentsToMatch: [],
        validRows: 0,
        invalidRows: rows.length,
        warningRows: 0,
        totalRows: rows.length,
      };
    }

    // 2. Verify Book
    const bookValid = await this.classRepo.verifyBookExistsAndActive(bookId);
    if (!bookValid) {
      return {
        results: [
          {
            rowNumber: 0,
            status: 'ERROR',
            message: 'Target book does not exist or is inactive',
          },
        ],
        studentsToCreate: [],
        studentsToMatch: [],
        validRows: 0,
        invalidRows: rows.length,
        warningRows: 0,
        totalRows: rows.length,
      };
    }

    const seenShahvarCodesInFile = new Set<string>();
    let validRows = 0;
    let invalidRows = 0;
    let warningRows = 0;

    for (const row of rows) {
      const rowNum = row.rowNumber;
      const firstName = row.firstName?.trim() || '';
      const lastName = row.lastName?.trim() || '';
      const shahvarCode = row.shahvarStudentCode?.trim() || null;

      // Check required student name
      if (!firstName && !lastName) {
        results.push({
          rowNumber: rowNum,
          status: 'ERROR',
          message: 'Row is missing student name (both first and last name empty)',
        });
        invalidRows++;
        continue;
      }

      if (!lastName) {
        results.push({
          rowNumber: rowNum,
          status: 'ERROR',
          message: 'Row is missing student last name',
        });
        invalidRows++;
        continue;
      }

      // Check for duplicate Shahvar code in same file
      if (shahvarCode) {
        if (seenShahvarCodesInFile.has(shahvarCode)) {
          results.push({
            rowNumber: rowNum,
            status: 'ERROR',
            message: `Duplicate Shahvar student code "${shahvarCode}" encountered multiple times in the import file`,
          });
          invalidRows++;
          continue;
        }
        seenShahvarCodesInFile.add(shahvarCode);
      }

      // Check existing student in DB
      let matchedStudent: Student | null = null;
      if (shahvarCode) {
        const studentSearch = await this.studentRepo.findAll({ search: shahvarCode, pageSize: 5 });
        const exactMatch = studentSearch.items.find(
          (s) => s.shahvarCode && s.shahvarCode.toLowerCase() === shahvarCode.toLowerCase(),
        );
        if (exactMatch) {
          matchedStudent = exactMatch;
        }
      }

      if (matchedStudent) {
        studentsToMatch.push({
          studentId: matchedStudent.id,
          fullName: matchedStudent.fullName,
          shahvarCode: matchedStudent.shahvarCode,
        });

        // Check if name differs
        if (
          firstName &&
          lastName &&
          (matchedStudent.firstName.toLowerCase() !== firstName.toLowerCase() ||
            matchedStudent.lastName.toLowerCase() !== lastName.toLowerCase())
        ) {
          results.push({
            rowNumber: rowNum,
            status: 'WARNING',
            message: `Matched existing student by Shahvar code "${shahvarCode}" (${matchedStudent.fullName}), but row name is "${firstName} ${lastName}"`,
          });
          warningRows++;
          validRows++;
        } else {
          results.push({
            rowNumber: rowNum,
            status: 'SUCCESS',
            message: `Matched existing student "${matchedStudent.fullName}" (code: ${shahvarCode})`,
          });
          validRows++;
        }
      } else {
        // Will create new student
        studentsToCreate.push({
          firstName: firstName || 'Unknown',
          lastName,
          shahvarCode,
        });

        if (!shahvarCode) {
          results.push({
            rowNumber: rowNum,
            status: 'WARNING',
            message: `New student "${firstName} ${lastName}" will be created without a Shahvar code`,
          });
          warningRows++;
          validRows++;
        } else {
          results.push({
            rowNumber: rowNum,
            status: 'SUCCESS',
            message: `New student "${firstName} ${lastName}" ready for creation with code "${shahvarCode}"`,
          });
          validRows++;
        }
      }
    }

    return {
      results,
      studentsToCreate,
      studentsToMatch,
      validRows,
      invalidRows,
      warningRows,
      totalRows: rows.length,
    };
  }
}

import { Injectable, BadRequestException } from '@nestjs/common';
import * as XLSX from 'xlsx';
import type { IExcelParser, ParsedExcelSheet } from '../../domain/interfaces/excel-parser.interface';
import type { ShahvarRawRow } from '@edutech/shared';

@Injectable()
export class SheetJsExcelParserAdapter implements IExcelParser {
  private normalizePersianDigits(str: string): string {
    return str
      .replace(/[\u0660-\u0669]/g, (c) => (c.charCodeAt(0) - 0x0660).toString())
      .replace(/[\u06F0-\u06F9]/g, (c) => (c.charCodeAt(0) - 0x06F0).toString());
  }

  private normalizeHeader(header: string): string {
    return header
      .trim()
      .toLowerCase()
      .replace(/[\u200B-\u200D\uFEFF]/g, '') // remove zero-width characters
      .replace(/[آأإ]/g, 'ا')
      .replace(/ي/g, 'ی')
      .replace(/ك/g, 'ک')
      .replace(/ة/g, 'ه')
      .replace(/[_\s-]+/g, ' ');
  }

  parseBuffer(buffer: Buffer): ParsedExcelSheet {
    if (!buffer || buffer.length === 0) {
      throw new BadRequestException({
        code: 'INVALID_FILE',
        message: 'The uploaded file is empty.',
      });
    }

    let workbook: XLSX.WorkBook;
    try {
      workbook = XLSX.read(buffer, { type: 'buffer' });
    } catch {
      throw new BadRequestException({
        code: 'MALFORMED_EXCEL_FILE',
        message: 'Could not parse the uploaded file. Please ensure it is a valid Excel spreadsheet.',
      });
    }

    if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
      throw new BadRequestException({
        code: 'EMPTY_EXCEL_FILE',
        message: 'The Excel file contains no worksheets.',
      });
    }

    const firstSheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[firstSheetName];
    if (!sheet) {
      throw new BadRequestException({
        code: 'EMPTY_EXCEL_FILE',
        message: 'The primary worksheet is empty.',
      });
    }

    const rawRows: any[][] = XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      blankrows: false,
      defval: '',
    });

    if (!rawRows || rawRows.length < 2) {
      throw new BadRequestException({
        code: 'EMPTY_EXCEL_FILE',
        message: 'The Excel worksheet must contain a header row and at least one data row.',
      });
    }

    // Find header row (the first non-empty row)
    const rawHeaders = rawRows[0].map((h: any) => String(h || '').trim());
    const normalizedHeaders = rawHeaders.map((h) => this.normalizeHeader(h));

    // Column mapping indices
    let firstNameIdx = -1;
    let lastNameIdx = -1;
    let fullNameIdx = -1;
    let codeIdx = -1;
    let classNameIdx = -1;
    let bookNameIdx = -1;
    let levelIdx = -1;

    for (let i = 0; i < normalizedHeaders.length; i++) {
      const h = normalizedHeaders[i];
      if (!h) continue;

      if (h === 'نام' || h === 'first name' || h === 'firstname' || h === 'first_name') {
        firstNameIdx = i;
      } else if (
        h === 'نام خانوادگی' ||
        h === 'فامیلی' ||
        h === 'نام خانوادگي' ||
        h === 'last name' ||
        h === 'lastname' ||
        h === 'last_name' ||
        h === 'surname'
      ) {
        lastNameIdx = i;
      } else if (
        h === 'نام و نام خانوادگی' ||
        h === 'نام و نام خانوادگي' ||
        h === 'نام و نامخانوادگی' ||
        h === 'نام کامل' ||
        h === 'full name' ||
        h === 'fullname' ||
        h === 'name'
      ) {
        fullNameIdx = i;
      } else if (
        h === 'کد زبان آموز' ||
        h === 'کد زباناموز' ||
        h === 'کد فراگیر' ||
        h === 'کد دانش آموز' ||
        h === 'کد دانشآموز' ||
        h === 'کد زبان‌آموز' ||
        h === 'کد دانش‌آموز' ||
        h === 'کد ملی' ||
        h === 'کد' ||
        h === 'student code' ||
        h === 'studentcode' ||
        h === 'student_code' ||
        h === 'student id' ||
        h === 'code'
      ) {
        codeIdx = i;
      } else if (
        h === 'کلاس' ||
        h === 'نام کلاس' ||
        h === 'class' ||
        h === 'class name' ||
        h === 'classname'
      ) {
        classNameIdx = i;
      } else if (h === 'کتاب' || h === 'دوره' || h === 'book' || h === 'course') {
        bookNameIdx = i;
      } else if (h === 'سطح' || h === 'level') {
        levelIdx = i;
      }
    }

    // Verify required header structure
    const hasNameColumn = (firstNameIdx !== -1 && lastNameIdx !== -1) || fullNameIdx !== -1;
    const hasCodeColumn = codeIdx !== -1;

    if (!hasNameColumn && !hasCodeColumn) {
      throw new BadRequestException({
        code: 'INVALID_EXCEL_COLUMNS',
        message:
          'Excel file is missing required columns. It must contain student name columns (نام, نام خانوادگی) or a student code column (کد زبان‌آموز).',
      });
    }

    const rows: ShahvarRawRow[] = [];

    for (let r = 1; r < rawRows.length; r++) {
      const rowData = rawRows[r];
      if (!rowData || rowData.length === 0) continue;

      let firstName: string | null = null;
      let lastName: string | null = null;

      if (firstNameIdx !== -1 && rowData[firstNameIdx] !== undefined) {
        firstName = String(rowData[firstNameIdx]).trim() || null;
      }
      if (lastNameIdx !== -1 && rowData[lastNameIdx] !== undefined) {
        lastName = String(rowData[lastNameIdx]).trim() || null;
      }

      // If combined full name was provided and separate first/last names were not
      if (!firstName && !lastName && fullNameIdx !== -1 && rowData[fullNameIdx] !== undefined) {
        const full = String(rowData[fullNameIdx]).trim();
        if (full) {
          const parts = full.split(/\s+/);
          if (parts.length > 1) {
            firstName = parts[0];
            lastName = parts.slice(1).join(' ');
          } else {
            firstName = 'Unknown';
            lastName = full;
          }
        }
      }

      let shahvarStudentCode: string | null = null;
      if (codeIdx !== -1 && rowData[codeIdx] !== undefined) {
        const rawCode = String(rowData[codeIdx]).trim();
        if (rawCode) {
          shahvarStudentCode = this.normalizePersianDigits(rawCode);
        }
      }

      let shahvarClassName: string | null = null;
      if (classNameIdx !== -1 && rowData[classNameIdx] !== undefined) {
        shahvarClassName = String(rowData[classNameIdx]).trim() || null;
      }

      let bookName: string | null = null;
      if (bookNameIdx !== -1 && rowData[bookNameIdx] !== undefined) {
        bookName = String(rowData[bookNameIdx]).trim() || null;
      }

      let bookLevel: string | null = null;
      if (levelIdx !== -1 && rowData[levelIdx] !== undefined) {
        bookLevel = String(rowData[levelIdx]).trim() || null;
      }

      // Skip completely empty rows
      if (!firstName && !lastName && !shahvarStudentCode && !shahvarClassName) {
        continue;
      }

      rows.push({
        rowNumber: r, // 1-based data row number
        firstName,
        lastName,
        shahvarStudentCode,
        shahvarClassName,
        bookName,
        bookLevel,
      });
    }

    if (rows.length === 0) {
      throw new BadRequestException({
        code: 'EMPTY_EXCEL_FILE',
        message: 'No valid data rows found in the Excel worksheet.',
      });
    }

    return {
      sheetName: firstSheetName,
      totalRows: rows.length,
      rows,
      detectedColumns: rawHeaders.filter(Boolean),
    };
  }
}

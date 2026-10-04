import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';
import { SheetJsExcelParserAdapter } from '../../apps/api/src/imports/infrastructure/adapters/sheetjs-excel-parser.adapter';

describe('Excel Parser Adapter (SheetJS) Unit Tests', () => {
  const parser = new SheetJsExcelParserAdapter();

  function createExcelBuffer(headers: string[], rows: any[][]): Buffer {
    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'ShahvarData');
    return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  }

  it('1. Successfully parses Persian headers and normalizes Persian numerals', () => {
    const headers = [
      'نام',
      'نام خانوادگی',
      'کد زبان‌آموز',
      'کلاس',
      'شهریه',
      'تخفیف',
      'تلفن',
      'سن',
    ];
    const data = [
      ['علی', 'احمدی', 'SH-۱۲۳۴', 'کلاس مقدماتی', '500000', '10%', '09123456789', '25'],
      ['سارا', 'رضایی', 'SH-۵۶۷۸', 'کلاس مقدماتی', '500000', '0%', '09987654321', '22'],
    ];

    const buffer = createExcelBuffer(headers, data);
    const result = parser.parseBuffer(buffer);

    assert.equal(result.totalRows, 2);
    assert.equal(result.rows.length, 2);

    // Row 1
    assert.equal(result.rows[0].firstName, 'علی');
    assert.equal(result.rows[0].lastName, 'احمدی');
    assert.equal(result.rows[0].shahvarStudentCode, 'SH-1234'); // Persian digits normalized
    assert.equal(result.rows[0].shahvarClassName, 'کلاس مقدماتی');

    // Row 2
    assert.equal(result.rows[1].firstName, 'سارا');
    assert.equal(result.rows[1].lastName, 'رضایی');
    assert.equal(result.rows[1].shahvarStudentCode, 'SH-5678'); // Persian digits normalized

    // Verify financial, phone, and age fields are not present in the normalized row object
    assert.equal((result.rows[0] as any).tuition, undefined);
    assert.equal((result.rows[0] as any).discount, undefined);
    assert.equal((result.rows[0] as any).phone, undefined);
    assert.equal((result.rows[0] as any).age, undefined);
  });

  it('2. Successfully parses English headers and splits combined full name when necessary', () => {
    const headers = ['Full Name', 'Student Code', 'Book', 'Level'];
    const data = [
      ['David Miller', 'ST-9001', 'English Today 1', 'A1'],
      ['Mary', 'ST-9002', 'English Today 1', 'A1'],
    ];

    const buffer = createExcelBuffer(headers, data);
    const result = parser.parseBuffer(buffer);

    assert.equal(result.totalRows, 2);
    assert.equal(result.rows[0].firstName, 'David');
    assert.equal(result.rows[0].lastName, 'Miller');
    assert.equal(result.rows[0].shahvarStudentCode, 'ST-9001');

    assert.equal(result.rows[1].firstName, 'Unknown');
    assert.equal(result.rows[1].lastName, 'Mary');
    assert.equal(result.rows[1].shahvarStudentCode, 'ST-9002');
  });

  it('3. Rejects empty buffer and malformed file buffer', () => {
    assert.throws(() => parser.parseBuffer(Buffer.alloc(0)), {
      name: 'BadRequestException',
    });

    assert.throws(() => parser.parseBuffer(Buffer.from('not a valid excel file')), {
      name: 'BadRequestException',
    });
  });

  it('4. Rejects worksheet with missing required student identification columns', () => {
    const headers = ['کد کلاس', 'تاریخ شروع', 'مبلغ'];
    const data = [['C-100', '2026-09-01', '500000']];

    const buffer = createExcelBuffer(headers, data);
    assert.throws(() => parser.parseBuffer(buffer), {
      name: 'BadRequestException',
    });
  });
});

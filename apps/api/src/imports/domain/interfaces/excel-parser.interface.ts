import type { ShahvarRawRow } from '@edutech/shared';

export interface ParsedExcelSheet {
  sheetName: string;
  totalRows: number;
  rows: ShahvarRawRow[];
  detectedColumns: string[];
}

export interface IExcelParser {
  parseBuffer(buffer: Buffer): ParsedExcelSheet;
}

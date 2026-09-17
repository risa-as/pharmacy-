"use client";

import ExcelJS from "exceljs";

export type ExcelSheet = { name: string; rows: Array<Array<string | number | boolean | Date | null | undefined>>; widths?: number[] };

function cellValue(value: ExcelJS.CellValue): string | number | boolean | Date | null {
    if (value == null) return null;
    if (value instanceof Date || typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
    if (typeof value === "object" && "text" in value) return value.text ?? null;
    return String(value);
}

export async function readFirstSheetRows(buffer: ArrayBuffer): Promise<Array<Array<string | number | boolean | Date | null>>> {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);
    const sheet = workbook.worksheets[0];
    if (!sheet) return [];
    const rows: Array<Array<string | number | boolean | Date | null>> = [];
    sheet.eachRow({ includeEmpty: true }, (row) => {
        const values: Array<string | number | boolean | Date | null> = [];
        for (let column = 1; column <= sheet.columnCount; column++) values.push(cellValue(row.getCell(column).value));
        rows.push(values);
    });
    return rows;
}

export async function downloadWorkbook(filename: string, sheets: ExcelSheet[]): Promise<void> {
    const workbook = new ExcelJS.Workbook();
    for (const sheetData of sheets) {
        const sheet = workbook.addWorksheet(sheetData.name, { views: [{ rightToLeft: true }] });
        sheet.addRows(sheetData.rows);
        if (sheetData.widths) sheet.columns.forEach((column, index) => { column.width = sheetData.widths![index] ?? 14; });
    }
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
}

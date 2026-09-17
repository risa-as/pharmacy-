import ExcelJS from 'exceljs';

interface ExcelColumn {
    header: string;   // Arabic column header
    key: string;      // data key
    width?: number;   // column width in characters
}

/**
 * Export data to Excel file and trigger download.
 * Supports RTL and Arabic text.
 * 
 * @param data - Array of objects to export
 * @param columns - Column definitions (header, key, width)
 * @param filename - Filename without extension
 * @param sheetName - Optional sheet name (defaults to "Sheet1")
 */
export async function exportToExcel(
    data: Record<string, any>[],
    columns: ExcelColumn[],
    filename: string,
    sheetName: string = 'Sheet1'
) {
    // Prepare headers and rows
    const headers = columns.map((c: any) => c.header);
    const rows = data.map((row: any) =>
        columns.map((col: any) => {
            const value = row[col.key];
            // Format dates
            if (value instanceof Date) {
                return value.toLocaleDateString('ar-IQ', { timeZone: 'Asia/Baghdad' });
            }
            return value ?? '';
        })
    );

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet(sheetName);
    ws.views = [{ rightToLeft: true }];
    ws.addRows([headers, ...rows]);
    ws.columns = columns.map((col: any) => ({ header: col.header, key: col.key, width: col.width || Math.max(col.header.length * 2, 12) }));
    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a'); link.href = url; link.download = `${filename}.xlsx`; link.click();
    URL.revokeObjectURL(url);
}

/**
 * Export data with multiple sheets
 */
export async function exportToExcelMultiSheet(
    sheets: {
        name: string;
        data: Record<string, any>[];
        columns: ExcelColumn[];
    }[],
    filename: string
) {
    const wb = new ExcelJS.Workbook();

    for (const sheet of sheets) {
        const headers = sheet.columns.map((c: any) => c.header);
        const rows = sheet.data.map((row: any) =>
            sheet.columns.map((col: any) => {
                const value = row[col.key];
                if (value instanceof Date) {
                    return value.toLocaleDateString('ar-IQ', { timeZone: 'Asia/Baghdad' });
                }
                return value ?? '';
            })
        );

        const ws = wb.addWorksheet(sheet.name);
        ws.views = [{ rightToLeft: true }];
        ws.addRows([headers, ...rows]);
        ws.columns = sheet.columns.map((col: any) => ({ header: col.header, key: col.key, width: col.width || Math.max(col.header.length * 2, 12) }));
    }

    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a'); link.href = url; link.download = `${filename}.xlsx`; link.click();
    URL.revokeObjectURL(url);
}

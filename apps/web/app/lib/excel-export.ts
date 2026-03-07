import * as XLSX from 'xlsx';

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
export function exportToExcel(
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
                return value.toLocaleDateString('ar-IQ');
            }
            return value ?? '';
        })
    );

    // Create worksheet
    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);

    // Set column widths
    ws['!cols'] = columns.map((col: any) => ({
        wch: col.width || Math.max(col.header.length * 2, 12)
    }));

    // Set RTL
    ws['!dir'] = 'rtl' as any;

    // Create workbook
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, sheetName);

    // Download
    XLSX.writeFile(wb, `${filename}.xlsx`);
}

/**
 * Export data with multiple sheets
 */
export function exportToExcelMultiSheet(
    sheets: {
        name: string;
        data: Record<string, any>[];
        columns: ExcelColumn[];
    }[],
    filename: string
) {
    const wb = XLSX.utils.book_new();

    for (const sheet of sheets) {
        const headers = sheet.columns.map((c: any) => c.header);
        const rows = sheet.data.map((row: any) =>
            sheet.columns.map((col: any) => {
                const value = row[col.key];
                if (value instanceof Date) {
                    return value.toLocaleDateString('ar-IQ');
                }
                return value ?? '';
            })
        );

        const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
        ws['!cols'] = sheet.columns.map((col: any) => ({
            wch: col.width || Math.max(col.header.length * 2, 12)
        }));
        ws['!dir'] = 'rtl' as any;

        XLSX.utils.book_append_sheet(wb, ws, sheet.name);
    }

    XLSX.writeFile(wb, `${filename}.xlsx`);
}

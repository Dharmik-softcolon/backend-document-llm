import fs from "fs";
import { parse } from "csv-parse/sync";

export const parseCSV = async (filePath) => {
    try {
        if (!fs.existsSync(filePath)) {
            throw new Error(`File not found: ${filePath}`);
        }

        const fileContent = fs.readFileSync(filePath, 'utf-8');
        
        if (!fileContent || fileContent.trim().length === 0) {
            throw new Error("CSV file is empty");
        }

        const records = parse(fileContent, {
            columns: true,
            skip_empty_lines: true,
            trim: true,
            relax_column_count: true
        });

        if (!records || records.length === 0) {
            throw new Error("No data found in CSV file");
        }

        const pages = [];
        const headers = Object.keys(records[0]);
        
        records.forEach((row, index) => {
            const rowText = headers
                .map(header => {
                    const value = row[header] || '';
                    return `${header}: ${value}`;
                })
                .join(' | ');
            
            pages.push({
                page: index + 1,
                text: rowText,
                rowData: row
            });
        });

        return pages;
    } catch (error) {
        console.error("Error parsing CSV:", error);
        throw new Error(`Failed to parse CSV: ${error.message || "Unknown error"}`);
    }
};


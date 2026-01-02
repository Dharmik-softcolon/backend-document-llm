import fs from "fs";
import { parse } from "csv-parse/sync";

/**
 * Parse CSV file and extract data
 */
export async function parseCSV(filePath) {
    try {
        if (!fs.existsSync(filePath)) {
            throw new Error(`File not found: ${filePath}`);
        }

        const fileContent = fs.readFileSync(filePath, 'utf-8');
        
        if (!fileContent || fileContent.trim().length === 0) {
            throw new Error("CSV file is empty");
        }

        // Parse CSV with headers
        const records = parse(fileContent, {
            columns: true, // Use first line as headers
            skip_empty_lines: true,
            trim: true,
            relax_column_count: true
        });

        if (!records || records.length === 0) {
            throw new Error("No data found in CSV file");
        }

        // Convert CSV rows to text chunks
        const pages = [];
        const headers = Object.keys(records[0]);
        
        records.forEach((row, index) => {
            // Create a readable text representation of each row
            const rowText = headers
                .map(header => {
                    const value = row[header] || '';
                    return `${header}: ${value}`;
                })
                .join(' | ');
            
            pages.push({
                page: index + 1,
                text: rowText,
                rowData: row // Keep original row data for reference
            });
        });

        return pages;
    } catch (error) {
        console.error("Error parsing CSV:", error);
        throw new Error(`Failed to parse CSV: ${error.message || "Unknown error"}`);
    }
}


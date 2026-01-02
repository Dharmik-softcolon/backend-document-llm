import fs from "fs";
import pdf from "pdf-parse";

export async function extractPdfByPage(filePath) {
    const dataBuffer = fs.readFileSync(filePath);

    const pages = [];

    await pdf(dataBuffer, {
        pagerender: pageData => {
            return pageData.getTextContent().then(textContent => {
                const text = textContent.items
                    .map(item => item.str)
                    .join(" ");

                pages.push({
                    page: pageData.pageIndex + 1,
                    text
                });

                return text;
            });
        }
    });

    return pages; // [{ page, text }]
}

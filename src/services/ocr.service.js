import Tesseract from "tesseract.js";

export async function runOCR(imagePath) {
    const res = await Tesseract.recognize(imagePath, "eng");
    return res.data.text;
}

import multer from "multer";
import path from "path";
import fs from "fs";

const uploadDir = "uploads";
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir);
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueName = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
        cb(null, `${uniqueName}${path.extname(file.originalname)}`);
    }
});

export const upload = multer({
    storage,
    fileFilter: (req, file, cb) => {
        const ext = path.extname(file.originalname || "").toLowerCase();
        const isPdfByExt = ext === ".pdf";
        const isPdfByMime = (file.mimetype || "").toLowerCase() === "application/pdf";
        const isTxtByExt = ext === ".txt";
        const isTxtByMime = (file.mimetype || "").toLowerCase() === "text/plain";

        if (isPdfByExt || isPdfByMime || isTxtByExt || isTxtByMime) {
            return cb(null, true);
        }

        return cb(new Error("Only PDF and TXT files are allowed"), false);
    }
});

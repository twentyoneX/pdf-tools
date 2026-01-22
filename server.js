const express = require('express');
const multer = require('multer');
const { exec } = require('child_process');
const fs = require('fs');
const cors = require('cors');

const app = express();
// Configure multer to keep the original file extension so pdftk recognizes it
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/')
  },
  filename: function (req, file, cb) {
    // Generate unique name but keep .pdf extension
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9)
    cb(null, file.fieldname + '-' + uniqueSuffix + '.pdf')
  }
})
const upload = multer({ storage: storage });

app.use(cors());

// Ensure uploads directory exists
if (!fs.existsSync('uploads')){
    fs.mkdirSync('uploads');
}

app.post('/protect', upload.single('pdf'), (req, res) => {
    // 1. Validation
    if (!req.file) return res.status(400).send('No file uploaded');
    if (!req.body.password) {
        cleanup([req.file.path]);
        return res.status(400).send('No password provided');
    }

    const inputPath = req.file.path;
    const outputPath = `uploads/protected_${req.file.filename}`;
    
    // Sanitize password (basic quote escape)
    const password = req.body.password.replace(/"/g, '\\"');

    // 2. Run PDFtk Command
    // FIX: We ONLY provide user_pw. pdftk handles the rest. 
    // Providing identical user_pw and owner_pw causes a crash.
    const command = `pdftk "${inputPath}" output "${outputPath}" user_pw "${password}"`;

    console.log("Processing file:", inputPath);

    exec(command, (error, stdout, stderr) => {
        if (error) {
            console.error(`Exec error: ${error}`);
            console.error(`Stderr: ${stderr}`);
            cleanup([inputPath]); 
            return res.status(500).send('Encryption failed on server');
        }

        // 3. Send file back
        res.download(outputPath, 'protected.pdf', (err) => {
            if (err) console.error("Download error:", err);
            // 4. Cleanup
            cleanup([inputPath, outputPath]);
        });
    });
});

function cleanup(filePaths) {
    filePaths.forEach(path => {
        if (fs.existsSync(path)) {
            try { fs.unlinkSync(path); } catch(e) { console.error("Delete error:", e); }
        }
    });
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

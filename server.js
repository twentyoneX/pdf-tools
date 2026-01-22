const express = require('express');
const multer = require('multer');
const { exec } = require('child_process');
const fs = require('fs');
const cors = require('cors');

const app = express();
const upload = multer({ dest: 'uploads/' });

// Allow your Blogspot to talk to this server
app.use(cors());

// The Protect Endpoint
app.post('/protect', upload.single('pdf'), (req, res) => {
    // 1. Validation
    if (!req.file) return res.status(400).send('No file uploaded');
    if (!req.body.password) return res.status(400).send('No password provided');

    const inputPath = req.file.path;
    const outputPath = `uploads/protected_${req.file.filename}.pdf`;
    // Sanitize password to prevent command injection (basic)
    const password = req.body.password.replace(/"/g, '\\"');

    // 2. Run PDFtk Command
    // user_pw = password to open, owner_pw = password to edit
    const command = `pdftk "${inputPath}" output "${outputPath}" user_pw "${password}" owner_pw "${password}"`;

    exec(command, (error, stdout, stderr) => {
        if (error) {
            console.error(`Exec error: ${error}`);
            cleanup([inputPath]); // Delete upload on fail
            return res.status(500).send('Encryption failed');
        }

        // 3. Send file back to user
        res.download(outputPath, 'protected.pdf', (err) => {
            // 4. Cleanup: Delete both files immediately after sending
            cleanup([inputPath, outputPath]);
        });
    });
});

// Helper to delete files
function cleanup(filePaths) {
    filePaths.forEach(path => {
        if (fs.existsSync(path)) {
            try { fs.unlinkSync(path); } catch(e) { console.error(e); }
        }
    });
}

// Start Server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

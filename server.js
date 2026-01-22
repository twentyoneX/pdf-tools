const express = require('express');
const multer = require('multer');
const { exec } = require('child_process');
const fs = require('fs');
const cors = require('cors');
const path = require('path');

const app = express();

const storage = multer.diskStorage({
  destination: 'uploads/',
  filename: function (req, file, cb) {
    cb(null, 'input-' + Date.now() + '.pdf')
  }
})
const upload = multer({ storage: storage });

app.use(cors());

if (!fs.existsSync('uploads')){
    fs.mkdirSync('uploads');
}

// Helper to delete files
function cleanup(files) {
    files.forEach(f => {
        if (fs.existsSync(f)) {
            try { fs.unlinkSync(f); } catch(e) {}
        }
    });
}

// --- 1. PROTECT ENDPOINT (Encryption) ---
app.post('/protect', upload.single('pdf'), (req, res) => {
    if (!req.file || !req.body.password) return res.status(400).send('Missing data');

    const inputPath = req.file.path;
    const outputPath = `uploads/protected-${Date.now()}.pdf`;
    const userPassword = req.body.password.replace(/"/g, '\\"');
    const ownerPassword = userPassword + "_ADMIN_" + Math.random().toString(36).substring(7);

    // Use different owner_pw to allow setting permissions
    const command = `pdftk "${inputPath}" output "${outputPath}" user_pw "${userPassword}" owner_pw "${ownerPassword}"`;

    exec(command, (error, stdout, stderr) => {
        if (error) {
            console.error("Protect Error:", stderr);
            cleanup([inputPath, outputPath]);
            return res.status(500).send('Encryption failed');
        }
        res.download(outputPath, 'protected.pdf', () => cleanup([inputPath, outputPath]));
    });
});

// --- 2. UNLOCK ENDPOINT (Decryption) ---
app.post('/unlock', upload.single('pdf'), (req, res) => {
    if (!req.file || !req.body.password) return res.status(400).send('Missing data');

    const inputPath = req.file.path;
    const outputPath = `uploads/unlocked-${Date.now()}.pdf`;
    // Escape quotes for safety
    const password = req.body.password.replace(/"/g, '\\"');

    // "input_pw" tells pdftk the password to open the file
    // "output" without flags removes the encryption
    const command = `pdftk "${inputPath}" input_pw "${password}" output "${outputPath}"`;

    exec(command, (error, stdout, stderr) => {
        if (error) {
            // Usually happens if password is wrong
            console.error("Unlock Error:", stderr);
            cleanup([inputPath, outputPath]);
            return res.status(403).send('Incorrect password or decryption failed');
        }
        res.download(outputPath, 'unlocked.pdf', () => cleanup([inputPath, outputPath]));
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

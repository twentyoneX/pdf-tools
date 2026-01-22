const express = require('express');
const multer = require('multer');
const { exec } = require('child_process');
const fs = require('fs');
const cors = require('cors');

const app = express();

const storage = multer.diskStorage({
  destination: 'uploads/',
  filename: function (req, file, cb) {
    cb(null, 'input-' + Date.now() + '.pdf')
  }
})
const upload = multer({ storage: storage });

app.use(cors());

if (!fs.existsSync('uploads')){ fs.mkdirSync('uploads'); }

function cleanup(files) {
    files.forEach(f => {
        if (fs.existsSync(f)) { try { fs.unlinkSync(f); } catch(e) {} }
    });
}

// PROTECT (Encrypt)
app.post('/protect', upload.single('pdf'), (req, res) => {
    if (!req.file || !req.body.password) return res.status(400).send('Missing data');
    const input = req.file.path;
    const output = `uploads/protected-${Date.now()}.pdf`;
    const userPw = req.body.password.replace(/"/g, '\\"');
    const ownerPw = userPw + "_ADMIN_" + Math.random().toString(36).substring(7);

    const cmd = `pdftk "${input}" output "${output}" user_pw "${userPw}" owner_pw "${ownerPw}"`;

    exec(cmd, (err) => {
        if (err) { cleanup([input, output]); return res.status(500).send('Error'); }
        res.download(output, 'protected.pdf', () => cleanup([input, output]));
    });
});

// UNLOCK (Decrypt)
app.post('/unlock', upload.single('pdf'), (req, res) => {
    if (!req.file) return res.status(400).send('Missing file');

    const input = req.file.path;
    const output = `uploads/unlocked-${Date.now()}.pdf`;
    const password = req.body.password ? req.body.password.replace(/"/g, '\\"') : '';

    // LOGIC: If password provided, use input_pw. If not, try stripping permissions directly.
    let cmd;
    if (password) {
        cmd = `pdftk "${input}" input_pw "${password}" output "${output}"`;
    } else {
        // Attempt to remove owner restrictions (printing/copying) without password
        cmd = `pdftk "${input}" output "${output}"`;
    }

    exec(cmd, (err) => {
        if (err) {
            cleanup([input, output]);
            // If they didn't provide a password and it failed, it means there IS a user password
            if (!password) return res.status(403).send('File is User-Locked. Password required.');
            return res.status(403).send('Incorrect password.');
        }
        res.download(output, 'unlocked.pdf', () => cleanup([input, output]));
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

const express = require("express");
const multer = require("multer");
const { execFile } = require("child_process");
const fs = require("fs");
const cors = require("cors");
const puppeteer = require("puppeteer");

const app = express();

app.use(cors({
  origin: ["https://www.peekmyip.com", "https://peekmyip.com"],
  methods: ["GET", "POST"]
}));
app.use(express.json({ limit: "1mb" }));

if (!fs.existsSync("uploads")) fs.mkdirSync("uploads");

const storage = multer.diskStorage({
  destination: "uploads/",
  filename: function (_req, _file, cb) {
    cb(null, "input-" + Date.now() + ".pdf");
  }
});
const upload = multer({ storage });

function cleanup(files) {
  files.forEach((f) => {
    if (fs.existsSync(f)) {
      try { fs.unlinkSync(f); } catch (_) {}
    }
  });
}

function runPdftk(args) {
  return new Promise((resolve, reject) => {
    execFile("pdftk", args, (err) => {
      if (err) return reject(err);
      resolve();
    });
  });
}

function normalizeUrl(raw) {
  const input = (raw || "").trim();
  if (!input) return null;
  const prefixed = /^https?:\/\//i.test(input) ? input : `https://${input}`;

  try {
    const u = new URL(prefixed);
    if (!["http:", "https:"].includes(u.protocol)) return null;
    return u.toString();
  } catch {
    return null;
  }
}

app.get("/", (_req, res) => res.status(200).send("ok"));
app.get("/health", (_req, res) => res.status(200).send("ok"));

// PROTECT (Encrypt)
app.post("/protect", upload.single("pdf"), async (req, res) => {
  if (!req.file || !req.body.password) return res.status(400).send("Missing data");

  const input = req.file.path;
  const output = `uploads/protected-${Date.now()}.pdf`;
  const userPw = String(req.body.password);
  const ownerPw = `${userPw}_ADMIN_${Math.random().toString(36).slice(2, 9)}`;

  try {
    await runPdftk([input, "output", output, "user_pw", userPw, "owner_pw", ownerPw]);
    return res.download(output, "protected.pdf", () => cleanup([input, output]));
  } catch {
    cleanup([input, output]);
    return res.status(500).send("Error");
  }
});

// UNLOCK (Decrypt)
app.post("/unlock", upload.single("pdf"), async (req, res) => {
  if (!req.file) return res.status(400).send("Missing file");

  const input = req.file.path;
  const output = `uploads/unlocked-${Date.now()}.pdf`;
  const password = req.body.password ? String(req.body.password) : "";

  try {
    if (password) {
      await runPdftk([input, "input_pw", password, "output", output]);
    } else {
      await runPdftk([input, "output", output]);
    }
    return res.download(output, "unlocked.pdf", () => cleanup([input, output]));
  } catch {
    cleanup([input, output]);
    if (!password) return res.status(403).send("File is User-Locked. Password required.");
    return res.status(403).send("Incorrect password.");
  }
});

// URL -> PDF
app.post("/url2pdf", async (req, res) => {
  const targetUrl = normalizeUrl(req.body?.url);
  if (!targetUrl) return res.status(400).send("Invalid URL");

  let browser;
  try {
    browser = await puppeteer.launch({
      headless: "new",
      args: ["--no-sandbox", "--disable-setuid-sandbox"]
    });

    const page = await browser.newPage();
    await page.goto(targetUrl, { waitUntil: "networkidle2", timeout: 120000 });

    const pdfBuffer = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "12mm", right: "10mm", bottom: "12mm", left: "10mm" }
    });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", 'attachment; filename="webpage.pdf"');
    return res.status(200).send(pdfBuffer);
  } catch (e) {
    return res.status(500).send(`Conversion failed: ${e.message}`);
  } finally {
    if (browser) {
      try { await browser.close(); } catch (_) {}
    }
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

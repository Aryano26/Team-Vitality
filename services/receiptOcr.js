/**
 * Receipt OCR using direct Tesseract binary invocation.
 * Windows-safe. No PATH dependency. No node-tesseract-ocr.
 */

const { spawn } = require("child_process");
const fs = require("fs");

const TESSERACT_PATH =
  process.env.TESSERACT_PATH ||
  "C:\\Program Files\\Tesseract-OCR\\tesseract.exe";

/**
 * Run tesseract directly and return OCR text
 */
function runTesseract(imagePath) {
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(TESSERACT_PATH)) {
      return reject(
        new Error(`Tesseract not found at: ${TESSERACT_PATH}`)
      );
    }

    const tesseract = spawn(
      TESSERACT_PATH,
      [imagePath, "stdout", "-l", "eng"],
      { windowsHide: true }
    );

    let output = "";
    let error = "";

    tesseract.stdout.on("data", data => {
      output += data.toString();
    });

    tesseract.stderr.on("data", data => {
      error += data.toString();
    });

    tesseract.on("close", code => {
      if (code !== 0) {
        reject(
          new Error(`Tesseract exited with code ${code}: ${error}`)
        );
      } else {
        resolve(output);
      }
    });
  });
}

/**
 * Parse amount from OCR text
 */
function parseAmountFromText(text) {
  if (!text) return null;

  const normalized = text.replace(/,/g, ".");
  const matches = normalized.match(/[\d]+[.]\d{2}/g);

  if (!matches || matches.length === 0) return null;

  return Math.max(...matches.map(Number));
}

/**
 * Extract description
 */
function parseDescriptionFromText(text) {
  if (!text) return "Receipt scan";

  const lines = text
    .split("\n")
    .map(l => l.trim())
    .filter(l => l.length > 3);

  const skip = /^(total|amount|balance|date|time|subtotal|tax)/i;

  for (const line of lines) {
    if (!skip.test(line) && line.length < 80) {
      return line;
    }
  }

  return "Receipt scan";
}

/**
 * Main OCR API
 */
async function extractFromImage(imagePath) {
  const rawText = await runTesseract(imagePath);

  const amount = parseAmountFromText(rawText);
  if (!amount) {
    throw new Error("Failed to extract amount from receipt");
  }

  return {
    amount: Math.round(amount * 100) / 100,
    description: parseDescriptionFromText(rawText),
    rawText: rawText.slice(0, 500),
  };
}

module.exports = {
  extractFromImage,
};

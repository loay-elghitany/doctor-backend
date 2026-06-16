#!/usr/bin/env node
import "dotenv/config";
import fs from "fs";
import util from "util";

// Load raw token
const raw = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || "";

// Aggressive sanitization: strip BOM, common control chars (CR, LF, TAB, NUL, VT, FF), then trim
const sanitizeKey = (k) =>
  String(k)
    .replace(/^\uFEFF+/, "")
    .replace(/[\r\n\t\0\x0B\x0C]/g, "")
    .trim();

const sanitized = sanitizeKey(raw);

// Helper to show hex bytes for debugging invisible chars
const toHex = (s) =>
  Array.from(s)
    .map((c) => c.charCodeAt(0).toString(16).padStart(2, "0"))
    .join(" ");

console.log("Raw length:", raw.length);
console.log("Raw (JSON):", JSON.stringify(raw));
console.log("Raw (hex):", toHex(raw));
console.log("Sanitized length:", sanitized.length);
console.log("Sanitized (JSON):", JSON.stringify(sanitized));
console.log("Sanitized (hex):", toHex(sanitized));

// If no key, exit with helpful message
if (!sanitized) {
  console.error(
    "\nNo GEMINI_API_KEY / GOOGLE_API_KEY found after sanitization.",
  );
  process.exit(2);
}

// Perform a minimal test request using global fetch. This will call the public Generative Language REST endpoint.
// NOTE: Running this will make a network request to Google's API using your key. Adjust the endpoint or body
// if you prefer to only validate the key (e.g., use a locally mocked endpoint).

const endpoint = `https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=${encodeURIComponent(
  sanitized,
)}`;

const body = {
  // Minimal prompt. Keep tiny to avoid charges. Some endpoints may require specific shape.
  prompt: { text: "Say hello" },
  temperature: 0,
  candidateCount: 1,
};

(async () => {
  try {
    console.log("\nSending test request to Google Generative API...");

    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    console.log("HTTP status:", res.status);

    const text = await res.text();
    try {
      const json = JSON.parse(text);
      console.log("Response JSON:", util.inspect(json, { depth: 2 }));
    } catch (e) {
      console.log("Response text:", text.slice(0, 1000));
    }

    if (res.ok) {
      console.log("\nSanitized key appears valid (status OK).");
      process.exit(0);
    } else {
      console.error(
        "\nKey test failed. Check response above for error details.",
      );
      // Exit with non-zero to indicate failure
      process.exit(3);
    }
  } catch (err) {
    console.error("Fetch error:", err);
    process.exit(4);
  }
})();

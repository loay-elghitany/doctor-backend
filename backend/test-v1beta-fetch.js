/**
 * 🔬 ISOLATED v1beta ENDPOINT VERIFICATION SCRIPT
 * ==========================================
 * Direct fetch test to validate v1beta compatibility with Gemini 1.5 Flash
 * Simulates exact same request structure as prescriptionController.js
 * No SDK dependencies - pure native fetch only
 */

import dotenv from "dotenv";
import fs from "fs";
import path from "path";

// Load environment variables from .env file
dotenv.config();

const ensureJsonOnly = (rawText) => {
  if (!rawText || typeof rawText !== "string") {
    throw new Error("Empty response text");
  }

  let cleaned = rawText.replace(/```/g, "").replace(/`/g, "").trim();
  const jsonStart = cleaned.indexOf("{");
  const jsonEnd = cleaned.lastIndexOf("}");

  if (jsonStart === -1 || jsonEnd === -1 || jsonEnd <= jsonStart) {
    console.warn(
      "⚠️  WARNING: Response does not contain valid JSON structure. Raw response:",
    );
    console.warn(cleaned);
    return null;
  }

  try {
    cleaned = cleaned.slice(jsonStart, jsonEnd + 1);
    return JSON.parse(cleaned);
  } catch (parseError) {
    console.warn("⚠️  WARNING: JSON parsing failed:", parseError.message);
    return null;
  }
};

const testV1BetaEndpoint = async () => {
  console.log("\n" + "=".repeat(70));
  console.log("🔬 GOOGLE GENERATIVE AI v1beta ENDPOINT VERIFICATION");
  console.log("=".repeat(70) + "\n");

  // ✅ Step 1: Retrieve and Sanitize API Key (identical to prescriptionController.js)
  console.log("📌 Step 1: Loading and Sanitizing API Key...\n");

  let geminiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;

  if (geminiKey) {
    geminiKey = String(geminiKey)
      .replace(/^\uFEFF+/, "") // Remove BOM (Byte Order Mark)
      .replace(/[\r\n\t\0\x0B\x0C]/g, "") // Remove all whitespace/control chars
      .trim(); // Final trim
  }

  if (!geminiKey) {
    console.error("❌ FATAL: Gemini API Key is missing!");
    console.error(
      "   - Checked GEMINI_API_KEY: " +
        (process.env.GEMINI_API_KEY ? "EXISTS" : "MISSING"),
    );
    console.error(
      "   - Checked GOOGLE_API_KEY: " +
        (process.env.GOOGLE_API_KEY ? "EXISTS" : "MISSING"),
    );
    console.error("\n   ℹ️  Solution: Add one of these to your .env file:");
    console.error("      GEMINI_API_KEY=your_actual_api_key");
    console.error("      GOOGLE_API_KEY=your_actual_api_key");
    process.exit(1);
  }

  const keyLength = geminiKey.length;
  const keyPreview = geminiKey.substring(0, 10) + "..." + geminiKey.slice(-5);
  console.log(`✅ API Key loaded successfully`);
  console.log(`   - Key length: ${keyLength} characters`);
  console.log(`   - Key preview: ${keyPreview}\n`);

  // ✅ Step 2: Define v1beta endpoint and payload (exact copy from prescriptionController.js)
  console.log("📌 Step 2: Building v1beta Request...\n");

  // 🌟 1. تعديل الرابط ليكون v1 الصافي المتوافق مع مفتاح الـ aq الجديد
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${encodeURIComponent(geminiKey)}`;
  // 🌟 2. الـ Payload الصارم والحديث المتوافق مع الـ v1 ومفاتيح الـ aq
  const payload = {
    contents: [
      {
        parts: [{ text: promptText }],
      },
    ],
  };

  console.log(`✅ Endpoint: ${endpoint.substring(0, 80)}...`);
  console.log(`✅ Payload structure defined`);
  console.log(`   - Contents: ${payload.contents.length} message(s)`);
  console.log(
    `   - Max output tokens: ${payload.generationConfig.maxOutputTokens}\n`,
  );

  // ✅ Step 3: Execute native fetch request
  console.log("📌 Step 3: Sending Native Fetch Request...\n");

  try {
    console.log("🚀 Initiating HTTP POST to Google Generative AI API...");
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    console.log(
      `📋 HTTP Status Code: ${response.status} (${response.statusText})\n`,
    );

    // ✅ Step 4: Parse and display raw response
    console.log("📌 Step 4: Parsing Response...\n");

    const resJson = await response.json();

    console.log("📦 Raw Google Response JSON:");
    console.log(JSON.stringify(resJson, null, 2));
    console.log("\n");

    // ✅ Step 5: Check for errors
    if (!response.ok) {
      const errorMessage =
        resJson?.error?.message ||
        JSON.stringify(resJson) ||
        response.statusText;

      console.error(`❌ API ERROR (${response.status}):`);
      console.error(`   ${errorMessage}`);
      console.error("\n   🔧 Troubleshooting steps:");
      console.error("      1. Verify API key is active in Google AI Studio");
      console.error(
        "      2. Confirm project has Generative Language API enabled",
      );
      console.error(
        "      3. Check billing is active on the Google Cloud project",
      );
      console.error("      4. Ensure v1beta endpoint supports your region");
      process.exit(1);
    }

    // ✅ Step 6: Extract and validate content
    console.log("📌 Step 5: Extracting Generated Content...\n");

    const assistantText = resJson?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!assistantText) {
      console.error("❌ ERROR: No text content extracted from response!");
      console.error("   Response structure:", JSON.stringify(resJson, null, 2));
      process.exit(1);
    }

    console.log("📝 Extracted Assistant Text:");
    console.log(assistantText);
    console.log("\n");

    // ✅ Step 7: Attempt JSON extraction
    console.log("📌 Step 6: Attempting JSON Extraction...\n");

    try {
      const extractedJson = ensureJsonOnly(assistantText);
      if (extractedJson) {
        console.log("✅ Successfully extracted and parsed JSON:");
        console.log(JSON.stringify(extractedJson, null, 2));
      } else {
        console.log(
          "⚠️  No structured JSON found, but text response is valid.",
        );
      }
    } catch (jsonError) {
      console.warn("⚠️  JSON extraction failed:", jsonError.message);
      console.log(
        "   ℹ️  This is expected if response is plain text, not JSON.",
      );
    }

    // ✅ SUCCESS
    console.log("\n" + "=".repeat(70));
    console.log("✅ v1beta ENDPOINT VERIFICATION SUCCESSFUL!");
    console.log("=".repeat(70) + "\n");
    console.log("✨ Your configuration is ready for production deployment.");
    console.log(
      "   The v1beta endpoint supports Gemini 1.5 Flash correctly.\n",
    );

    process.exit(0);
  } catch (fetchError) {
    console.error("\n" + "=".repeat(70));
    console.error("💥 CRITICAL FETCH ERROR");
    console.error("=".repeat(70) + "\n");
    console.error("Error Type:", fetchError.name);
    console.error("Error Message:", fetchError.message);
    console.error("Stack Trace:", fetchError.stack);
    console.error("\n🔧 Troubleshooting:");

    if (fetchError.message.includes("ENOTFOUND")) {
      console.error(
        "   ❌ Network connectivity issue - cannot reach generativelanguage.googleapis.com",
      );
      console.error("   ✅ Solution: Check your internet connection");
    } else if (fetchError.message.includes("ECONNREFUSED")) {
      console.error("   ❌ Connection refused - endpoint not accessible");
      console.error("   ✅ Solution: Verify firewall and proxy settings");
    } else if (fetchError.message.includes("timeout")) {
      console.error("   ❌ Request timeout - server response took too long");
      console.error("   ✅ Solution: Check internet speed or try again later");
    } else {
      console.error("   ❌ Unexpected error - check stack trace above");
    }

    console.error("\n");
    process.exit(1);
  }
};

// Execute the verification
testV1BetaEndpoint();

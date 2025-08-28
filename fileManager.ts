// src/fileManager.ts
import fs from "fs";
import path from "path";

// --- Settings
const BASE_DIR = path.join(process.cwd(), "chat_files");

// --- Function 1: Ensure folder exists, create/check file, and append first message
export function checkOrCreateFile(
  filename: string,
  message: string,
  userType: "user" | "system" | "assistant"
): boolean {
  // Step 1: Create folder if it doesn't exist
  if (!fs.existsSync(BASE_DIR)) {
    fs.mkdirSync(BASE_DIR, { recursive: true });
    console.log(`📂 Folder created at: ${BASE_DIR}`);
  }

  // Step 2: Determine file path
  const filePath = path.join(BASE_DIR, `${filename}.txt`);

  // Step 3: Check if file exists
  if (fs.existsSync(filePath)) {
    return false; // file already exists
  }

  // Step 4: Create file and append first message
  fs.writeFileSync(filePath, `${userType} : ${message}\n`, "utf-8");
  console.log(`✅ File created and message appended: ${filePath}`);

  return true; // file created
}

// --- Function 2: Append message to existing file
export function appendMessageToFile(
  filename: string,
  message: string,
  userType: "user" | "system"
): void {
  const filePath = path.join(BASE_DIR, `${filename}.txt`);

  // Ensure file exists
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, "", "utf-8");
  }

  // Append message
  const content = `${userType} : ${message}\n`;
  fs.appendFileSync(filePath, content, "utf-8");
}
/**
 * Check if a chat file for the given number already exists.
 *
 * @param number - phone number or identifier
 * @returns true if file exists, false otherwise
 */
export function isChatFileExists(number: string): boolean {
  const filePath = path.join(BASE_DIR, `${number}.txt`);
  return fs.existsSync(filePath);
}
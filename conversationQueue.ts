// conversationQueue.ts
import fs from "fs";
import path from "path";
import { systemPrompt } from "./systemPrompt";
import { sendPromptAndGetResponse } from "./chatgpt";

const BASE_DIR = path.join(process.cwd(), "chat_files");
const QUEUE_DIR = path.join(BASE_DIR, "queue");

// ---------- utils ----------

function ensureDirs() {
    if (!fs.existsSync(BASE_DIR)) fs.mkdirSync(BASE_DIR, { recursive: true });
    if (!fs.existsSync(QUEUE_DIR)) fs.mkdirSync(QUEUE_DIR, { recursive: true });
}

function sanitizeNumber(number: string): string {
    // only keep safe chars
    return number.replace(/[^0-9A-Za-z_\-+]/g, "");
}

function filePathFor(number: string) {
    return path.join(BASE_DIR, `${sanitizeNumber(number)}.txt`);
}

function appendUserLine(number: string, message: string) {
    ensureDirs();
    fs.appendFileSync(filePathFor(number), `user: ${message}\n`, "utf-8");
}

function appendAssistantLine(number: string, message: string) {
    ensureDirs();
    fs.appendFileSync(filePathFor(number), `assistant: ${message}\n`, "utf-8");
}

function readHistory(number: string): string {
    const p = filePathFor(number);
    return fs.existsSync(p) ? fs.readFileSync(p, "utf-8") : "";
}

// ---------- queue helpers ----------

/**
 * Add new message into queue as its own file
 */
export function recordIncomingMessage(number: string, message: string): void {
    ensureDirs();
    const safeNumber = sanitizeNumber(number);
    const timestamp = Date.now();
    const queueFile = path.join(QUEUE_DIR, `${timestamp}_${safeNumber}.json`);

    const entry = { number: safeNumber, msg: message };
    fs.writeFileSync(queueFile, JSON.stringify(entry), "utf-8");

    console.log(`📥 Queued [${safeNumber}] "${message}" -> ${path.basename(queueFile)}`);

    if (!dispatcherRunning) void dispatcherLoop();
}

/**
 * Fetch the oldest entry (first created file)
 */
function getNextQueueFile(): string | null {
    ensureDirs();
    const files = fs.readdirSync(QUEUE_DIR).filter(f => f.endsWith(".json"));
    if (files.length === 0) return null;

    // sort by timestamp (since filename starts with timestamp)
    files.sort();
    return path.join(QUEUE_DIR, files[0]);
}

function readQueueEntry(filePath: string): { number: string; msg: string } | null {
    try {
        return JSON.parse(fs.readFileSync(filePath, "utf-8"));
    } catch {
        return null;
    }
}

// ---------- dispatcher ----------

let dispatcherRunning = false;
let sendOutFn: ((number: string, reply: string) => Promise<void>) | null = null;

export function startQueueProcessor(sendFn: (number: string, reply: string) => Promise<void>) {
    sendOutFn = sendFn;
}

async function dispatcherLoop(): Promise<void> {
    dispatcherRunning = true;
    console.log("🚀 Dispatcher started...");

    try {
        while (true) {
            const file = getNextQueueFile();
            if (!file) break; // no more messages

            const entry = readQueueEntry(file);
            if (!entry) {
                fs.unlinkSync(file);
                continue;
            }

            const { number, msg } = entry;
            console.log(`🔄 Processing for ${number}: "${msg}"`);

            const history = readHistory(number).trim();
            const prompt = `${systemPrompt}

Conversation so far:
${history || "(no previous messages)"}

User: ${msg}
Assistant:`;

            try {
                const reply = await sendPromptAndGetResponse(prompt);
                appendUserLine(number, msg);
 
                appendAssistantLine(number, reply);
                if (sendOutFn) await sendOutFn(number, reply);

                console.log(`✅ Reply sent to ${number}`);
                fs.unlinkSync(file); // remove this queue file after success
            } catch (err) {
                console.error(`❌ Failed for ${number}:`, err);
                break; // stop loop for retry later
            }

            await new Promise(res => setTimeout(res, 200));
        }
    } finally {
        dispatcherRunning = false;
        console.log("⏹ Dispatcher stopped (no more messages).");
    }
}

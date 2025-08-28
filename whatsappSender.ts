// src/whatsappAutomation.ts
import { Client, LocalAuth } from "whatsapp-web.js";
import qrcode from "qrcode-terminal";
import { phoneNumbers } from "./phoneNumbers";
import { advertiseMessage } from "./advertiseMessage";
import { checkOrCreateFile } from "./fileManager";
import { recordIncomingMessage, startQueueProcessor } from "./conversationQueue";

let client: Client | null = null;

export function startWhatsappAutomation() {
    console.log("🚀 Starting WhatsApp automation...");

    client = new Client({
        authStrategy: new LocalAuth({ clientId: "advertise-bot" }),
        puppeteer: { headless: false }
    });

    // --- QR code login ---
    client.on("qr", (qr: string) => {
        console.log("📱 Scan this QR code to log in:");
        qrcode.generate(qr, { small: true });
    });

    // --- when WhatsApp is ready ---
    client.on("ready", async () => {
        console.log("✅ WhatsApp client is ready!");
        console.log("📋 Processing phone numbers list:", phoneNumbers);

        // --- send advertisement only once per user ---
        for (const number of phoneNumbers) {
            try {
                const waId = number + "@c.us";
                const isRegistered = await client!.isRegisteredUser(waId);
                if (!isRegistered) continue;

                const canSend = checkOrCreateFile(number, advertiseMessage, "system");
                if (!canSend) continue;

                await client!.sendMessage(waId, advertiseMessage);
                console.log(`📨 Advertisement successfully sent to ${number}`);
            } catch (err) {
                console.error(`❌ Error sending message to ${number}:`, err);
            }
        }
    });

    // --- record incoming user messages ---
    client.on("message", async (msg) => {
        if (!msg.from.endsWith("@c.us")) return; // ignore groups/status
        const number = msg.from.replace("@c.us", "");
        console.log(`📥 Incoming message from ${number}: "${msg.body}"`);

        recordIncomingMessage(number, msg.body);
    });

    // --- process the queue and reply ---
    startQueueProcessor(sendReplyToUser);

    // --- start client ---
    client.initialize();
}

/**
 * Send a reply to a specific WhatsApp number
 */
async function sendReplyToUser(number: string, reply: string): Promise<void> {
    if (!client) {
        throw new Error("WhatsApp client is not initialized yet.");
    }

    const waId = number + "@c.us";
    await client.sendMessage(waId, reply);

    console.log(`✅ Reply sent to ${number}: "${reply}"`);
}

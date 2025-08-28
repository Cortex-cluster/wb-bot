// src/chatgptDebug.ts
import { spawn } from "child_process";
import { Builder, By, Key, WebDriver, until } from "selenium-webdriver";
import chrome from "selenium-webdriver/chrome";
import path from "path";
import fs from "fs";
import { systemPrompt } from "./systemPrompt";

// --- SETTINGS ---
const CHROME_PATH = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const USER_DATA_DIR = "C:/selenium/ChromeProfile";
const DEBUG_PORT = 9222;
const CHATGPT_URL = "https://chat.openai.com/";

let driver: WebDriver | null = null;
let chromeStarted = false;
let systemPromptSent = false;

// --- STEP 1: Launch Chrome in debug mode ---
function startChromeDebug() {
    if (chromeStarted) return;
    const cmd = `"${CHROME_PATH}" --remote-debugging-port=${DEBUG_PORT} --user-data-dir="${USER_DATA_DIR}" ${CHATGPT_URL}`;
    spawn(cmd, { shell: true, detached: true });
    chromeStarted = true;
    console.log("🚀 Chrome started in debug mode. Please log in manually if required.");
}

// --- STEP 2: Connect to the running Chrome ---
async function getDriver(): Promise<WebDriver> {
    if (driver) return driver;
    if (!chromeStarted) startChromeDebug();

    console.log("⏳ Waiting for Chrome to be ready...");
    await new Promise(res => setTimeout(res, 5000));

    const options = new chrome.Options();
    options.addArguments(`--remote-debugging-port=${DEBUG_PORT}`);
    options.addArguments(`--user-data-dir=${USER_DATA_DIR}`);
    options.setChromeBinaryPath(CHROME_PATH);

    driver = await new Builder()
        .forBrowser("chrome")
        .setChromeOptions(options)
        .build();

    await driver.get(CHATGPT_URL);
    return driver;
}

// --- Helper: find send button with multiple possible selectors ---
export async function findSendButton(driver: WebDriver) {
    const selectors = [
        "button[data-testid='send-button']",
        "button#composer-submit-button",
        "button.composer-submit-btn",
        "button.absolute.rounded-full" // fallback
    ];

    for (const sel of selectors) {
        try {
            const btn = await driver.wait(until.elementLocated(By.css(sel)), 2000);
            await driver.wait(until.elementIsVisible(btn), 2000);
            console.log(`✅ Found send button using selector: ${sel}`);
            return btn;
        } catch {
            // try next
        }
    }

    // ❌ If not found → save DOM for debugging
    const html = await driver.getPageSource();
    fs.writeFileSync("page.html", html);
    console.warn("⚠️ Send button not found. Dumped DOM to page.html");
    return null;
}

// --- STEP 3: Send prompt and get final response ---
export async function sendPromptAndGetResponse(prompt: string): Promise<string> {
    if (!systemPromptSent) {
        await sendSystemPrompt(systemPrompt);
        console.warn("⚠️ System prompt was not sent earlier. Now it has been sent automatically.");
    }

    const driver = await getDriver();
    console.log("⏳ Waiting for ChatGPT page to load...");
    await driver.sleep(2000);

    // Always re-locate chatbox
    const chatbox = await driver.wait(
        until.elementLocated(By.css("div.ProseMirror[contenteditable='true']")),
        60000
    );

    // Paste text directly instead of typing slowly
    await driver.executeScript(
        `arguments[0].innerHTML = arguments[1]; arguments[0].dispatchEvent(new InputEvent('input', { bubbles: true }));`,
        chatbox,
        sanitizeInput(prompt)
    );

    // Try button, fallback to Enter
    const sendButton = await findSendButton(driver);
    if (sendButton) {
        await safeClick(driver, sendButton);
        console.log("📤 Sent using button click");
    } else {
        await chatbox.sendKeys(Key.ENTER);
        console.log("📤 Sent using Enter fallback");
    }


    console.log("✅ Prompt sent, waiting for response...");
    const reply = await waitForResponse(driver, 90000); // 90s max wait
    console.log("💬 Final ChatGPT Response:\n", reply);
    return reply;

}

// --- helper: send any system prompt you want ---
export async function sendSystemPrompt(prompt: string) {
    systemPromptSent = true;

    const driver = await getDriver();

    console.log("⚡ Sending system startup prompt to ChatGPT...");
    const chatbox = await driver.wait(
        until.elementLocated(By.css("div.ProseMirror[contenteditable='true']")),
        60000
    );

    // Direct paste instead of key strokes
    await driver.executeScript(
        `arguments[0].innerHTML = arguments[1]; arguments[0].dispatchEvent(new InputEvent('input', { bubbles: true }));`,
        chatbox,
        sanitizeInput(prompt)
    );

    const sendButton = await findSendButton(driver);
    if (sendButton) {
        await safeClick(driver, sendButton);
        console.log("📤 Sent using button click");
    } else {
        await chatbox.sendKeys(Key.ENTER);
        console.log("📤 Sent using Enter fallback");
    }


    console.log("✅ System prompt sent!");
    await driver.sleep(5000); // let ChatGPT process
}
async function waitForResponse(driver: WebDriver, timeoutMs = 60000): Promise<string> {
    let lastText = "";
    let stableCount = 0;
    const startTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
        await driver.sleep(2000);

        // try multiple selectors
        const selectors = [
            "div.markdown",
            "div[data-message-author-role='assistant']",
            "div.group div.relative"
        ];

        let responses: any[] = [];
        for (const sel of selectors) {
            const found = await driver.findElements(By.css(sel));
            if (found.length > 0) {
                responses = found;
                break;
            }
        }

        if (responses.length > 0) {
            const currentText = (await responses[responses.length - 1].getText()).trim();

            if (currentText === lastText) {
                stableCount++;
            } else {
                stableCount = 0;
            }
            lastText = currentText;

            // if response stable for 3 cycles (≈6s) → assume complete
            if (stableCount >= 3 && currentText.length > 0) {
                return currentText;
            }
        }
    }

    throw new Error("⏳ Timed out waiting for ChatGPT response.");
}

function sanitizeInput(text: string): string {
    return text.replace(/[\u{10000}-\u{10FFFF}]/gu, "");
}
// --- Helper: safe click with JS fallback ---
async function safeClick(driver: WebDriver, element: any) {
    try {
        // scroll into view
        await driver.executeScript("arguments[0].scrollIntoView(true);", element);
        await driver.wait(until.elementIsVisible(element), 2000);

        // normal click
        await element.click();
    } catch (err) {
        console.warn("⚠️ Normal click failed, trying JS click...", err);

        try {
            await driver.executeScript("arguments[0].click();", element);
        } catch (jsErr) {
            console.warn("⚠️ JS click also failed, fallback to ENTER key.", jsErr);

            const chatbox = await driver.findElement(By.css("div.ProseMirror[contenteditable='true']"));
            await chatbox.sendKeys(Key.ENTER);
        }
    }
}

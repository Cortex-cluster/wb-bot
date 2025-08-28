import { startWhatsappAutomation } from "./whatsappSender";


async function main() {
    // Run once to start Chrome
    // startChromeDebug();

    // Now you can keep sending prompts
    startWhatsappAutomation();
}

main();

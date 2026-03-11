/**
 * Pi Notify Extension - Native Desktop Notifications
 *
 * Sends a native OS notification when Pi agent is done and waiting for input.
 * Works with:
 * - OSC 777: Ghostty, iTerm2, WezTerm, rxvt-unicode
 * - OSC 99: Kitty
 * - Windows toast: Windows Terminal (WSL)
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

function windowsToastScript(title: string, body: string): string {
    const type = "Windows.UI.Notifications";
    const mgr = `[${type}.ToastNotificationManager, ${type}, ContentType = WindowsRuntime]`;
    const template = `[${type}.ToastTemplateType]::ToastText01`;
    const toast = `[${type}.ToastNotification]::new($xml)`;
    return [
        `${mgr} > $null`,
        `$xml = [${type}.ToastNotificationManager]::GetTemplateContent(${template})`,
        `$xml.GetElementsByTagName('text')[0].AppendChild($xml.CreateTextNode('${body}')) > $null`,
        `[${type}.ToastNotificationManager]::CreateToastNotifier('${title}').Show(${toast})`,
    ].join("; ");
}

function notifyOSC777(title: string, body: string): void {
    // Ghostty, iTerm2, WezTerm, rxvt-unicode
    process.stdout.write(`\x1b]777;notify;${title};${body}\x07`);
}

function notifyOSC99(title: string, body: string): void {
    // Kitty OSC 99
    process.stdout.write(`\x1b]99;i=1:d=0;${title}\x1b\\`);
    process.stdout.write(`\x1b]99;i=1:p=body;${body}\x1b\\`);
}

function notifyWindows(title: string, body: string): void {
    const { execFile } = require("child_process");
    execFile("powershell.exe", ["-NoProfile", "-Command", windowsToastScript(title, body)]);
}

function sendNotification(title: string, body: string): void {
    // Detect terminal and use appropriate protocol
    if (process.env.WT_SESSION) {
        // Windows Terminal
        notifyWindows(title, body);
    } else if (process.env.KITTY_WINDOW_ID) {
        // Kitty
        notifyOSC99(title, body);
    } else {
        // Default: OSC 777 (Ghostty, iTerm2, WezTerm, etc.)
        notifyOSC777(title, body);
    }
}

export default function piNotifyExtension(pi: ExtensionAPI) {
    // Skip if in TUI mode (notifications corrupt terminal)
    const isTUI = process.env.PI_UI === 'tui' || process.argv.includes('--tui');
    if (isTUI) {
        console.log("[PiNotify] Disabled in TUI mode");
        return;
    }

    // Notify when agent finishes and is waiting for user
    pi.on("agent_end", async (_event) => {
        sendNotification("0xKobold", "✅ Ready for input");
    });

    // Optional: Notify on long-running tasks
    pi.on("turn_end", async (event) => {
        // Could filter by turn duration here
        console.log("[PiNotify] Turn completed");
    });

    // Command to test notification
    pi.registerCommand("notify-test", {
        description: "Test desktop notification",
        handler: async (_args, ctx) => {
            sendNotification("0xKobold Test", "🧪 This is a test notification!");
            ctx.ui.notify("Test notification sent", "info");
        },
    });

    console.log("[PiNotify] Extension loaded - native desktop notifications enabled");
}

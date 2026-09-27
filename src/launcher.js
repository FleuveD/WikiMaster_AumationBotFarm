require('dotenv').config();
const { chromium } = require('playwright-extra');
const stealth = require('puppeteer-extra-plugin-stealth')();
chromium.use(stealth);
const fs = require('fs-extra');
const path = require('path');
const { startServer, renderDashboard } = require('./server');

const EXTENSION_SRC = path.join(__dirname, 'extension');
const TEMP_DIR = path.join(__dirname, '../tmp');

// Parse a proxy string into Playwright's format
function parseProxy(proxyStr) {
    if (!proxyStr) return undefined;
    
    // If it has protocol like http://user:pass@ip:port or http://ip:port
    if (proxyStr.startsWith('http://') || proxyStr.startsWith('https://') || proxyStr.startsWith('socks5://')) {
        try {
            const url = new URL(proxyStr);
            const proxy = { server: `${url.protocol}//${url.hostname}:${url.port}` };
            if (url.username) proxy.username = decodeURIComponent(url.username);
            if (url.password) proxy.password = decodeURIComponent(url.password);
            return proxy;
        } catch (e) {}
    }

    // Format: ip:port or ip:port:user:pass
    const parts = proxyStr.split(':');
    if (parts.length === 2) {
        return { server: `http://${parts[0]}:${parts[1]}` };
    }
    if (parts.length === 4) {
        return { 
            server: `http://${parts[0]}:${parts[1]}`,
            username: parts[2],
            password: parts[3]
        };
    }
    return { server: `http://${proxyStr}` }; // Fallback
}

async function createExtensionCopy(role, index = '') {
    const destDir = path.join(TEMP_DIR, `ext_${role}${index}`);
    
    // Copy base extension
    await fs.copy(EXTENSION_SRC, destDir);
    
    // Create config.js
    const config = {
        type: role,
        botIndex: index,
        env: {
            MAIN_ACCOUNT_NAME: process.env.MAIN_ACCOUNT_NAME,
            MAIN_ACCOUNT_EMAIL: process.env.MAIN_ACCOUNT_EMAIL,
            MAIN_ACCOUNT_PASSWORD: process.env.MAIN_ACCOUNT_PASSWORD,
            DEBUG: process.env.DEBUG === 'true',
            SEND: process.env.SEND || 'true'
        }
    };
    
    const configContent = `window.botConfig = ${JSON.stringify(config)};`;
    await fs.writeFile(path.join(destDir, 'config.js'), configContent);
    
    return destDir;
}

async function launchBrowser(extensionPath, profileName, proxyConfig = undefined, delayMs = 0) {
    const userDataDir = path.join(TEMP_DIR, `profile_${profileName}`);
    
    const options = {
        headless: false,
        args: [
            `--disable-extensions-except=${extensionPath}`,
            `--load-extension=${extensionPath}`,
            '--start-maximized',
            '--disable-blink-features=AutomationControlled',
            '--disable-infobars',
            '--mute-audio'
        ],
        viewport: null
    };
    
    if (proxyConfig) {
        options.proxy = proxyConfig;
    }

    const browserContext = await chromium.launchPersistentContext(userDataDir, options);

    const page = browserContext.pages()[0] || await browserContext.newPage();

    // Minimize window automatically via CDP
    try {
        const session = await browserContext.newCDPSession(page);
        const { windowId } = await session.send('Browser.getWindowForTarget');
        await session.send('Browser.setWindowBounds', { windowId, bounds: { windowState: 'minimized' } });
    } catch (e) {
        if (process.env.DEBUG === 'true') console.log(`[Chrome | ${profileName}] Failed to minimize window: ${e.message}`);
    }

    // Capture console logs from this profile
    const setupLogging = (p) => {
        p.on('console', msg => {
            if (process.env.DEBUG === 'true') {
                console.log(`[Chrome | ${profileName}] ${msg.text()}`);
            }
        });
    };
    
    setupLogging(page);
    browserContext.on('page', setupLogging);
    browserContext.on('serviceworker', sw => {
        sw.on('console', msg => {
            if (process.env.DEBUG === 'true') {
                console.log(`[SW | ${profileName}] ${msg.text()}`);
            }
        });
    });

    // Start a background loop to click cloudflare using Playwright (trusted event)
    const autoClickCloudflare = async () => {
        while (!page.isClosed()) {
            try {
                // Find the Turnstile iframe element from the main page
                const tsIframe = page.locator('iframe[src*="cloudflare"], iframe[src*="turnstile"]').first();
                const count = await tsIframe.count();
                
                if (count > 0 && await tsIframe.isVisible()) {
                    // Cloudflare Turnstile widget is exactly 300x65. The checkbox is on the left side.
                    // By clicking the iframe element directly at coordinate x:30, y:30, we bypass any DOM obfuscation inside the frame!
                    await tsIframe.click({ position: { x: 30, y: 32 }, force: true, delay: Math.random() * 100 + 50 });
                    if (process.env.DEBUG === 'true') console.log(`[WikiFarm] Playwright clicking Cloudflare Turnstile (coordinate offset) for ${profileName}...`);
                }
            } catch (e) {}
            
            if (page.isClosed()) break;
            await new Promise(r => setTimeout(r, 2000));
        }
    };
    autoClickCloudflare();
    
    // Auto-loop bots: If a bot is redirected to /login or / (e.g. after logout), 
    // it stays on /login and auth.js will fetch the next assignment and navigate if needed.
    
    // Delay navigation so all bots can be launched at once without hitting APIs simultaneously
    if (delayMs > 0) {
        if (process.env.DEBUG === 'true') console.log(`[Chrome | ${profileName}] Waiting ${Math.round(delayMs/1000)}s before starting actions...`);
        await new Promise(r => setTimeout(r, delayMs));
    }
    
    // Navigate based on role
    if (profileName === 'main') {
        await page.goto('https://www.wiki-masters.com/login');
    } else {
        await page.goto('https://www.wiki-masters.com/signup');
    }
    
    return browserContext;
}

async function main() {
    if (process.env.DEBUG === 'true') console.log("=== WikiMaster Farm Bot ===");
    
    // 1. Clean tmp dir
    try {
        if (fs.existsSync(TEMP_DIR)) {
            await fs.remove(TEMP_DIR);
        }
    } catch (e) {
        console.warn("\n⚠️ ATTENTION: Impossible de nettoyer completement le dossier tmp.");
        console.warn("⚠️ Des fenetres Chrome precedentes sont peut-etre encore ouvertes en arriere-plan.");
        console.warn("⚠️ Veuillez fermer toutes les fenetres Chrome du bot si vous rencontrez d'autres erreurs.\n");
    }
    await fs.ensureDir(TEMP_DIR);
    
    // 2. Start Server
    await startServer();
    renderDashboard();
    
    // Load proxies
    let proxies = [];
    try {
        const proxyFile = path.join(__dirname, '../proxies.txt');
        if (fs.existsSync(proxyFile)) {
            const content = await fs.readFile(proxyFile, 'utf8');
            proxies = content.split('\n').map(l => l.trim()).filter(l => l.length > 0 && !l.startsWith('#'));
            if (process.env.DEBUG === 'true') console.log(`[Proxy] Loaded ${proxies.length} proxies from proxies.txt`);
        } else {
            if (process.env.DEBUG === 'true') console.log(`[Proxy] No proxies.txt found. Using direct connection.`);
        }
    } catch (e) {
        console.warn("[Proxy] Failed to read proxies.txt", e);
    }
    let proxyIndex = 0;
    const getNextProxy = () => {
        if (proxies.length === 0) return undefined;
        const p = proxies[proxyIndex % proxies.length];
        proxyIndex++;
        return p;
    };

    let currentDelay = 0;
    const launchPromises = [];

    // 3. Launch Main & Intermediate Accounts if sending is enabled
    if (process.env.SEND !== 'false') {
        const mainProxy = getNextProxy();
        if (process.env.DEBUG === 'true') console.log(`Starting Main Account... ${mainProxy ? '(Proxy: ' + mainProxy + ')' : ''}`);
        const mainExtPath = await createExtensionCopy('main');
        launchPromises.push(launchBrowser(mainExtPath, 'main', parseProxy(mainProxy), currentDelay));
        currentDelay += 5000;
        
        // 4. Launch Intermediate Account
        const interProxy = getNextProxy();
        if (process.env.DEBUG === 'true') console.log(`Starting Intermediate Account... ${interProxy ? '(Proxy: ' + interProxy + ')' : ''}`);
        const interExtPath = await createExtensionCopy('intermediate');
        launchPromises.push(launchBrowser(interExtPath, 'intermediate', parseProxy(interProxy), currentDelay));
        currentDelay += 5000;
    } else {
        if (process.env.DEBUG === 'true') console.log("SEND=false: Skipping Main and Intermediate accounts.");
    }
    
    // Start multiple bot farm accounts
    const botCount = parseInt(process.env.BOT_COUNT) || 1;
    currentDelay += 10000; // give intermediate a head start
    
    for (let i = 1; i <= botCount; i++) {
        const botProxy = getNextProxy();
        if (process.env.DEBUG === 'true') console.log(`Starting Bot Account ${i}... ${botProxy ? '(Proxy: ' + botProxy + ')' : ''}`);
        const botExtPath = await createExtensionCopy('bot', i);
        
        // To avoid massive CPU spikes, we slightly stagger the literal browser execution by 500ms
        await new Promise(r => setTimeout(r, 500)); 
        launchPromises.push(launchBrowser(botExtPath, `bot_${i}`, parseProxy(botProxy), currentDelay));
        
        currentDelay += 10000;
    }
    
    await Promise.all(launchPromises);
    if (process.env.DEBUG === 'true') console.log("All bots launched and scheduled. See server logs for events.");
}

main().catch(console.error);

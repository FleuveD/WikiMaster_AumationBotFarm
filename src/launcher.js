require('dotenv').config();
const { chromium } = require('playwright-extra');
const stealth = require('puppeteer-extra-plugin-stealth')();
chromium.use(stealth);
const fs = require('fs-extra');
const path = require('path');
const { startServer, renderDashboard } = require('./server');

const EXTENSION_SRC = path.join(__dirname, 'extension');
const TEMP_DIR = path.join(__dirname, '../tmp');

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
            DEBUG: process.env.DEBUG === 'true'
        }
    };
    
    const configContent = `window.botConfig = ${JSON.stringify(config)};`;
    await fs.writeFile(path.join(destDir, 'config.js'), configContent);
    
    return destDir;
}

async function launchBrowser(extensionPath, profileName) {
    const userDataDir = path.join(TEMP_DIR, `profile_${profileName}`);
    
    const browserContext = await chromium.launchPersistentContext(userDataDir, {
        headless: false,
        args: [
            `--disable-extensions-except=${extensionPath}`,
            `--load-extension=${extensionPath}`,
            '--start-maximized',
            '--disable-blink-features=AutomationControlled',
            '--disable-infobars',
            '--mute-audio'
        ],
        viewport: null // Required for start-maximized
    });

    const page = browserContext.pages()[0] || await browserContext.newPage();

    // Capture console logs from this profile
    const setupLogging = (p) => {
        p.on('console', msg => {
            if (process.env.DEBUG === 'true') {
                const text = msg.text();
                if (text.includes('[WikiFarm]') || text.includes('Error')) {
                    console.log(`[Chrome | ${profileName}] ${text}`);
                }
            }
        });
    };
    
    setupLogging(page);
    browserContext.on('page', setupLogging);
    browserContext.on('serviceworker', sw => {
        sw.on('console', msg => {
            if (process.env.DEBUG === 'true') {
                const text = msg.text();
                if (text.includes('[Background]') || text.includes('[WikiFarm]') || text.includes('Error') || msg.type() === 'error') {
                    console.log(`[SW | ${profileName}] ${text}`);
                }
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
    
    // Auto-loop bots: If a bot is redirected to /login or / (e.g. after logout), redirect to /signup
    page.on('framenavigated', (frame) => {
        if (frame === page.mainFrame() && (profileName.startsWith('bot') || profileName === 'intermediate')) {
            const currentUrl = frame.url();
            if (currentUrl.includes('/login') || currentUrl === 'https://www.wiki-masters.com/' || currentUrl === 'https://www.wiki-masters.com') {
                if (process.env.DEBUG === 'true') console.log(`[Chrome | ${profileName}] Detected end of loop (${currentUrl}), redirecting to /signup for next loop...`);
                page.goto('https://www.wiki-masters.com/signup').catch(() => {});
            }
        }
    });
    
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
    
    // 3. Launch Main Account
    if (process.env.DEBUG === 'true') console.log("Starting Main Account...");
    const mainExtPath = await createExtensionCopy('main');
    await launchBrowser(mainExtPath, 'main');
    
    // wait a bit before starting intermediate to ensure main is ready
    await new Promise(r => setTimeout(r, 5000));
    
    // 4. Launch Intermediate Account
    if (process.env.DEBUG === 'true') console.log("Starting Intermediate Account...");
    const interExtPath = await createExtensionCopy('intermediate');
    await launchBrowser(interExtPath, 'intermediate');
    
    await new Promise(r => setTimeout(r, 5000));
    
    // Start multiple bot farm accounts
    const botCount = parseInt(process.env.BOT_COUNT) || 1;
    for (let i = 1; i <= botCount; i++) {
        if (i === 1) {
            // give intermediate a head start (10 seconds to avoid Mail.tm limit)
            await new Promise(r => setTimeout(r, 10000)); 
        }
        if (process.env.DEBUG === 'true') console.log(`Starting Bot Account ${i}...`);
        const botExtPath = await createExtensionCopy('bot', i);
        await launchBrowser(botExtPath, `bot_${i}`);
        
        // Stagger starts heavily to respect Mail.tm API rate limits
        if (i < botCount) {
            await new Promise(r => setTimeout(r, 10000));
        }
    }
    
    if (process.env.DEBUG === 'true') console.log("All bots launched. See server logs for events.");
}

main().catch(console.error);

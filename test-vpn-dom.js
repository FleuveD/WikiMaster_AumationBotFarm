const { chromium } = require('playwright');
const path = require('path');

async function testVpn() {
    const extPath = path.join(__dirname, 'urbanvpn');
    const browser = await chromium.launchPersistentContext('', {
        headless: false,
        args: [
            `--disable-extensions-except=${extPath}`,
            `--load-extension=${extPath}`
        ]
    });

    let urbanVpnId = null;
    for (let i = 0; i < 20; i++) {
        const workers = browser.serviceWorkers();
        const sw = workers.find(w => w.url().includes('chrome-extension://'));
        if (sw) {
            urbanVpnId = sw.url().split('/')[2];
            break;
        }
        await new Promise(r => setTimeout(r, 500));
    }

    if (!urbanVpnId) return console.log("Failed to get ID");

    const page = await browser.newPage();
    await page.goto(`chrome-extension://${urbanVpnId}/popup/index.html`);
    await page.waitForTimeout(3000);
    
    const html = await page.content();
    require('fs').writeFileSync(path.join(__dirname, 'vpn_dom1.html'), html);
    
    // click Agree
    const btns = await page.locator('button').all();
    for (const b of btns) {
        const text = await b.textContent();
        if (text && text.toLowerCase().includes('agree')) {
            await b.click();
            break;
        }
    }
    
    await page.waitForTimeout(2000);
    const html2 = await page.content();
    require('fs').writeFileSync(path.join(__dirname, 'vpn_dom2.html'), html2);

    await browser.close();
}

testVpn().catch(console.error);

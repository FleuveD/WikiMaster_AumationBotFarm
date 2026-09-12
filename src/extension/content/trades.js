const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function main() {
    const role = window.botConfig.type;
    console.log(`[WikiFarm] Trades sequence for ${role}`);

    // Re-init socket to ensure background script is connected
    chrome.storage.local.get(['myUsername', 'myRole'], async (data) => {
        if (data.myUsername && data.myRole) {
            chrome.runtime.sendMessage({
                action: 'init', 
                role: data.myRole, 
                username: data.myUsername
            });
        }
    });

    await sleep(2000);

    if (role === 'bot' || role === 'intermediate') {
        let shouldSendTrade = role === 'bot';
        
        if (role === 'intermediate') {
            // Check if we reached 50 trades
            const res = await new Promise(r => chrome.storage.local.get(['tradesCount'], r));
            const count = res.tradesCount || 0;
            if (count >= 50) {
                console.log("[WikiFarm] Intermediate reached 50 trades. Sending to Main.");
                shouldSendTrade = true;
                chrome.storage.local.set({ tradesCount: 0 }); // reset
            }
        }

        if (shouldSendTrade) {
            let targetUsername = null;
            for (let i = 0; i < 30; i++) {
                const res = await new Promise(r => chrome.runtime.sendMessage({ action: 'get_target' }, r));
                if (res && res.success) {
                    targetUsername = res.username;
                    break;
                }
                console.log("[WikiFarm] Target not ready for trade. Retrying in 2s...");
                await sleep(2000);
            }

            if (targetUsername) {
                await sendTradeTo(targetUsername, role);
            } else {
                console.log("[WikiFarm] Target not found for trade after retries.");
            }
        }
    }

    // Logic for accepting trades for Main & Intermediate
    if (role === 'main' || role === 'intermediate') {
        setInterval(() => {
            chrome.storage.local.get(['tradeOffers'], (res) => {
                const offers = res.tradeOffers || [];
                if (offers.length > 0) {
                    let remaining = [];
                    for (let reqUsername of offers) {
                        let success = acceptTradeOffer(reqUsername, role);
                        if (!success) {
                            remaining.push(reqUsername);
                        }
                    }
                    if (remaining.length !== offers.length) {
                        chrome.storage.local.set({ tradeOffers: remaining });
                    }
                }
            });
        }, 3000);
    }
}

async function sendTradeTo(targetUsername, role) {
    console.log(`[WikiFarm] Sending trade to ${targetUsername}`);
    
    // Proposer un échange
    const propBtn = Array.from(document.querySelectorAll('button')).find(el => el.textContent.includes('Proposer un échange') || el.textContent.includes('Échanger'));
    if (propBtn) propBtn.click();
    
    await sleep(1000);

    // Search user
    const searchInput = document.querySelector('input[placeholder="Rechercher..."]');
    if (searchInput) {
        const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
        nativeInputValueSetter.call(searchInput, targetUsername);
        searchInput.dispatchEvent(new Event('input', { bubbles: true }));
        console.log(`[WikiFarm] Entered target username: ${targetUsername}`);
    }

    await sleep(1000);

    // Click target
    const targetSpan = Array.from(document.querySelectorAll('span')).find(el => el.textContent.trim() === targetUsername);
    if (targetSpan) {
        const targetBtn = targetSpan.closest('button');
        if (targetBtn) targetBtn.click();
    }

    await sleep(5000);

    // Add all cards
    // Looking for card buttons: <button class="... overflow-hidden border-2 ...">
    const cardBtns = Array.from(document.querySelectorAll('button')).filter(el => {
        // Find buttons containing an image and that look like a card
        return el.querySelector('img') && el.className.includes('border-2');
    });

    // The script requested 100 first cards max
    const toClick = cardBtns.slice(0, 100);
    for (let btn of toClick) {
        btn.click();
        await sleep(300);
    }

    // Add WB (balance)
    const wbBtn = Array.from(document.querySelectorAll('button')).find(el => el.textContent.includes('Ajouter des WB'));
    if (wbBtn) wbBtn.click();

    await sleep(300);

    // Get balance text: "Solde : 3 938 wb"
    let balance = 0;
    const spans = document.querySelectorAll('span');
    for (let s of spans) {
        if (s.textContent.includes('Solde :')) {
            const digitsOnly = s.textContent.replace(/[^\d]/g, '');
            if (digitsOnly) {
                balance = parseInt(digitsOnly, 10);
            }
            break;
        }
    }

    if (balance >= 0) {
        // Paste balance
        // We need to find the input for WB amount
        const wbInput = document.querySelector('input[type="number"]') || document.querySelector('input[inputmode="numeric"]') || document.querySelector('input.text-right') || document.querySelector('input');
        if (wbInput) {
            const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
            nativeInputValueSetter.call(wbInput, balance);
            wbInput.dispatchEvent(new Event('input', { bubbles: true }));
            wbInput.dispatchEvent(new Event('change', { bubbles: true }));
            wbInput.dispatchEvent(new Event('blur', { bubbles: true }));
            console.log(`[WikiFarm] Entered WB balance: ${balance}`);
        }

        await sleep(500);

        // Click Enregistrer
        const saveBtn = Array.from(document.querySelectorAll('button')).find(el => el.textContent.trim() === 'Enregistrer');
        if (saveBtn) saveBtn.click();
    }

    await sleep(1000);

    // Envoyer l'offre
    const sendBtn = Array.from(document.querySelectorAll('button')).find(el => el.textContent.trim() === "Envoyer l'offre");
    if (sendBtn) {
        if (sendBtn.disabled) {
            console.warn("[WikiFarm] WARNING: 'Envoyer l'offre' button is disabled!");
        }
        sendBtn.click();
        console.log(`[WikiFarm] Trade sent to ${targetUsername}`);
        
        const targetRole = role === 'bot' ? 'intermediate' : 'main';
        chrome.runtime.sendMessage({ action: 'notify_trade_offer', targetRole: targetRole });
    } else {
        console.error("[WikiFarm] ERROR: 'Envoyer l'offre' button NOT FOUND!");
    }

    // Wait 5 seconds to guarantee the trade HTTP request finishes before we navigate away and abort it!
    await sleep(5000);

    // Disconnect (logout)
    console.log("[WikiFarm] Logging out...");
    
    // Soft navigation to settings
    const settingsLink = document.querySelector('a[href="/settings"]');
    if (settingsLink) {
        settingsLink.click();
    } else {
        console.error("[WikiFarm] Settings link not found, forcing hard navigation.");
        window.location.href = 'https://www.wiki-masters.com/settings';
    }
    
    await sleep(2000);
    const logoutBtn = Array.from(document.querySelectorAll('button')).find(el => el.textContent.includes('Déconnexion'));
    if (logoutBtn) {
        logoutBtn.click();
        console.log("[WikiFarm] Successfully logged out.");
        
        if (role === 'bot') {
            setTimeout(() => {
                console.log("[WikiFarm] Forcing redirect to /signup to restart the loop.");
                window.location.href = 'https://www.wiki-masters.com/signup';
            }, 2000);
        }
    } else {
        console.error("[WikiFarm] Logout button not found!");
    }
}

function acceptTradeOffer(username, role) {
    let clicked = false;
    // Find the offer block for this username
    // The prompt says "De K60IVHQlti" -> we strip "De "
    const spans = Array.from(document.querySelectorAll('span')).filter(el => {
        return el.textContent.trim() === `De ${username}` || el.textContent.trim() === username;
    });

    for (let span of spans) {
        const box = span.closest('.card-frame') || span.closest('div.p-4') || span.closest('div');
        if (box) {
            const acceptBtn = Array.from(box.querySelectorAll('button')).find(btn => btn.textContent.includes('Accepter'));
            if (acceptBtn) {
                acceptBtn.click();
                console.log(`[WikiFarm] Accepted trade offer from ${username}`);
                clicked = true;
                
                if (role === 'intermediate') {
                    // Increment trade count
                    chrome.storage.local.get(['tradesCount'], (res) => {
                        const count = res.tradesCount || 0;
                        chrome.storage.local.set({ tradesCount: count + 1 });
                    });
                }
            }
        }
    }
    return clicked;
}

main();

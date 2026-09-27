const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const setStatus = (status, color = 'yellow') => {
    chrome.runtime.sendMessage({ action: 'update_status', status, color });
};

async function main() {
    const role = window.botConfig.type;
    setStatus('WAITING FOR TRADES', 'yellow');
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
        let shouldSendTrade = (role === 'bot') && (window.botConfig.env.SEND !== 'false');
        
        if (role === 'intermediate' && window.botConfig.env.SEND !== 'false') {
            const res = await new Promise(r => chrome.storage.local.get(['tradesCount', 'intermediateState'], r));
            const count = res.tradesCount || 0;
            if (count >= 45 && res.intermediateState === 'sending_to_main') {
                console.log("[WikiFarm] Intermediate ready to send to Main.");
                shouldSendTrade = true;
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
        const acceptInterval = setInterval(() => {
            chrome.storage.local.get(['tradeOffers', 'tradesCount', 'friendRequests'], (res) => {
                const reqs = res.friendRequests || [];
                if (reqs.length > 0) {
                    console.log("[WikiFarm] Have pending friend requests. Navigating to /friends");
                    window.location.href = 'https://www.wiki-masters.com/friends';
                    return;
                }

                let currentCount = res.tradesCount || 0;
                if (role === 'intermediate' && currentCount >= 45) {
                    if (!window.hasRedirectedToAchievements) {
                        window.hasRedirectedToAchievements = true;
                        clearInterval(acceptInterval);
                        console.log(`[WikiFarm] Intermediate reached ${currentCount} trades. Navigating to achievements...`);
                        chrome.storage.local.set({ intermediateState: 'sending_to_main' }, () => {
                            window.location.href = 'https://www.wiki-masters.com/achievements';
                        });
                    }
                    return;
                }

                const offers = res.tradeOffers || [];
                if (offers.length > 0) {
                    let remaining = [];
                    let acceptedThisLoop = 0;
                    
                    for (let reqUsername of offers) {
                        // Stop accepting immediately if we reach the limit
                        if (role === 'intermediate' && (currentCount + acceptedThisLoop) >= 45) {
                            remaining.push(reqUsername);
                            continue;
                        }
                        
                        let success = acceptTradeOffer(reqUsername, role);
                        if (success) {
                            acceptedThisLoop++;
                        } else {
                            remaining.push(reqUsername);
                        }
                    }
                    
                    if (role === 'intermediate' && acceptedThisLoop > 0) {
                        currentCount += acceptedThisLoop;
                        if (window.botConfig && window.botConfig.env && window.botConfig.env.DEBUG) {
                            console.log(`[WikiFarm] [DEBUG] Accepted ${acceptedThisLoop} offers this loop. Total accepted: ${currentCount}/45`);
                        }
                    }
                    
                    if (remaining.length !== offers.length || acceptedThisLoop > 0) {
                        let updates = { tradeOffers: remaining };
                        if (role === 'intermediate' && acceptedThisLoop > 0) {
                            updates.tradesCount = currentCount;
                            chrome.runtime.sendMessage({ action: 'update_counter', count: currentCount });
                        }
                        chrome.storage.local.set(updates);
                    }
                }
            });
        }, 3000);
    }
}

async function sendTradeTo(targetUsername, role) {
    setStatus('SENDING TRADE', 'green');
    console.log(`[WikiFarm] Sending trade to ${targetUsername}`);
    
    // Proposer un échange
    let propBtn = null;
    let allButtonsText = [];
    for (let i = 0; i < 20; i++) {
        await sleep(500);
        allButtonsText = Array.from(document.querySelectorAll('button')).map(b => b.textContent.trim());
        propBtn = Array.from(document.querySelectorAll('button')).find(el => {
            const text = el.textContent.toLowerCase();
            return text.includes('proposer') || text.includes('échanger') || text.includes('nouvel échange') || text.includes('créer') || text === '+';
        });
        if (propBtn) break;
    }
    
    if (propBtn) {
        propBtn.click();
        console.log("[WikiFarm] Clicked 'Nouvel échange' button");
    } else {
        console.error("[WikiFarm] 'Proposer un échange' button NOT FOUND after wait! Available buttons:", allButtonsText);
    }
    
    // Wait for modal and input to appear
    let searchInput = null;
    for (let i = 0; i < 10; i++) {
        await sleep(500);
        const inputs = document.querySelectorAll('input:not([type="hidden"])');
        if (inputs.length > 0) {
            searchInput = Array.from(inputs).find(input => input.placeholder && input.placeholder.toLowerCase().includes('rechercher')) || inputs[0];
            break;
        }
    }

    if (searchInput) {
        const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
        nativeInputValueSetter.call(searchInput, targetUsername);
        searchInput.dispatchEvent(new Event('input', { bubbles: true }));
        searchInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }));
        searchInput.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }));
        console.log(`[WikiFarm] Entered target username: ${targetUsername}`);
    } else {
        console.warn("[WikiFarm] Search input for friend selection NOT FOUND (might not be necessary if list is small).");
    }

    // Wait for the target user to appear in the list
    let targetBtn = null;
    for (let i = 0; i < 20; i++) { // Increased wait time to 10s
        await sleep(500);
        const targetNodes = Array.from(document.querySelectorAll('*')).filter(el => 
            el.children.length === 0 && el.textContent.toLowerCase().includes(targetUsername.toLowerCase())
        );
        for (let el of targetNodes) {
            const clickable = el.closest('button') || el.closest('[role="button"]') || el.closest('a') || el.parentElement;
            if (clickable) {
                targetBtn = clickable;
                break;
            }
        }
        if (targetBtn) break;
    }

    if (targetBtn) {
        targetBtn.click();
        console.log(`[WikiFarm] Selected friend ${targetUsername} for trade.`);
    } else {
        const allTextContent = Array.from(document.querySelectorAll('span, p, div, button, a')).map(el => el.textContent.trim()).filter(t => t.length > 0 && t.length < 50);
        console.error(`[WikiFarm] Failed to find friend ${targetUsername} in selection list! Available elements (short):`, allTextContent.slice(0, 50));
        return; // ABORT if we couldn't select the friend
    }

    // Wait for transition to the trade screen
    await sleep(3000);

    // Add all cards
    let cardBtns = [];
    for (let i = 0; i < 10; i++) {
        cardBtns = Array.from(document.querySelectorAll('button')).filter(el => el.querySelector('img') && !el.textContent.toLowerCase().includes('proposer'));
        if (cardBtns.length > 0) break;
        await sleep(500);
    }

    if (cardBtns.length === 0) {
        console.warn("[WikiFarm] WARNING: 0 cards found to click! Available buttons with img:", Array.from(document.querySelectorAll('button')).filter(b => b.querySelector('img')).map(b => b.className));
    }

    // The script requested 100 first cards max
    const toClick = cardBtns.slice(0, 100);
    console.log(`[WikiFarm] Clicking ${toClick.length} cards...`);
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

    if (balance > 0) {
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
    } else {
        const cancelBtn = Array.from(document.querySelectorAll('button')).find(el => el.textContent.trim().toLowerCase() === 'annuler' || el.textContent.trim().toLowerCase() === 'fermer');
        if (cancelBtn) cancelBtn.click();
        console.log(`[WikiFarm] Balance is 0. Cancelled WB addition.`);
    }

    await sleep(1000);

    // Envoyer l'offre
    const sendBtns = Array.from(document.querySelectorAll('button')).filter(el => {
        const t = el.textContent.toLowerCase();
        // Avoid the main page's "+ Proposer un échange" button
        if (t.includes('+ proposer un échange')) return false;
        
        return t.includes("envoyer") || t.includes("proposer") || t.includes("confirmer");
    });
    
    const sendBtn = sendBtns.length > 0 ? sendBtns[sendBtns.length - 1] : null; // Usually the modal button is at the end of the DOM
    
    if (sendBtn) {
        if (sendBtn.disabled) {
            console.warn("[WikiFarm] WARNING: Send button is disabled! Buttons found:", sendBtns.map(b => b.textContent));
        }
        sendBtn.click();
        console.log(`[WikiFarm] Trade sent to ${targetUsername}. Clicked button: ${sendBtn.textContent.trim()}`);
        
        await sleep(1000);
        const confirmBtn = Array.from(document.querySelectorAll('button')).find(el => {
             const t = el.textContent.trim().toLowerCase();
             return t === 'confirmer' || t === 'oui';
        });
        if (confirmBtn) {
             confirmBtn.click();
             console.log("[WikiFarm] Clicked additional confirmation button!");
        }
        
        const allText = Array.from(document.querySelectorAll('div, span, p')).map(el => el.textContent.trim()).filter(t => t.length > 0 && t.length < 100);
        console.log("[WikiFarm] DOM text after sending (last 30 items):", allText.slice(-30));

        const targetRole = role === 'bot' ? 'intermediate' : 'main';
        chrome.runtime.sendMessage({ action: 'notify_trade_offer', targetRole: targetRole });
    } else {
        console.error("[WikiFarm] ERROR: Send trade button NOT FOUND! Available buttons:", Array.from(document.querySelectorAll('button')).map(b => b.textContent.trim()));
    }

    // Wait 5 seconds to guarantee the trade HTTP request finishes before we navigate away and abort it!
    await sleep(5000);

    // Disconnect (logout)
    console.log("[WikiFarm] Logging out...");
    
    // Attempt to click the settings link in the sidebar to reveal the logout button if hidden
    const settingsLink = document.querySelector('a[href="/settings"]');
    const paramBtn = Array.from(document.querySelectorAll('a, button, div')).find(el => el.textContent.includes('Paramètres'));
    
    if (settingsLink) {
        settingsLink.click();
        await sleep(2000);
    } else if (paramBtn) {
        paramBtn.click();
        await sleep(2000);
    }
    
    let logoutBtn = null;
    for (let i = 0; i < 10; i++) {
        logoutBtn = Array.from(document.querySelectorAll('*')).find(el => el.children.length === 0 && el.textContent.toLowerCase().includes('déconnexion'));
        if (logoutBtn) break;
        await sleep(500);
    }
    
    if (logoutBtn) {
        // Sometimes it's a span inside a button, so we click the parent button if it exists
        const clickable = logoutBtn.closest('button') || logoutBtn.closest('a') || logoutBtn;
        clickable.click();
        console.log("[WikiFarm] Successfully logged out.");
        
        if (role === 'intermediate') {
            chrome.storage.local.set({ tradesCount: 0, intermediateState: 'farming' });
        }
        
        if (role === 'bot' || role === 'intermediate') {
            chrome.storage.local.get(['myUsername'], (res) => {
                if (res.myUsername) {
                    chrome.runtime.sendMessage({ action: 'release_account', username: res.myUsername });
                }
                chrome.storage.local.remove(['currentAssignment', 'myUsername'], () => {
                    setTimeout(() => {
                        console.log("[WikiFarm] Forcing redirect to /login to restart the loop.");
                        window.location.href = 'https://www.wiki-masters.com/login';
                    }, 2000);
                });
            });
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
                // Storage increment has been moved to the main loop to prevent race conditions
            }
        }
    }
    return clicked;
}

main();

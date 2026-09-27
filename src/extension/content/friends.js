const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const setStatus = (status, color = 'yellow') => {
    chrome.runtime.sendMessage({ action: 'update_status', status, color });
};

async function main() {
    const role = window.botConfig.type;
    setStatus('WAITING FOR FRIEND', 'yellow');
    console.log(`[WikiFarm] Friends sequence for ${role}`);

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
        // Find who we need to add, retry if not ready
        let targetUsername = null;
        for (let i = 0; i < 30; i++) {
            const res = await new Promise(r => chrome.runtime.sendMessage({ action: 'get_target' }, r));
            if (res && res.success) {
                targetUsername = res.username;
                break;
            }
            console.log("[WikiFarm] Target not ready yet. Retrying in 2s...");
            await sleep(2000);
        }

        if (targetUsername) {
            setStatus('SENDING FRIEND REQUEST', 'green');
            const storageRes = await new Promise(r => chrome.storage.local.get(['friendAdded_' + targetUsername], r));
            if (storageRes['friendAdded_' + targetUsername]) {
                console.log(`[WikiFarm] Already added ${targetUsername}, skipping friend request.`);
            } else {
                console.log(`[WikiFarm] Needs to add ${targetUsername}`);
                
                // Wait for search button to appear
                let searchBtn = null;
                for (let i = 0; i < 40; i++) {
                    searchBtn = Array.from(document.querySelectorAll('button')).find(el => 
                        el.textContent.includes('Rechercher un joueur') || 
                        el.textContent.includes('Rechercher')
                    );
                    if (searchBtn) break;
                    await sleep(500);
                }

                if (searchBtn) {
                    searchBtn.click();
                    console.log("[WikiFarm] Clicked search button:", searchBtn.textContent);
                } else {
                    console.error("[WikiFarm] Search button not found! Available buttons:", Array.from(document.querySelectorAll('button')).map(b => b.textContent));
                }
                
                await sleep(1000);

                // Wait for input field to appear (might be a modal opening)
                let searchInput = null;
                for (let i = 0; i < 10; i++) {
                    const inputs = document.querySelectorAll('input:not([type="hidden"])');
                    for (let input of inputs) {
                        if (input.placeholder && input.placeholder.toLowerCase().includes('recherche')) {
                            searchInput = input;
                            break;
                        }
                    }
                    if (!searchInput && inputs.length > 0) {
                        searchInput = inputs[0];
                    }
                    if (searchInput) break;
                    await sleep(500);
                }

                if (searchInput) {
                    // React compatible input setting
                    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
                    nativeInputValueSetter.call(searchInput, targetUsername);
                    searchInput.dispatchEvent(new Event('input', { bubbles: true }));
                    
                    // Trigger Enter key
                    searchInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }));
                    searchInput.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }));
                    
                    console.log(`[WikiFarm] Entered target username: ${targetUsername}`);
                    
                    await sleep(500);
                    // Try to click the search submit button if it exists
                    const searchSubmitBtn = Array.from(document.querySelectorAll('button')).find(btn => btn.textContent.includes('Rechercher des joueurs') || btn.textContent.trim() === 'Rechercher');
                    if (searchSubmitBtn) {
                        searchSubmitBtn.click();
                        console.log("[WikiFarm] Clicked search submit button");
                    }
                } else {
                    console.error("[WikiFarm] Search input not found! Available inputs:", Array.from(document.querySelectorAll('input:not([type="hidden"])')).map(i => i.outerHTML));
                }

                // Wait for search results to load and find the precise 'Ajouter' button
                let addBtn = null;
                for (let i = 0; i < 30; i++) {
                    await sleep(500);
                    
                    // Try to find the exact username text node
                    const textNodes = Array.from(document.querySelectorAll('*')).filter(el => 
                        el.children.length === 0 && el.textContent.trim().toLowerCase() === targetUsername.toLowerCase()
                    );
                    
                    for (let el of textNodes) {
                        let current = el;
                        while (current && current.tagName !== 'BODY') {
                            const btn = Array.from(current.querySelectorAll('button')).find(b => 
                                b.textContent.includes('Ajouter') && !b.textContent.includes('Inviter')
                            );
                            if (btn) {
                                addBtn = btn;
                                break;
                            }
                            current = current.parentElement;
                        }
                        if (addBtn) break;
                    }
                    
                    if (addBtn) break;
                }

                if (addBtn) {
                    addBtn.click();
                    console.log(`[WikiFarm] Added ${targetUsername} successfully!`);
                    const targetRole = role === 'bot' ? 'intermediate' : 'main';
                    chrome.runtime.sendMessage({ action: 'notify_friend_request', targetRole: targetRole });
                    chrome.storage.local.set({ ['friendAdded_' + targetUsername]: true });
                } else {
                    console.error(`[WikiFarm] Failed to find Ajouter button for EXACT user ${targetUsername} after 15s! Buttons available:`, Array.from(document.querySelectorAll('button')).map(b => b.textContent));
                }
            } // close the else block for already added
        } else {
            console.log("[WikiFarm] Target not found after retries.");
        }
            
        if (role === 'bot') {
            console.log("[WikiFarm] Friends step complete. Navigating to pulls.");
            await sleep(2000); // let the notification fly
            window.location.href = 'https://www.wiki-masters.com/pulls';
        }
        // Removed leftover brackets
    }

    // Logic for accepting requests    // Main and Intermediate wait to accept requests
    if (role === 'main' || role === 'intermediate') {
        setStatus('ACCEPTING FRIENDS', 'green');
        setInterval(() => {
            chrome.storage.local.get(['friendRequests', 'tradeOffers'], (res) => {
                const requests = res.friendRequests || [];
                const offers = res.tradeOffers || [];
                
                if (requests.length === 0 && offers.length > 0) {
                    console.log("[WikiFarm] No friend requests, but have trade offers. Navigating to /trades");
                    window.location.href = 'https://www.wiki-masters.com/trades';
                    return;
                }

                if (requests.length > 0) {
                    // Try to switch to "En attente" tab if it exists
                    const enAttenteTab = Array.from(document.querySelectorAll('button, a')).find(el => el.textContent.trim().includes('En attente'));
                    if (enAttenteTab) {
                        enAttenteTab.click();
                    }

                    // Give React time to render the tab contents
                    setTimeout(() => {
                        let remaining = [];
                        for (let reqUsername of requests) {
                            let success = acceptFriendRequest(reqUsername);
                            if (!success) {
                                remaining.push(reqUsername);
                            }
                        }
                        if (remaining.length !== requests.length) {
                            chrome.storage.local.set({ friendRequests: remaining });
                        }
                    }, 500);
                }
            });
        }, 3000);
    }
}

function acceptFriendRequest(username) {
    let clicked = false;
    const pTags = Array.from(document.querySelectorAll('p, span')).filter(el => el.textContent.trim() === username);
    for (let el of pTags) {
        const box = el.closest('div.flex') || el.closest('.card-frame') || el.closest('div');
        if (box) {
            const acceptBtn = Array.from(box.querySelectorAll('button')).find(btn => btn.textContent.includes('Accepter'));
            if (acceptBtn) {
                acceptBtn.click();
                console.log(`[WikiFarm] Accepted friend request from ${username}`);
                clicked = true;
            }
        }
    }
    return clicked;
}

main();

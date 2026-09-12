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
                for (let i = 0; i < 20; i++) {
                    searchBtn = Array.from(document.querySelectorAll('button')).find(el => el.textContent.includes('Rechercher un joueur'));
                    if (searchBtn) break;
                    await sleep(200);
                }

                if (searchBtn) {
                    searchBtn.click();
                    console.log("[WikiFarm] Clicked search button");
                } else {
                    console.error("[WikiFarm] Search button not found!");
                }
                
                await sleep(1000);

                // We'll look for input fields
                const inputs = document.querySelectorAll('input[type="text"]');
                let searchInput = null;
                for (let input of inputs) {
                    if (input.placeholder && input.placeholder.toLowerCase().includes('recherche')) {
                        searchInput = input;
                        break;
                    }
                }
                
                if (!searchInput && inputs.length > 0) {
                    searchInput = inputs[0];
                }

                if (searchInput) {
                    // React compatible input setting
                    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
                    nativeInputValueSetter.call(searchInput, targetUsername);
                    searchInput.dispatchEvent(new Event('input', { bubbles: true }));
                    console.log(`[WikiFarm] Entered target username: ${targetUsername}`);
                } else {
                    console.error("[WikiFarm] Search input not found!");
                }

                await sleep(2000); // Wait for search results to load

                // Find the add button in the box matching the username
                // Box structure: ... <span>targetUsername</span> ... <button>Ajouter</button>
                const spans = Array.from(document.querySelectorAll('span')).filter(el => el.textContent.trim() === targetUsername);
                for (let span of spans) {
                    // Go up to the container box and find the 'Ajouter' button
                    const box = span.closest('div.flex');
                    if (box) {
                        const addBtn = Array.from(box.querySelectorAll('button')).find(btn => btn.textContent.includes('Ajouter'));
                        if (addBtn) {
                            addBtn.click();
                            console.log(`[WikiFarm] Added ${targetUsername}`);
                            
                            // Notify server we sent the request
                            const targetRole = role === 'bot' ? 'intermediate' : 'main';
                            chrome.runtime.sendMessage({ action: 'notify_friend_request', targetRole: targetRole });
                            
                            // Save to storage so we don't add them again
                            chrome.storage.local.set({ ['friendAdded_' + targetUsername]: true });
                            break;
                        }
                    }
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
            chrome.storage.local.get(['friendRequests'], (res) => {
                const requests = res.friendRequests || [];
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

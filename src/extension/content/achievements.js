const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function main() {
    if (window.botConfig.type !== 'bot' && window.botConfig.type !== 'intermediate') return;
    console.log("[WikiFarm] Claiming achievements...");

    // Wait for the achievements list to load
    let claimBtns = [];
    for (let i = 0; i < 20; i++) {
        claimBtns = Array.from(document.querySelectorAll('button')).filter(el => {
            const t = el.textContent.toLowerCase();
            return (t.includes('réclamer') || t.includes('récupérer') || t.includes('obtenir')) && !el.disabled;
        });
        if (claimBtns.length > 0) break;
        await sleep(500);
    }
    
    if (claimBtns.length === 0) {
        console.warn("[WikiFarm] No achievements to claim found.");
    }
    
    for (let btn of claimBtns) {
        btn.click();
        await sleep(1000); // 1 sec delay between claims as requested
    }

    if (window.botConfig.env.SEND === 'false') {
        console.log("[WikiFarm] SEND=false. Logging out directly from achievements...");
        
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
            const clickable = logoutBtn.closest('button') || logoutBtn.closest('a') || logoutBtn;
            clickable.click();
            console.log("[WikiFarm] Successfully logged out.");
            
            chrome.storage.local.get(['myUsername'], (res) => {
                if (res.myUsername) {
                    chrome.runtime.sendMessage({ action: 'release_account', username: res.myUsername });
                }
                chrome.storage.local.remove(['currentAssignment', 'myUsername'], () => {
                    setTimeout(() => {
                        window.location.href = 'https://www.wiki-masters.com/login';
                    }, 2000);
                });
            });
        } else {
            console.error("[WikiFarm] Logout button not found!");
            window.location.href = 'https://www.wiki-masters.com/login';
        }
    } else {
        console.log("[WikiFarm] Finished claiming achievements. Navigating to trades...");
        await sleep(1000);
        window.location.href = 'https://www.wiki-masters.com/trades';
    }
}

main();

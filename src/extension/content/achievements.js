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

    console.log("[WikiFarm] Finished claiming achievements. Navigating to trades...");
    await sleep(1000);
    window.location.href = 'https://www.wiki-masters.com/trades';
}

main();

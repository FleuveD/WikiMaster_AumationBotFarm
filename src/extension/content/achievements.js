const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function main() {
    if (window.botConfig.type !== 'bot' && window.botConfig.type !== 'intermediate') return;
    console.log("[WikiFarm] Claiming achievements...");

    await sleep(2000);

    const claimBtns = Array.from(document.querySelectorAll('button')).filter(el => el.textContent.includes('Réclamer') && !el.disabled);
    
    for (let btn of claimBtns) {
        btn.click();
        await sleep(1000); // 1 sec delay between claims as requested
    }

    console.log("[WikiFarm] Finished claiming achievements. Navigating to trades...");
    await sleep(1000);
    window.location.href = 'https://www.wiki-masters.com/trades';
}

main();

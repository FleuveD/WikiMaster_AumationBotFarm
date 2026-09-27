const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const setStatus = (status, color = 'yellow') => {
    chrome.runtime.sendMessage({ action: 'update_status', status, color });
};

async function handleVerificationPopup() {
    let foundPopup = Array.from(document.querySelectorAll('p')).some(p => p.textContent.includes('Vérification rapide'));
    if (!foundPopup) return false;

    console.log("[WikiFarm] Manual verification popup detected.");
    
    let verifCheckbox = document.querySelector('input[type="checkbox"]');
    if (verifCheckbox) {
        console.log("[WikiFarm] Found native checkbox, clicking it...");
        verifCheckbox.click();
    } else {
        console.log("[WikiFarm] No native checkbox found, waiting for Playwright Turnstile solver...");
    }
    
    // Wait for the verification to be accepted (either native or Playwright)
    let continueVerifBtn = null;
    for (let v = 0; v < 30; v++) { // Wait up to 30 seconds
        continueVerifBtn = Array.from(document.querySelectorAll('button')).find(el => el.textContent.trim() === 'Continuer');
        
        if (continueVerifBtn && !continueVerifBtn.disabled) {
            console.log("[WikiFarm] Verification passed, Continuer button is ready!");
            break;
        }
        await sleep(1000);
    }
    
    if (continueVerifBtn && !continueVerifBtn.disabled) {
        continueVerifBtn.click();
        console.log("[WikiFarm] Clicked continue on manual verification.");
    } else if (continueVerifBtn) {
        console.log("[WikiFarm] Continuer button is still disabled. Forcing click...");
        continueVerifBtn.disabled = false;
        continueVerifBtn.click();
    } else {
        console.log("[WikiFarm] Continuer button not found! Pop-up might have closed by itself.");
    }
    
    await sleep(2000); // Wait for the popup to disappear
    return true;
}

async function main() {
    if (window.botConfig.type !== 'bot') return;
    setStatus('OPENING PACKS', 'green');
    console.log("[WikiFarm] Starting Pull sequence for Bot");

    // Check for "Vérification rapide" (anti-bot manual check) with a wait loop on page load
    for (let i = 0; i < 20; i++) {
        if (await handleVerificationPopup()) break;
        await sleep(200);
    }

    // Loop 10 times to open packs
    for (let i = 0; i < 10; i++) {
        await sleep(1000); // safety wait
        
        // Find pack button with a 20-second wait loop
        let openBtn = null;
        for (let j = 0; j < 100; j++) { // 100 * 200ms = 20s
            // Constantly check for popup during waiting
            await handleVerificationPopup();
            
            openBtn = document.querySelector('img[alt="Ouvrir un paquet"]')?.closest('button') 
                || Array.from(document.querySelectorAll('button')).find(el => el.textContent.trim() === 'Ouvrir');
            
            if (openBtn) break;
            await sleep(200);
        }

        // Check one last time before clicking, just in case it popped up
        await handleVerificationPopup();

        if (!openBtn) {
            console.log("[WikiFarm] No pack button found, ending pulls early.");
            break;
        }

        openBtn.click();
        
        // Wait for the next arrow to appear (animation might take time)
        let nextBtn = null;
        for (let k = 0; k < 100; k++) { // wait up to 10 seconds!
            // Search by svg polyline which is totally unique to this button
            const svgArrow = document.querySelector('polyline[points="9 18 15 12 9 6"]');
            if (svgArrow) {
                nextBtn = svgArrow.closest('button');
            }
            if (!nextBtn) {
                nextBtn = document.querySelector('button.w-12.h-12.rounded-full');
            }
            if (nextBtn) break;
            await sleep(100);
        }

        await sleep(300); // 6.2 Attend 0.3 seconde

        // Click next arrow 5 times
        for (let c = 0; c < 5; c++) {
            if (nextBtn) {
                nextBtn.click();
            }
            await sleep(200); // 6.3 0.2 seconde de délais
        }

        await sleep(1000); // 6.4 Attend 1 seconde

        // Click Continue
        let continueBtn = Array.from(document.querySelectorAll('button')).find(el => el.textContent.trim() === 'Continuer');
        if (continueBtn) {
            continueBtn.click();
        }
        
        await sleep(200); // 6.5 Attend 0.2 seconde à la fin
    }

    console.log("[WikiFarm] Pulls finished. Navigating to achievements...");
    await sleep(200);
    window.location.href = 'https://www.wiki-masters.com/achievements';
}

main();

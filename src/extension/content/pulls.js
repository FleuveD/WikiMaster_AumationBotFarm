const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function main() {
    if (window.botConfig.type !== 'bot') return;
    console.log("[WikiFarm] Starting Pull sequence for Bot");

    // Check for "Vérification rapide" (anti-bot manual check) with a wait loop
    let foundPopup = false;
    for (let i = 0; i < 20; i++) {
        if (Array.from(document.querySelectorAll('p')).some(p => p.textContent.includes('Vérification rapide'))) {
            foundPopup = true;
            break;
        }
        await sleep(200);
    }

    if (foundPopup) {
        console.log("[WikiFarm] Manual verification popup detected. Clicking checkbox...");
        let verifCheckbox = document.querySelector('input[type="checkbox"]');
        if (verifCheckbox) {
            verifCheckbox.click();
            await sleep(1000);
            
            let continueVerifBtn = Array.from(document.querySelectorAll('button')).find(el => el.textContent.trim() === 'Continuer');
            if (continueVerifBtn && !continueVerifBtn.disabled) {
                continueVerifBtn.click();
                console.log("[WikiFarm] Clicked continue on manual verification.");
            } else if (continueVerifBtn) {
                console.log("[WikiFarm] Continuer button is still disabled. Forcing click...");
                continueVerifBtn.disabled = false;
                continueVerifBtn.click();
            }
        }
        await sleep(2000); // Wait for the popup to disappear
    }

    // Loop 10 times to open packs
    for (let i = 0; i < 10; i++) {
        await sleep(1000); // safety wait
        
        // Find pack button with a 20-second wait loop
        let openBtn = null;
        for (let j = 0; j < 100; j++) { // 100 * 200ms = 20s
            openBtn = document.querySelector('img[alt="Ouvrir un paquet"]')?.closest('button') 
                || Array.from(document.querySelectorAll('button')).find(el => el.textContent.trim() === 'Ouvrir');
            
            if (openBtn) break;
            await sleep(200);
        }

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

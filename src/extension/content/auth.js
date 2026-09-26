// Common helpers
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const setStatus = (status, color = 'yellow') => {
    chrome.runtime.sendMessage({ action: 'update_status', status, color });
};

const FRENCH_WORDS = [
    "loup", "renard", "aigle", "ours", "chat", "chien", "lion", "tigre", "ombre", "lumiere",
    "soleil", "lune", "etoile", "ciel", "mer", "montagne", "vent", "feu", "glace", "pierre",
    "fleur", "arbre", "foret", "nuage", "pluie", "neige", "or", "argent", "fer", "cuivre",
    "bois", "roi", "reine", "prince", "chevalier", "dragon", "phenix", "faucon", "corbeau",
    "lame", "epee", "bouclier", "fleche", "arc", "chasseur", "guerrier", "mage", "voleur",
    "fantome", "esprit", "mystere", "secret", "legende", "mythe", "heros", "voyageur",
    "vagabond", "marin", "pirate", "corsaire", "sorcier", "demon", "ange", "titan", "geant",
    "nain", "elfe", "gobelin", "orc", "troll", "monstre", "bleu", "rouge", "vert", "noir",
    "blanc", "sombre", "clair", "vif", "lent", "fort", "faible", "grand", "petit", "sauvage"
];

function generateRealisticUsername() {
    const getRandomWord = () => FRENCH_WORDS[Math.floor(Math.random() * FRENCH_WORDS.length)];
    const format = Math.floor(Math.random() * 4);
    let username = "";
    
    switch (format) {
        case 0:
            // {mot}2{mot}
            username = getRandomWord() + "2" + getRandomWord();
            break;
        case 1:
            // {mot}{123...}
            username = getRandomWord() + Math.floor(Math.random() * 9999);
            break;
        case 2:
            // {mot}_
            username = getRandomWord() + "_";
            break;
        case 3:
            // {mot}.
            username = getRandomWord() + ".";
            break;
    }
    
    if (Math.random() > 0.5) {
        username = username.charAt(0).toUpperCase() + username.slice(1);
    }
    
    return username;
}

async function main() {
    // Init socket connection immediately so status updates work
    chrome.storage.local.get(['myUsername'], (res) => {
        chrome.runtime.sendMessage({
            action: 'init', 
            role: window.botConfig.type, 
            botIndex: window.botConfig.botIndex,
            username: res.myUsername || 'pending'
        });
    });
    
    // Save bot index early
    chrome.storage.local.set({ myBotIndex: window.botConfig.botIndex });

    // Auto-loop for bot: if it lands on login or home (after logout), redirect to signup
    if (window.botConfig.type === 'bot' && (window.location.pathname === '/login' || window.location.pathname === '/')) {
        console.log("[WikiFarm] Bot landed on " + window.location.pathname + ". Redirecting to /signup for next loop...");
        window.location.href = 'https://www.wiki-masters.com/signup';
        return;
    }

    // Check if we are on login or signup
    if (window.location.pathname === '/login' && window.botConfig.type === 'main') {
        await doLogin();
    } else if (window.location.pathname === '/signup' && (window.botConfig.type === 'bot' || window.botConfig.type === 'intermediate')) {
        await doSignup();
    }
}

async function doLogin() {
    setStatus('LOGGING IN', 'yellow');
    console.log("[WikiFarm] Starting Login sequence for Main Account");
    
    // Wait for the actual login form to appear (bypassing Cloudflare interstitial)
    let formAppeared = false;
    for (let i = 0; i < 60; i++) {
        if (document.getElementById('email') || document.getElementById('password') || document.querySelector('form')) {
            formAppeared = true;
            break;
        }
        await sleep(1000);
    }
    
    if (!formAppeared) {
        console.error("[WikiFarm] Login form never appeared! Stuck on Cloudflare?");
        return;
    }

    // Init already done in main()
    chrome.storage.local.set({ myUsername: window.botConfig.env.MAIN_ACCOUNT_NAME, myRole: window.botConfig.type });

    await sleep(3000);
    
    const setReactValue = (element, val) => {
        const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
        nativeInputValueSetter.call(element, val);
        element.dispatchEvent(new Event('input', { bubbles: true }));
    };

    const emailInput = document.getElementById('email');
    if (emailInput) {
        setReactValue(emailInput, window.botConfig.env.MAIN_ACCOUNT_EMAIL);
    }

    const passwordInput = document.getElementById('password');
    if (passwordInput) {
        setReactValue(passwordInput, window.botConfig.env.MAIN_ACCOUNT_PASSWORD);
    }

    await sleep(5000);

    // Cloudflare is handled by content/cloudflare.js

    await sleep(2000);

    const submitBtn = Array.from(document.querySelectorAll('button')).find(el => el.textContent.includes('Connexion'));
    if (submitBtn) {
        submitBtn.click();
    }
    
    await sleep(10000);
    console.log("[WikiFarm] Login complete. Navigating to friends page.");
    window.location.href = 'https://www.wiki-masters.com/friends';
}

async function doSignup() {
    setStatus('SIGNING UP', 'yellow');
    console.log("[WikiFarm] Starting Signup sequence for", window.botConfig.type);
    
    // Wait for the actual signup form to appear (bypassing Cloudflare interstitial)
    let formAppeared = false;
    for (let i = 0; i < 60; i++) {
        if (document.getElementById('username') || document.getElementById('email') || document.querySelector('form')) {
            formAppeared = true;
            break;
        }
        await sleep(1000);
    }
    
    if (!formAppeared) {
        console.error("[WikiFarm] Signup form never appeared! Stuck on Cloudflare?");
        return;
    }
    
    await sleep(2000);

    // Get email from mail.tm
    chrome.runtime.sendMessage({ action: 'create_mail' }, async (response) => {
        if (!response || !response.email) {
            console.error("[WikiFarm] Failed to get email");
            return;
        }

        const email = response.email;
        const randomString = Math.random().toString(36).substring(2, 12);
        const username = generateRealisticUsername();
        const password = randomString + '123A';

        // Re-init socket with final username
        chrome.runtime.sendMessage({
            action: 'init', 
            role: window.botConfig.type, 
            botIndex: window.botConfig.botIndex,
            username: username
        });
        
        // Save auth data and clear old friend flags so a new bot session can re-add targets
        chrome.storage.local.clear(() => {
            chrome.storage.local.set({ 
                myUsername: username, 
                myRole: window.botConfig.type,
                myBotIndex: window.botConfig.botIndex
            });
        });

        const setReactValue = (element, val) => {
            const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
            nativeInputValueSetter.call(element, val);
            element.dispatchEvent(new Event('input', { bubbles: true }));
        };

        // Fill form
        const userInp = document.getElementById('username');
        if (userInp) {
            setReactValue(userInp, username);
        }

        const mailInp = document.getElementById('email');
        if (mailInp) {
            setReactValue(mailInp, email);
        }

        const passInp = document.getElementById('password');
        if (passInp) {
            setReactValue(passInp, password);
        }

        const checkboxes = document.querySelectorAll('input[type="checkbox"]');
        checkboxes.forEach(cb => {
            if (!cb.checked) {
                const label = cb.closest('label');
                if (label) {
                    // Clicking the label automatically toggles the checkbox and triggers React's internal state
                    label.click();
                } else {
                    // Fallback to clicking the checkbox directly
                    cb.click();
                    cb.dispatchEvent(new Event('change', { bubbles: true }));
                }
            }
        });

        // Wait for Cloudflare Turnstile to be solved and Form to be Validated
        console.log("[WikiFarm] Waiting for Cloudflare Turnstile & Form Validation...");
        for (let j = 0; j < 30; j++) {
            const submitBtn = Array.from(document.querySelectorAll('button')).find(el => el.textContent.includes('Créer mon compte') || el.textContent.includes('S\'inscrire'));
            if (submitBtn && !submitBtn.disabled) {
                console.log("[WikiFarm] Turnstile solved & Submit button is enabled!");
                break;
            }
            
            // If the button still doesn't exist or isn't enabled after 15 seconds, assume we might be stuck
            if (j > 15 && (!submitBtn || submitBtn.disabled)) {
                // Keep waiting but log
                if (j === 16) console.log("[WikiFarm] Still waiting for validation...");
            }
            
            await sleep(1000);
        }

        const submitBtn = Array.from(document.querySelectorAll('button')).find(el => el.textContent.includes('Créer mon compte'));
        if (submitBtn) {
            // Wait for button to become enabled
            for (let k = 0; k < 20; k++) {
                if (!submitBtn.disabled) break;
                await sleep(500);
            }
            if (!submitBtn.disabled) {
                submitBtn.click();
                console.log("[WikiFarm] Clicked 'Créer mon compte'.");
            } else {
                console.error("[WikiFarm] ERROR: 'Créer mon compte' is STILL DISABLED after Turnstile!");
            }
        } else {
            console.error("[WikiFarm] ERROR: Submit button not found!");
        }

        await sleep(2000);

        // Polling for OTP
        setStatus('WAITING FOR OTP', 'yellow');
    console.log("[WikiFarm] Waiting for OTP...");
        let otp = null;
        for (let i = 0; i < 60; i++) { // wait up to 60s
            await sleep(1000);
            const otpRes = await new Promise(resolve => chrome.runtime.sendMessage({ action: 'fetch_otp' }, resolve));
            if (otpRes) {
                otp = otpRes;
                break;
            }
        }

        if (otp) {
            console.log("[WikiFarm] Got OTP:", otp);
            
            // Wait for OTP input to appear
            let otpInput = null;
            for (let j = 0; j < 20; j++) {
                const inputs = Array.from(document.querySelectorAll('input:not([type="hidden"])'));
                otpInput = inputs.find(el => 
                    el.autocomplete === 'one-time-code' || 
                    (el.name && el.name.toLowerCase().includes('otp')) || 
                    (el.name && el.name.toLowerCase().includes('token')) || 
                    (el.id && el.id.toLowerCase().includes('otp')) || 
                    (el.id && el.id.toLowerCase().includes('token')) ||
                    (el.id && el.id.toLowerCase().includes('code')) ||
                    (el.placeholder && el.placeholder.toLowerCase().includes('code'))
                );
                if (otpInput) break;
                await sleep(1000);
            }

            if (otpInput) {
                otpInput.focus();
                otpInput.click();
                setReactValue(otpInput, otp);
                
                await sleep(500);
                
                // Click Verify button instead of enter
                const buttons = Array.from(document.querySelectorAll('button'));
                const verifyBtn = buttons.find(el => 
                    el.textContent.includes('Vérifier') || 
                    el.textContent.includes('Confirmer') || 
                    el.textContent.includes('Valider') ||
                    (el.textContent.includes('Continuer') && !el.textContent.includes('Création'))
                );
                
                if (verifyBtn) {
                    verifyBtn.click();
                    console.log("[WikiFarm] Clicked Verify/Submit button:", verifyBtn.textContent);
                } else {
                    console.error("[WikiFarm] Verify button not found! Fallback to Enter.");
                    // fallback to enter just in case
                    otpInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true, cancelable: true }));
                    otpInput.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', bubbles: true, cancelable: true }));
                }

                // Wait for backend to process OTP and redirect away from signup
                for (let k = 0; k < 30; k++) {
                    await sleep(1000);
                    if (!window.location.href.includes('/signup')) {
                        console.log("[WikiFarm] URL changed, OTP accepted!");
                        break;
                    }
                }
                
                // Extra sleep just to ensure session is fully saved in cookies/localstorage
                await sleep(3000);
                
                if (window.botConfig.type === 'bot') {
                    console.log("[WikiFarm] Signup complete. Navigating to friends.");
                    window.location.href = 'https://www.wiki-masters.com/friends';
                } else if (window.botConfig.type === 'intermediate') {
                    setStatus('SIGNUP COMPLETE', 'green');
                    console.log("[WikiFarm] Signup complete. Navigating to friends.");
                    window.location.href = 'https://www.wiki-masters.com/friends';
                }
            } else {
                console.error("[WikiFarm] OTP input field NOT FOUND on the page! Inputs found:", Array.from(document.querySelectorAll('input')).map(i => i.outerHTML));
            }
        } else {
            console.error("[WikiFarm] OTP not received in time");
        }
    });
}

main();

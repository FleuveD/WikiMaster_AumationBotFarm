// Common helpers
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function main() {
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
    console.log("[WikiFarm] Starting Login sequence for Main Account");
    // Init socket connection via background script
    chrome.runtime.sendMessage({
        action: 'init', 
        role: window.botConfig.type, 
        username: window.botConfig.env.MAIN_ACCOUNT_NAME
    });
    chrome.storage.local.set({ myUsername: window.botConfig.env.MAIN_ACCOUNT_NAME, myRole: window.botConfig.type });

    await sleep(3000);
    
    const emailInput = document.getElementById('email');
    if (emailInput) {
        emailInput.value = window.botConfig.env.MAIN_ACCOUNT_EMAIL;
        emailInput.dispatchEvent(new Event('input', { bubbles: true }));
    }

    const passwordInput = document.getElementById('password');
    if (passwordInput) {
        passwordInput.value = window.botConfig.env.MAIN_ACCOUNT_PASSWORD;
        passwordInput.dispatchEvent(new Event('input', { bubbles: true }));
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
    console.log("[WikiFarm] Starting Signup sequence for", window.botConfig.type);
    
    await sleep(2000);

    // Get email from mail.tm
    chrome.runtime.sendMessage({ action: 'create_mail' }, async (response) => {
        if (!response || !response.email) {
            console.error("[WikiFarm] Failed to get email");
            return;
        }

        const email = response.email;
        const randomString = Math.random().toString(36).substring(2, 12);
        const username = "WF_" + randomString.replace(/[^a-zA-Z0-9]/g, '');
        const password = randomString + '123A';

        // Init socket connection
        chrome.runtime.sendMessage({
            action: 'init', 
            role: window.botConfig.type, 
            username: username
        });
        
        // Save auth data and clear old friend flags so a new bot session can re-add targets
        chrome.storage.local.clear(() => {
            chrome.storage.local.set({ myUsername: username, myRole: window.botConfig.type });
        });

        // Fill form
        const userInp = document.getElementById('username');
        if (userInp) {
            userInp.value = username;
            userInp.dispatchEvent(new Event('input', { bubbles: true }));
        }

        const mailInp = document.getElementById('email');
        if (mailInp) {
            mailInp.value = email;
            mailInp.dispatchEvent(new Event('input', { bubbles: true }));
        }

        const passInp = document.getElementById('password');
        if (passInp) {
            passInp.value = password;
            passInp.dispatchEvent(new Event('input', { bubbles: true }));
        }

        const checkboxes = document.querySelectorAll('input[type="checkbox"]');
        checkboxes.forEach(cb => {
            if (!cb.checked) cb.click();
        });

        // Wait for Cloudflare Turnstile to be solved
        console.log("[WikiFarm] Waiting for Cloudflare Turnstile...");
        for (let j = 0; j < 25; j++) {
            const tsInput = document.querySelector('input[name="cf-turnstile-response"]');
            // If the input exists and has a value, it's solved!
            if (tsInput && tsInput.value && tsInput.value.length > 10) {
                console.log("[WikiFarm] Turnstile solved successfully!");
                break;
            }
            
            // If there's no turnstile widget in the DOM at all after 10 seconds, assume it's not required
            if (!tsInput && j > 10) {
                console.log("[WikiFarm] No Turnstile detected, proceeding...");
                break;
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
            const otpInput = document.getElementById('signup-otp-code') || document.querySelector('input[name="otp"]');
            if (otpInput) {
                otpInput.focus();
                otpInput.click();
                otpInput.value = otp;
                otpInput.dispatchEvent(new Event('input', { bubbles: true }));
                otpInput.dispatchEvent(new Event('change', { bubbles: true }));
                
                await sleep(500);
                
                // Click Verify button instead of enter
                const verifyBtn = Array.from(document.querySelectorAll('button')).find(el => el.textContent.includes('Vérifier et continuer'));
                if (verifyBtn) {
                    verifyBtn.click();
                    console.log("[WikiFarm] Clicked Verify button");
                } else {
                    console.error("[WikiFarm] Verify button not found");
                    // fallback to enter just in case
                    otpInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true, cancelable: true }));
                    otpInput.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', bubbles: true, cancelable: true }));
                }

                // Wait for backend to process OTP and create account
                await sleep(10000);
                
                if (window.botConfig.type === 'bot') {
                    console.log("[WikiFarm] Signup complete. Navigating to friends.");
                    window.location.href = 'https://www.wiki-masters.com/friends';
                } else if (window.botConfig.type === 'intermediate') {
                    console.log("[WikiFarm] Signup complete. Navigating to friends.");
                    window.location.href = 'https://www.wiki-masters.com/friends';
                }
            }
        } else {
            console.error("[WikiFarm] OTP not received in time");
        }
    });
}

main();

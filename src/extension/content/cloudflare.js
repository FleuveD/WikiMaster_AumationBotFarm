// Cloudflare auto-clicker for Turnstile
let clicked = false;

setInterval(() => {
    if (clicked) return;

    // Look for the inner label or the specific span or the checkbox itself
    const box = document.querySelector('label.zDYAI4') || 
                document.querySelector('.pUvpD4') || 
                document.querySelector('input[type="checkbox"]');
    
    if (box) {
        console.log("[WikiFarm] Turnstile checkbox found! Attempting click...");
        
        // 1. Standard DOM click
        box.click();
        
        // 2. Dispatch MouseEvents
        const events = ['mouseover', 'mousedown', 'mouseup', 'click'];
        events.forEach(eventType => {
            const event = new MouseEvent(eventType, {
                view: window,
                bubbles: true,
                cancelable: true,
                buttons: eventType === 'mousedown' ? 1 : 0
            });
            box.dispatchEvent(event);
        });

        console.log("[WikiFarm] Turnstile clicked via script.");
        clicked = true;
    } else {
        // As a fallback, try to click the body in case the whole iframe is the widget
        const body = document.querySelector('body');
        if (body && !clicked && document.body.innerHTML.includes('Checking your Browser')) {
           // We are in the waiting page, let's just wait
           console.log("[WikiFarm] Turnstile is in checking state...");
        }
    }
}, 1000);

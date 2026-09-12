import { io } from './socket.io.esm.min.js';

let socket = null;
let currentRole = null;
let currentUsername = null;
let mailToken = null;
let mailAccountId = null;
let mailAddress = null;

// Connect to Local Express Server
function connectToServer(role, username) {
    currentRole = role;
    currentUsername = username;

    if (socket) {
        // If already connected, re-register with the new username
        socket.emit('register', { role, username });
        return;
    }
    
    socket = io('http://localhost:3000', {
        transports: ['websocket'],
        reconnection: true
    });
    
    socket.on('connect', () => {
        console.log('[Background] Connected to local server');
        socket.emit('register', { role: currentRole, username: currentUsername });
    });

    socket.on('friend_request_received', (data) => {
        // We can pass this to content script or store it in chrome.storage
        chrome.storage.local.get(['friendRequests'], (res) => {
            const requests = res.friendRequests || [];
            requests.push(data.username);
            chrome.storage.local.set({ friendRequests: requests });
            
            // Auto-navigate to /friends to accept it
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                if (tabs.length > 0) {
                    chrome.tabs.update(tabs[0].id, { url: 'https://www.wiki-masters.com/friends' });
                }
            });
        });
    });

    socket.on('trade_offer_received', (data) => {
        chrome.storage.local.get(['tradeOffers'], (res) => {
            const offers = res.tradeOffers || [];
            offers.push(data.username);
            chrome.storage.local.set({ tradeOffers: offers });
            
            // Auto-navigate to /trades to accept it
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                if (tabs.length > 0) {
                    chrome.tabs.update(tabs[0].id, { url: 'https://www.wiki-masters.com/trades' });
                }
            });
        });
    });
}

// Mail.tm API Functions
async function createMailAccount(retries = 5) {
    for (let i = 0; i < retries; i++) {
        try {
            // 1. Get Domains
            const domainRes = await fetch('https://api.mail.tm/domains');
            if (!domainRes.ok) throw new Error(`Domains response not OK: ${domainRes.status}`);
            const domains = await domainRes.json();
            const domain = domains['hydra:member'][0].domain;

            // 2. Generate Account
            const randomString = Math.random().toString(36).substring(2, 12);
            mailAddress = `${randomString}@${domain}`;
            const password = randomString + '123!'; // random password

            const accountRes = await fetch('https://api.mail.tm/accounts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ address: mailAddress, password })
            });
            if (!accountRes.ok) throw new Error(`Account response not OK: ${accountRes.status}`);
            const account = await accountRes.json();
            mailAccountId = account.id;

            // 3. Login to get token
            const tokenRes = await fetch('https://api.mail.tm/token', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ address: mailAddress, password })
            });
            if (!tokenRes.ok) throw new Error(`Token response not OK: ${tokenRes.status}`);
            const tokenData = await tokenRes.json();
            mailToken = tokenData.token;

            return { email: mailAddress };
        } catch (e) {
            console.error(`[Background] Error creating mail.tm account (Attempt ${i+1}/${retries}):`, e);
            if (i < retries - 1) {
                // Wait between 3 and 8 seconds to stagger requests
                await new Promise(r => setTimeout(r, 3000 + Math.random() * 5000));
            }
        }
    }
    return null;
}

async function fetchOtp() {
    if (!mailToken) return null;
    try {
        const messagesRes = await fetch('https://api.mail.tm/messages', {
            headers: { 'Authorization': `Bearer ${mailToken}` }
        });
        const messagesData = await messagesRes.json();
        const messages = messagesData['hydra:member'];
        
        if (messages.length > 0) {
            const msgId = messages[0].id;
            const msgDetailRes = await fetch(`https://api.mail.tm/messages/${msgId}`, {
                headers: { 'Authorization': `Bearer ${mailToken}` }
            });
            const msgDetail = await msgDetailRes.json();
            
            // Extract OTP from either text or HTML content
            const contentToSearch = msgDetail.text || msgDetail.html || msgDetail.intro || "";
            // Look for 6 consecutive digits
            const match = contentToSearch.match(/\b(\d{6})\b/);
            if (match) return match[1];
        }
        return null;
    } catch (e) {
        console.error("Error fetching OTP:", e);
        return null;
    }
}

// Message listener from content scripts
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'init') {
        connectToServer(request.role, request.username);
        sendResponse({ success: true });
    } else if (request.action === 'create_mail') {
        createMailAccount().then(sendResponse);
        return true; // async response
    } else if (request.action === 'fetch_otp') {
        fetchOtp().then(sendResponse);
        return true;
    } else if (request.action === 'get_target') {
        if (socket && socket.connected) {
            socket.emit('get_target', { role: currentRole }, (res) => {
                sendResponse(res);
            });
            return true;
        } else {
            sendResponse({ success: false, message: 'Socket not connected' });
        }
    } else if (request.action === 'notify_friend_request') {
        if (socket && socket.connected) {
            socket.emit('friend_request_sent', {
                fromRole: currentRole,
                fromUsername: currentUsername,
                toRole: request.targetRole
            });
        }
        sendResponse({ success: true });
    } else if (request.action === 'notify_trade_offer') {
        if (socket && socket.connected) {
            socket.emit('trade_offer_sent', {
                fromRole: currentRole,
                fromUsername: currentUsername,
                toRole: request.targetRole
            });
        }
        sendResponse({ success: true });
    }
});

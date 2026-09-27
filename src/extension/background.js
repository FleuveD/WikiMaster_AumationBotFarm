import { io } from './socket.io.esm.min.js';

let socket = null;
let currentRole = null;
let currentUsername = null;
let currentBotIndex = null;
let lastStatus = null;
let lastColor = null;
let mailToken = null;
let mailAccountId = null;
let mailAddress = null;

// Connect to Local Express Server
function connectToServer(role, username, botIndex) {
    currentRole = role;
    currentUsername = username;
    currentBotIndex = botIndex;

    if (socket) {
        // If already connected, re-register with the new username
        socket.emit('register', { role, username, botIndex });
        return;
    }
    
    socket = io('http://localhost:3000', {
        transports: ['websocket'],
        reconnection: true
    });
    
    socket.on('connect', () => {
        if (process.env && process.env.DEBUG === 'true') console.log('[Background] Connected to local server');
        socket.emit('register', { role: currentRole, username: currentUsername, botIndex: currentBotIndex });
        if (lastStatus) {
            socket.emit('update_status', { status: lastStatus, color: lastColor });
        }
    });

    socket.on('friend_request_received', (data) => {
        // We can pass this to content script or store it in chrome.storage
        chrome.storage.local.get(['friendRequests', 'intermediateState', 'myRole'], (res) => {
            const requests = res.friendRequests || [];
            requests.push(data.username);
            chrome.storage.local.set({ friendRequests: requests });
            
            // Do not interrupt intermediate if it's currently sending to main
            if (res.myRole === 'intermediate' && res.intermediateState === 'sending_to_main') return;

            // Auto-navigate to /friends to accept it
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                if (tabs.length > 0) {
                    chrome.tabs.update(tabs[0].id, { url: 'https://www.wiki-masters.com/friends' });
                }
            });
        });
    });

    socket.on('trade_offer_received', (data) => {
        chrome.storage.local.get(['tradeOffers', 'intermediateState', 'myRole'], (res) => {
            const offers = res.tradeOffers || [];
            offers.push(data.username);
            chrome.storage.local.set({ tradeOffers: offers });
            
            // Do not interrupt intermediate if it's currently sending to main
            if (res.myRole === 'intermediate' && res.intermediateState === 'sending_to_main') return;

            // Auto-navigate to /trades to accept it
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                if (tabs.length > 0) {
                    chrome.tabs.update(tabs[0].id, { url: 'https://www.wiki-masters.com/trades' });
                }
            });
        });
    });
}

// Local Proxy API Functions
async function createMailAccount(retries = 10) {
    for (let i = 0; i < retries; i++) {
        try {
            // Get a new random email address via local proxy
            const res = await fetch('http://localhost:3000/api/mail/create');
            if (!res.ok) throw new Error(`Proxy fetch failed: ${res.status}`);
            
            const data = await res.json();
            if (!data.success) throw new Error(data.error);
            
            mailAddress = data.email;
            mailToken = data.token;

            return { email: mailAddress };
        } catch (e) {
            console.log(`[Background] Error creating account via proxy (Attempt ${i+1}/${retries}): ${e.message}`);
            if (i < retries - 1) {
                const delay = (5000 * Math.pow(2, i)) + Math.random() * 5000;
                console.log(`[Background] Waiting ${Math.round(delay/1000)}s before next attempt...`);
                await new Promise(r => setTimeout(r, delay));
            }
        }
    }
    return null;
}

async function fetchOtp() {
    if (!mailToken) return null;
    try {
        const res = await fetch(`http://localhost:3000/api/mail/otp?token=${mailToken}`);
        if (!res.ok) throw new Error(`Proxy response not OK: ${res.status}`);
        
        const data = await res.json();
        if (data.success && data.otp) {
            return data.otp;
        }
        return null;
    } catch (e) {
        console.error("Error fetching OTP via proxy:", e);
        return null;
    }
}

// Message listener from content scripts
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'init') {
        connectToServer(request.role, request.username, request.botIndex);
        sendResponse({ success: true });
    } else if (request.action === 'update_status') {
        lastStatus = request.status;
        lastColor = request.color;
        
        if (!socket || !socket.connected) {
            chrome.storage.local.get(['myRole', 'myUsername', 'myBotIndex'], (res) => {
                if (res.myRole) {
                    connectToServer(res.myRole, res.myUsername, res.myBotIndex);
                }
            });
        } else {
            socket.emit('update_status', { status: request.status, color: request.color });
        }
        sendResponse({ success: true });
    } else if (request.action === 'update_counter') {
        if (!socket || !socket.connected) {
            chrome.storage.local.get(['myRole', 'myUsername', 'myBotIndex'], (res) => {
                if (res.myRole) {
                    connectToServer(res.myRole, res.myUsername, res.myBotIndex);
                }
            });
        } else {
            socket.emit('update_counter', { count: request.count });
        }
        sendResponse({ success: true });
    } else if (request.action === 'create_mail') {
        createMailAccount().then(sendResponse);
        return true; // async response
    } else if (request.action === 'fetch_otp') {
        fetchOtp().then(sendResponse);
        return true;
    } else if (request.action === 'get_account_assignment') {
        if (socket && socket.connected) {
            socket.emit('get_account_assignment', { role: request.role }, (res) => {
                sendResponse(res);
            });
            return true;
        } else {
            // Need to connect first, then emit
            chrome.storage.local.get(['myRole', 'myUsername', 'myBotIndex'], (res) => {
                connectToServer(res.myRole || request.role, res.myUsername, res.myBotIndex);
                // Wait briefly for connection
                setTimeout(() => {
                    socket.emit('get_account_assignment', { role: request.role }, (assignment) => {
                        sendResponse(assignment);
                    });
                }, 1000);
            });
            return true;
        }
    } else if (request.action === 'save_account') {
        if (socket && socket.connected) {
            socket.emit('save_account', request.accountData);
        }
        sendResponse({ success: true });
    } else if (request.action === 'release_account') {
        if (socket && socket.connected) {
            socket.emit('release_account', { username: request.username });
        }
        sendResponse({ success: true });
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

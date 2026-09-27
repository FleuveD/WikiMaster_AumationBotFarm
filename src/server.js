require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const fs = require('fs');
const path = require('path');

const accountsFile = path.join(__dirname, '..', 'accounts.json');

class AccountManager {
    constructor() {
        this.accounts = [];
        this.load();
    }
    load() {
        try {
            if (fs.existsSync(accountsFile)) {
                this.accounts = JSON.parse(fs.readFileSync(accountsFile, 'utf8'));
            }
        } catch (e) {
            console.error("Failed to load accounts.json", e);
        }
    }
    save() {
        fs.writeFileSync(accountsFile, JSON.stringify(this.accounts, null, 2));
    }
    getNextAssignment(role) {
        const now = Date.now();
        const COOLDOWN_MS = 2 * 60 * 60 * 1000; // 2 hours
        const available = this.accounts.find(a => a.role === role && (!a.last_used || now - a.last_used > COOLDOWN_MS) && !a.in_use);
        
        if (available) {
            available.in_use = true;
            return { action: 'LOGIN', account: available };
        }
        
        const limit = parseInt(process.env.ACCOUNT_LIMIT) || 2000;
        const roleCount = this.accounts.filter(a => a.role === role).length;
        if (roleCount < limit) {
            return { action: 'CREATE_NEW' };
        }
        return { action: 'WAIT' };
    }
    addAccount(accountData) {
        const existing = this.accounts.find(a => a.username === accountData.username);
        if (existing) return;
        this.accounts.push({
            role: accountData.role,
            username: accountData.username,
            password: accountData.password,
            email: accountData.email,
            last_used: Date.now(),
            in_use: true
        });
        this.save();
    }
    releaseAccount(username) {
        const acc = this.accounts.find(a => a.username === username);
        if (acc) {
            acc.in_use = false;
            acc.last_used = Date.now();
            this.save();
        }
    }
    markAccountDead(username) {
        this.accounts = this.accounts.filter(a => a.username !== username);
        this.save();
    }
    releaseAll() {
        // Reset in_use flags on server restart
        this.accounts.forEach(a => a.in_use = false);
        this.save();
    }
}
const accountManager = new AccountManager();
accountManager.releaseAll();

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*", // Allow all origins for the extension
        methods: ["GET", "POST"]
    }
});

// Proxy routes for Mail API to bypass Chrome Extension CORS issues
app.get('/api/mail/create', async (req, res) => {
    try {
        const fetchRes = await fetch('https://api.tempmail.lol/generate');
        if (!fetchRes.ok) throw new Error(`Status ${fetchRes.status}`);
        const data = await fetchRes.json();
        res.json({ success: true, email: data.address, token: data.token });
    } catch(e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

app.get('/api/mail/otp', async (req, res) => {
    try {
        const token = req.query.token;
        const fetchRes = await fetch(`https://api.tempmail.lol/auth/${token}`);
        if (!fetchRes.ok) throw new Error(`Status ${fetchRes.status}`);
        const data = await fetchRes.json();
        const messages = data.email || [];
        
        if (messages.length > 0) {
            const msgDetail = messages[0];
            const contentToSearch = msgDetail.body || msgDetail.html || "";
            const match = contentToSearch.match(/\b(\d{6})\b/);
            if (match) return res.json({ success: true, otp: match[1] });
        }
        res.json({ success: true, otp: null });
    } catch(e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// Registry of connected extensions
const registry = {
    main: null,        // { socketId, username, status, color }
    intermediate: null, // { socketId, username, status, color }
    bots: new Map()    // botIndex -> { socketId, username, status, color }
};

let intermediateCounter = 0;

const C = {
    reset: "\x1b[0m",
    green: "\x1b[32m",
    yellow: "\x1b[33m",
    red: "\x1b[31m",
    bold: "\x1b[1m"
};

function renderDashboard() {
    if (process.env.DEBUG === 'true') return;

    console.clear();
    console.log(`${C.bold}============================================${C.reset}`);
    console.log(`${C.bold}        WIKIMASTER AUTOMATIONBOTFARM        ${C.reset}`);
    console.log(`${C.bold}============================================${C.reset}\n`);

    // Main
    let mainStatus = registry.main ? registry.main.status : 'WAITING';
    let mainColor = registry.main ? C[registry.main.color] || C.yellow : C.yellow;
    console.log(`    MAIN         - ${mainColor}${mainStatus}${C.reset}`);

    // Intermediate
    let intStatus = registry.intermediate ? registry.intermediate.status : 'WAITING';
    let intColor = registry.intermediate ? C[registry.intermediate.color] || C.yellow : C.yellow;
    console.log(`    INTERMEDIATE - ${intColor}${intStatus}${C.reset}`);

    // Bots
    const botCount = parseInt(process.env.BOT_COUNT) || 1;
    for (let i = 1; i <= botCount; i++) {
        let botFound = registry.bots.get(i) || registry.bots.get(i.toString());

        let bStatus = botFound ? botFound.status : 'LAUNCHING';
        let bColor = botFound ? C[botFound.color] || C.yellow : C.yellow;
        console.log(`    BOT ${i.toString().padEnd(8, ' ')} - ${bColor}${bStatus}${C.reset}`);
    }

    console.log(`\n${C.bold}=============================================${C.reset}`);
    console.log(`${C.bold}        INTERMEDIATE COUNTER : ${intermediateCounter}/45     ${C.reset}`);
    console.log(`${C.bold}=============================================${C.reset}\n`);
}

io.on('connection', (socket) => {
    if (process.env.DEBUG === 'true') console.log(`[+] New connection: ${socket.id}`);

    // Register a client (Main, Intermediate, Bot)
    socket.on('register', (data) => {
        const { role, username, botIndex } = data;
        if (process.env.DEBUG === 'true') console.log(`[*] Registering ${socket.id} as ${role} with username ${username}`);

        if (role === 'main') {
            registry.main = { socketId: socket.id, username, status: 'CONNECTED', color: 'green' };
        } else if (role === 'intermediate') {
            registry.intermediate = { socketId: socket.id, username, status: 'CONNECTED', color: 'green' };
            // Broadcast to bots that intermediate is available and its username
            socket.broadcast.emit('intermediate_ready', { username });
        } else if (role === 'bot') {
            registry.bots.set(botIndex, { socketId: socket.id, username, status: 'CONNECTED', color: 'green' });
        }

        // Acknowledge registration
        socket.emit('registered', { success: true });
        renderDashboard();
    });

    socket.on('update_status', (data) => {
        const { status, color } = data;
        if (registry.main && registry.main.socketId === socket.id) {
            registry.main.status = status;
            if (color) registry.main.color = color;
        } else if (registry.intermediate && registry.intermediate.socketId === socket.id) {
            registry.intermediate.status = status;
            if (color) registry.intermediate.color = color;
        } else {
            for (let bot of registry.bots.values()) {
                if (bot.socketId === socket.id) {
                    bot.status = status;
                    if (color) bot.color = color;
                    break;
                }
            }
        }
        renderDashboard();
    });

    socket.on('update_counter', (data) => {
        intermediateCounter = data.count || 0;
        renderDashboard();
    });

    // Ask for target username depending on role
    socket.on('get_target', (data, callback) => {
        const { role } = data;
        if (role === 'bot') {
            if (registry.intermediate && registry.intermediate.username) {
                callback({ success: true, username: registry.intermediate.username });
            } else {
                callback({ success: false, message: "Intermediate account not ready yet" });
            }
        } else if (role === 'intermediate') {
            if (registry.main && registry.main.username) {
                callback({ success: true, username: registry.main.username });
            } else {
                callback({ success: false, message: "Main account not ready yet" });
            }
        }
    });

    // Forward friend request intent to target
    socket.on('friend_request_sent', (data) => {
        const { fromRole, fromUsername, toRole } = data;
        if (process.env.DEBUG === 'true') console.log(`[FRIEND] ${fromRole} (${fromUsername}) sent friend request to ${toRole}`);

        if (toRole === 'intermediate' && registry.intermediate) {
            io.to(registry.intermediate.socketId).emit('friend_request_received', { username: fromUsername });
        } else if (toRole === 'main' && registry.main) {
            io.to(registry.main.socketId).emit('friend_request_received', { username: fromUsername });
        }
    });

    // Forward trade offer intent to target
    socket.on('trade_offer_sent', (data) => {
        const { fromRole, fromUsername, toRole } = data;
        if (process.env.DEBUG === 'true') console.log(`[TRADE] ${fromRole} (${fromUsername}) sent trade offer to ${toRole}`);

        if (toRole === 'intermediate' && registry.intermediate) {
            io.to(registry.intermediate.socketId).emit('trade_offer_received', { username: fromUsername });
        } else if (toRole === 'main' && registry.main) {
            io.to(registry.main.socketId).emit('trade_offer_received', { username: fromUsername });
        }
    });

    socket.on('disconnect', () => {
        if (process.env.DEBUG === 'true') console.log(`[-] Disconnected: ${socket.id}`);
        if (registry.main && registry.main.socketId === socket.id) {
            registry.main = null;
        } else if (registry.intermediate && registry.intermediate.socketId === socket.id) {
            if (registry.intermediate.username) {
                accountManager.releaseAccount(registry.intermediate.username);
            }
            registry.intermediate = null;
        }
        // We do not delete bots on disconnect so their last status remains visible in the dashboard
        // But we MUST release their account lock!
        for (let bot of registry.bots.values()) {
            if (bot.socketId === socket.id && bot.username) {
                accountManager.releaseAccount(bot.username);
                // Also clear username so it doesn't get released twice
                bot.username = null; 
            }
        }
        renderDashboard();
    });

    // Account Persistence API
    socket.on('get_account_assignment', (data, callback) => {
        const { role } = data;
        const assignment = accountManager.getNextAssignment(role);
        callback(assignment);
    });

    socket.on('save_account', (data) => {
        accountManager.addAccount(data);
    });

    socket.on('release_account', (data) => {
        const { username } = data;
        accountManager.releaseAccount(username);
    });

    socket.on('mark_account_dead', (data) => {
        const { username } = data;
        if (process.env.DEBUG === 'true') console.log(`[WikiFarm] Marking account dead (unverified email): ${username}`);
        accountManager.markAccountDead(username);
    });
});

const PORT = process.env.PORT || 3000;

function startServer() {
    return new Promise((resolve) => {
        server.listen(PORT, () => {
            console.log(`🚀 Local Coordinate Server running on port ${PORT}`);
            resolve();
        });
    });
}

module.exports = { startServer, registry, io, renderDashboard };

// If executed directly
if (require.main === module) {
    startServer();
}

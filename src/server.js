require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*", // Allow all origins for the extension
        methods: ["GET", "POST"]
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
            registry.intermediate = null;
        }
        // We do not delete bots on disconnect so their last status remains visible in the dashboard
        renderDashboard();
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

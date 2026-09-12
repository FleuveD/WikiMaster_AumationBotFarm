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
    main: null,        // { socketId, username }
    intermediate: null, // { socketId, username }
    bots: new Map()    // socketId -> { username }
};

io.on('connection', (socket) => {
    console.log(`[+] New connection: ${socket.id}`);

    // Register a client (Main, Intermediate, Bot)
    socket.on('register', (data) => {
        const { role, username } = data;
        console.log(`[*] Registering ${socket.id} as ${role} with username ${username}`);
        
        if (role === 'main') {
            registry.main = { socketId: socket.id, username };
        } else if (role === 'intermediate') {
            registry.intermediate = { socketId: socket.id, username };
            // Broadcast to bots that intermediate is available and its username
            socket.broadcast.emit('intermediate_ready', { username });
        } else if (role === 'bot') {
            registry.bots.set(socket.id, { username });
        }
        
        // Acknowledge registration
        socket.emit('registered', { success: true });
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
        console.log(`[FRIEND] ${fromRole} (${fromUsername}) sent friend request to ${toRole}`);
        
        if (toRole === 'intermediate' && registry.intermediate) {
            io.to(registry.intermediate.socketId).emit('friend_request_received', { username: fromUsername });
        } else if (toRole === 'main' && registry.main) {
            io.to(registry.main.socketId).emit('friend_request_received', { username: fromUsername });
        }
    });

    // Forward trade offer intent to target
    socket.on('trade_offer_sent', (data) => {
        const { fromRole, fromUsername, toRole } = data;
        console.log(`[TRADE] ${fromRole} (${fromUsername}) sent trade offer to ${toRole}`);
        
        if (toRole === 'intermediate' && registry.intermediate) {
            io.to(registry.intermediate.socketId).emit('trade_offer_received', { username: fromUsername });
        } else if (toRole === 'main' && registry.main) {
            io.to(registry.main.socketId).emit('trade_offer_received', { username: fromUsername });
        }
    });

    socket.on('disconnect', () => {
        console.log(`[-] Disconnected: ${socket.id}`);
        if (registry.main && registry.main.socketId === socket.id) {
            registry.main = null;
        } else if (registry.intermediate && registry.intermediate.socketId === socket.id) {
            registry.intermediate = null;
        } else {
            registry.bots.delete(socket.id);
        }
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

module.exports = { startServer, registry, io };

// If executed directly
if (require.main === module) {
    startServer();
}

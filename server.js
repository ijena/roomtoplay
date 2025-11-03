// server.js
// Entry point for Room To Play with real-time multiplayer game support

const express = require("express");
const http = require("http");
const path = require("path");
const { Server } = require("socket.io");

// Import game modules
const impostorGame = require("./games/impostor");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Serve static files from the frontend directory
app.use(express.static(path.join(__dirname, "frontend")));

// Root route (can serve a hub page)
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "frontend", "index.html"));
});

// Game-specific Socket.IO namespaces
io.of("/impostor").on("connection", (socket) => {
  console.log("A player connected to /impostor");
  impostorGame(socket);
});

// Start the server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`✅ Server running at http://localhost:${PORT}`);
});

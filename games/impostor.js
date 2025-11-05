const { Server } = require("socket.io");

const io = new Server({ cors: { origin: "*" } });
const rooms = {};

module.exports = function registerImpostorGame(io) {
  const namespace = io.of("/impostor");

  namespace.on("connection", (socket) => {
    console.log(`🎮 Player connected: ${socket.id}`);

    socket.on("create-room", ({ playerName }) => {
      const roomCode = generateRoomCode();
      rooms[roomCode] = {
        hostId: socket.id,
        players: [{ id: socket.id, name: playerName }]
      };

      socket.join(roomCode);
      socket.data.roomCode = roomCode;
      socket.data.playerName = playerName;

      socket.emit("room-created", { roomCode });
      socket.emit("host-assigned", { message: `You are the host of room ${roomCode}` });

      console.log(`✅ Room ${roomCode} created by ${playerName}`);
    });

    socket.on("join", ({ playerName, roomCode }) => {
      const room = rooms[roomCode];
      if (!room) return socket.emit("error", "Room not found");

      room.players.push({ id: socket.id, name: playerName });
      socket.join(roomCode);
      socket.data.roomCode = roomCode;
      socket.data.playerName = playerName;

      socket.emit("joined-room", { roomCode });
    });

    socket.on("rejoin-room", ({ playerName, roomCode }) => {
      const room = rooms[roomCode];
      if (!room) return socket.emit("error", "Room not found");

      const player = room.players.find((p) => p.name === playerName);
      if (!player) return socket.emit("error", "Player name not found in room");

      player.id = socket.id;
      socket.join(roomCode);
      socket.data.roomCode = roomCode;
      socket.data.playerName = playerName;

      if (socket.id === room.hostId) {
        socket.emit("host-assigned", {
          message: `You are the host of room ${roomCode}`
        });
      }

      socket.emit("joined-room", { roomCode });
    });

    socket.on("start-round", () => {
      const roomCode = socket.data.roomCode;
      const room = rooms[roomCode];
      if (!room || socket.id !== room.hostId) return;

      const players = room.players;
      const numImpostors = Math.floor(Math.random() * players.length);

      const roles = [
        ...Array(players.length - numImpostors).fill("normal"),
        ...Array(numImpostors).fill("impostor")
      ];
      shuffleArray(roles);

      const { normalPrompt, impostorPrompts } = generatePromptForRound(numImpostors);

      players.forEach((player, index) => {
        const role = roles[index];
        const prompt = role === "normal"
          ? normalPrompt
          : impostorPrompts.pop() || normalPrompt;

        namespace.to(player.id).emit("prompt", { prompt });
      });
    });

    socket.on("disconnect", () => {
      const roomCode = socket.data.roomCode;
      const room = rooms[roomCode];
      if (!room) return;

      room.players = room.players.filter((p) => p.id !== socket.id);
      console.log(`❌ ${socket.data.playerName} left room ${roomCode}`);

     if (socket.id === room.hostId) {
  if (room.players.length > 0) {
    // reassign host
    room.hostId = room.players[0].id;
    namespace.to(room.hostId).emit("host-assigned", {
      message: `You are now the host of room ${roomCode}`
    });
  } else {
    console.log(`⏳ Room ${roomCode} is empty. Waiting 10 seconds before deletion...`);

    // Set a timeout to allow reconnection
    setTimeout(() => {
      const stillEmpty = !rooms[roomCode] || rooms[roomCode].players.length === 0;
      if (stillEmpty) {
        delete rooms[roomCode];
        console.log(`🧹 Room ${roomCode} deleted after timeout`);
      }
    }, 10000); // 10 seconds
  }
}

    });
  });
};

function generatePromptForRound(numImpostors) {
  const normalPrompt = "What's your go-to midnight snack?";
  const allImpostorPrompts = [
    "What's a midnight snack you regret?",
    "What's a weird late-night craving?",
    "What's a snack that gives you the ick?",
    "What's the most overrated midnight snack?"
  ];
  shuffleArray(allImpostorPrompts);
  return {
    normalPrompt,
    impostorPrompts: allImpostorPrompts.slice(0, numImpostors)
  };
}

function generateRoomCode() {
  return Math.random().toString(36).substring(2, 6).toUpperCase();
}

function shuffleArray(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
}

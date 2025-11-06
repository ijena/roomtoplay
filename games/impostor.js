// games/impostor.js
// Real-time logic for the "Find the Impostor" game with OpenAI-powered prompt generation

const { Server } = require("socket.io");

const io = new Server({
  cors: { origin: "*" }
});

//holds all active rooms
const rooms = {};


require("dotenv").config();
const OpenAI = require("openai");

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});



module.exports = function registerImpostorGame(io){
  const namespace = io.of("/impostor");

  namespace.on("connection", (socket) => {
    console.log(`🎮 Player connected: ${socket.id}`);
  //creating a new room
  socket.on("create-room", ({ playerName }) => {
  const roomCode = generateRoomCode();
 rooms[roomCode] = {
  hostId: socket.id,
  players: [{ id: socket.id, name: playerName }],
  settings: { impostorMode: "variable" },
  answers: {} // 🆕 stores answers submitted by players
};



  const room = rooms[roomCode];

  socket.join(roomCode);
  socket.data.roomCode = roomCode;
  socket.data.playerName = playerName;
  socket.emit("room-created", {
  roomCode,
  players: room.players,
  settings: room.settings
});


  // socket.emit("room-created", { roomCode, isHost: true });
  socket.emit("host-assigned", { message: `You are the host of room ${roomCode}` });

  io.of("/impostor").to(roomCode).emit("update-players", room.players);
  console.log(`✅ Room created: ${roomCode} | Host: ${playerName}`);
});



socket.on("join", ({ playerName, roomCode, }) => {
  const room = rooms[roomCode];
  if (!room) return socket.emit("error", "Room not found");

  room.players.push({ id: socket.id, name: playerName });
  socket.join(roomCode);
  socket.data.roomCode = roomCode;
  socket.data.playerName = playerName;
  socket.emit("joined-room", {
  roomCode,
  players: room.players,
  settings: room.settings
});
  // socket.emit("joined-room", { roomCode });
  io.of("/impostor").to(roomCode).emit("update-players", room.players);

});

  socket.on("update-settings", (newSettings) => {
  const roomCode = socket.data.roomCode;
  const room = rooms[roomCode];
  if (!room || socket.id !== room.hostId) return;

  room.settings = {
    ...room.settings,
    ...newSettings
  };

  io.of("/impostor").to(roomCode).emit("settings-updated", room.settings);
});


  socket.on("start-round", async () => {
  const roomCode = socket.data.roomCode;
  const room = rooms[roomCode];
  if (!room) return;
  if (socket.id !== room.hostId) return;
  const players = room.players;
  if (players.length < 2) {
    socket.emit("error", "At least 2 players required to start the round.");
    return;
  }
  room.answers = {}; // 🆕 clear previous round's answers


  const impostorMode = room.settings.impostorMode || "variable";
  const numImpostors = impostorMode === "one"
    ? 1
    : Math.floor(Math.random() * players.length);

  const { normalPrompt, impostorPrompts } = generatePromptForRound(numImpostors);

  if (impostorMode === "one") {
    const impostorIndex = Math.floor(Math.random() * players.length);
    const impostorId = players[impostorIndex].id;

    players.forEach((player) => {
      const role = player.id === impostorId ? "impostor" : "normal";
      const prompt = role === "impostor"
        ? impostorPrompts.pop() || normalPrompt
        : normalPrompt;
      io.of("/impostor").to(player.id).emit("prompt", { prompt });
    });

    return; // end early so it doesn’t fall through to variable logic
  }

  // For "variable" mode
  const roles = [
    ...Array(players.length - numImpostors).fill("normal"),
    ...Array(numImpostors).fill("impostor")
  ];
  shuffleArray(roles);

  players.forEach((player, index) => {
    const role = roles[index];
    const prompt = role === "impostor"
      ? impostorPrompts.pop() || normalPrompt
      : normalPrompt;
    io.of("/impostor").to(player.id).emit("prompt", { prompt });
  });
});

socket.on("submit-answer", ({ answer }) => {
  const roomCode = socket.data.roomCode;
  const room = rooms[roomCode];
  if (!room) return;

  room.answers[socket.id] = {
    name: socket.data.playerName,
    answer
  };

  if (Object.keys(room.answers).length === room.players.length) {
    const allAnswers = Object.values(room.answers);
    io.of("/impostor").to(roomCode).emit("reveal-answers", allAnswers);
  }
});



socket.on("disconnect", () => {
    const roomCode = socket.data.roomCode;
    const room = rooms[roomCode];
    if (!room) return;

    room.players = room.players.filter((p) => p.id !== socket.id);
    io.of("/impostor").to(roomCode).emit("update-players", room.players);

    console.log(`❌ ${socket.data.playerName} left room ${roomCode}`);

    if (socket.id === room.hostId) {
      console.log(`👑 Host ${socket.data.playerName} disconnected from ${roomCode}`);
      // Optional: auto-assign new host or close room
    }
    if (socket.id === room.hostId) {
  if (room.players.length > 0) {
    // Assign new host to the first remaining player
    room.hostId = room.players[0].id;
    const newHostName = room.players[0].name;

    // Notify the new host
    io.of("/impostor").to(room.hostId).emit("host-assigned", {
      message: `You are now the host of room ${roomCode}`
    });

    console.log(`👑 New host in ${roomCode}: ${newHostName}`);
  } else {
    // Room is empty — optional: delete it
    delete rooms[roomCode];
    console.log(`🧹 Room ${roomCode} deleted (empty)`);
  }
}

});

});

};




// 🔮 Uses OpenAI to generate one normal + N alternate prompts
async function generatePromptSet(numImpostors) {
  try {
    const systemPrompt = `You are a game prompt generator for a social deception game.
Generate one main question that everyone answers.
Then generate ${numImpostors} alternate versions of that same question that sound similar but may lead to different answers.`;

    const userPrompt = `Give the prompt set in this JSON format:
{
  "normal": "Main prompt here",
  "impostors": ["Alt 1", "Alt 2", ..., "Alt N"]
}`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4.1-nano",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      temperature: 0.8,
    });

    const content = completion.choices[0].message.content;
    const json = JSON.parse(content);

    if (json.normal && Array.isArray(json.impostors)) {
      return json;
    } else {
      console.error("⚠️ Invalid prompt structure from OpenAI:", content);
      return null;
    }
  } catch (err) {
    console.error("❌ Error generating prompt from OpenAI:", err.message);
    return null;
  }
}

function generatePromptForRound(numImpostors) {
  const normalPrompt = "What's your go-to midnight snack?";

  // Make sure we always have a safe default array
  const allImpostorPrompts = [
    "What's a midnight snack that gives you the ick?",
    "What snack do you avoid before bed?",
    "What's the worst late-night craving you've had?",
    "What's a snack you regret eating at night?",
    "What food keeps you up at night?"
  ];

  // Shuffle and take as many impostor prompts as needed
  const shuffled = [...allImpostorPrompts];
  shuffleArray(shuffled);
  const selected = shuffled.slice(0, numImpostors);

  return {
    normalPrompt,
    impostorPrompts: selected
  };
}


function generateRoomCode() {
  return Math.random().toString(36).substr(2, 6).toUpperCase();
}

function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
  }
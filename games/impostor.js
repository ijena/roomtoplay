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


io.of("/impostor").on("connection", (socket) => {

  //creating a new room
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


  socket.on("start-round", async () => {
    const roomCode = socket.data.roomCode;
    const room = rooms[roomCode];
    if (!room) return;
    if (socket.id !== room.hostId) return;
      const players = room.players;
      const numImpostors = Math.floor(Math.random() * players.length);

        const roles = [
        Array(players.length - numImpostors).fill("normal"),
      Array(numImpostors).fill("impostor")
      ];
    shuffleArray(roles);

    // Request OpenAI to generate prompt set eventually
    //for now, use static placeholder
      const { normalPrompt, impostorPrompts } = generatePromptForRound(numImpostors);

  players.forEach((player, index) => {
    const role = roles[index];
    const prompt = role === "normal"
      ? normalPrompt
      : impostorPrompts.pop() || normalPrompt;

    io.of("/impostor").to(player.id).emit("prompt", {
      prompt // role hidden
    });
  });

socket.on("disconnect", () => {
    const roomCode = socket.data.roomCode;
    const room = rooms[roomCode];
    if (!room) return;

    room.players = room.players.filter((p) => p.id !== socket.id);
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
});



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

async function generatePromptForRound(numImpostors) {
  // 🔧 Static placeholder prompt
  const normal = "What’s your favorite fruit?";
  
  // Generate unique impostor versions
  const impostors = [
    "What’s a fruit you dislike?",
    "What’s the most overrated fruit?",
    "What fruit would you never eat again?",
    "Name a fruit that doesn't belong in salad.",
    "What’s the weirdest fruit you’ve tried?"
  ].slice(0, numImpostors); // pick as many as needed

  return { normal, impostors};
}

function generateRoomCode() {
  return Math.random().toString(36).substr(2, 6).toUpperCase();
}


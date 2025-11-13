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
  answers: {}, // 🆕 stores answers submitted by players
  votes: {}         // ✅ NEW: Track player votes

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
  if (!playerName.trim()) return socket.emit("error", "Name cannot be empty");

  const duplicate = room.players.some(
    (p) => p.name.toLowerCase() === playerName.trim().toLowerCase()
  );
  if (duplicate) {
    return socket.emit("error", "That name is already taken in this room.");
  }
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
  if (socket.id !== room.hostId) return; // only host can start
  if (room.players.length < 3) {
    socket.emit("error", "Need at least 3 players to start.");
    return;
  }
  resetRoundState(room);

  const players = room.players;
  const impostorMode = room.settings?.impostorMode || "variable";

  // Decide impostor count
  const numImpostors = impostorMode === "one"
    ? 1
    : Math.max(1, Math.floor(players.length / 3));

  // Assign roles
  const roles = Array(players.length)
    .fill("normal")
    .fill("impostor", 0, numImpostors);
  shuffleArray(roles);

  // 🔹 Build impostor name list and store for scoring later
  const impostors = [];
  players.forEach((player, index) => {
    if (roles[index] === "impostor") impostors.push(player.name);
  });
  room.lastImpostors = impostors;
  console.log(`🕵️ Impostors for room ${roomCode}:`, impostors);

  // Generate prompt
  const categories = ["opinion", "sensory", "cultural", "player-based"];
  const category = categories[Math.floor(Math.random() * categories.length)];

  // 🧠 Generate prompt from OpenAI
  const promptSet = await generatePromptSet(category, numImpostors);
  normalPrompt = promptSet.normal;
  impostorPrompts = promptSet.impostors;
  // const { normalPrompt, impostorPrompts } = generatePromptForRound(numImpostors);
  room.currentPrompt = normalPrompt

  // Send prompts individually
  players.forEach((player, index) => {
    const role = roles[index];
    const prompt =
      role === "normal"
        ? normalPrompt
        : impostorPrompts.pop() || normalPrompt;
    io.of("/impostor").to(player.id).emit("prompt", { prompt });
  });

  // Reset votes each round
  room.votes = {};
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
    io.of("/impostor").to(roomCode).emit("update-players", room.players);
namespace.to(roomCode).emit("reveal-answers", {
    answers: room.answers,
    question: room.currentPrompt, // <— the shared prompt
  });  }
});
// Inside the namespace connection handler:
socket.on("submit-vote", ({ votes }) => {
  const roomCode = socket.data.roomCode;
  const room = rooms[roomCode];
  if (!room) return;

  // 🗳️ Record votes — even if empty, store "__NONE__"
  const selectedVotes = Array.isArray(votes) && votes.length > 0 ? votes : ["__NONE__"];
room.votes[socket.data.playerName] = votes;

  console.log(`🗳️ ${socket.data.playerName} voted for:`, selectedVotes);

  // ✅ Wait for all players to vote
  if (Object.keys(room.votes).length === room.players.length) {
    const allVotes = Object.values(room.votes).flat();
    const tally = {};

    // Count all votes (including "__NONE__")
    allVotes.forEach(name => {
      tally[name] = (tally[name] || 0) + 1;
    });

    // Sort players by votes (highest → lowest)
    const sorted = Object.entries(tally).sort((a, b) => b[1] - a[1]);

    // Identify top-voted players
    const highestVotes = sorted[0] ? sorted[0][1] : 0;
    let topVoted = sorted
      .filter(([name, count]) => count === highestVotes)
      .map(([name]) => name);

    // Retrieve impostor mode for logic
    const impostorMode = room.settings?.impostorMode || "variable";
    let impostors = [];

    topVoted = topVoted.filter(name => name !== "__NONE__");


    console.log(`📊 Final vote results for ${roomCode}:`, {
      impostorMode,
      tally: sorted,
      topVoted,
       });

    // ✅ Send results to all players
    namespace.to(roomCode).emit("vote-results", {
  question: room.currentPrompt,      // 🧩 the actual question
  votesByPlayer: room.votes,         // ✅ matches frontend variable name
  topVoted,                          // 🏆 highest voted names
  impostors: room.lastImpostors || []// 🕵️ true impostors
});

if (!room.scores) room.scores = {};
//const impostorMode = room.settings?.impostorMode || "variable";

// ✅ get impostor names from last round (stored on room object)
const impostorNames = room.lastImpostors || [];

// Map player roles
const playerRoles = {};
room.players.forEach(p => {
  playerRoles[p.name] = impostorNames.includes(p.name) ? "impostor" : "normal";
});

// Build vote counts
const votesReceived = {};
Object.values(room.votes || {}).flat().forEach(v => {
  votesReceived[v] = (votesReceived[v] || 0) + 1;
});
const roundChanges = {};

// Compute scores per player
room.players.forEach(player => {
  const pid = player.id;
  const pname = player.name;
  const role = playerRoles[pname];
  const votes = room.votes?.[pid] || [];
  let roundScore = 0;

  // ----- SINGLE IMPOSTOR MODE -----
  if (impostorMode === "one") {
    if (role === "impostor") {
      // Impostor: +2 if not caught
      const caught = impostors.includes(pname);
      roundScore += caught ? 0 : 2;
    } else {
      // Non-Impostor: +1 if voted impostor, −1 if got voted
      const votedForImpostor = votes.some(v => impostorNames.includes(v));
      if (votedForImpostor) roundScore += 1;
      if (impostors.includes(pname)){ roundScore -= 1;}
    }
  }

  // ----- VARIABLE IMPOSTOR MODE -----
  else {
    const caught = impostors.includes(pname);

    if (role === "impostor") {
      if (!caught) roundScore += 2;
    } else {
      if (caught) roundScore -= 1;
    }

    // Everyone: +1 per impostor voted
    const correctVotes = votes.filter(v => impostorNames.includes(v)).length;
    roundScore += correctVotes;
    //Everyone: −1 per normal voted
    const incorrectVotes = votes.filter(v => playerRoles[v] === "normal").length;
    roundScore -= incorrectVotes;
    // 🧠 Clean Ballot logic — impostors can qualify too
const votedNormals = votes.some(v => playerRoles[v] === "normal");

// Exclude self if this player is an impostor
const missedImpostors = impostorNames.some(
  i => i !== pname && !votes.includes(i)
);

if (!votedNormals && !missedImpostors && votes.length > 0) {
  roundScore += 1;
}

  }
  roundChanges[pid] = roundScore;
  // Update cumulative totals
  room.scores[pid] = (room.scores[pid] || 0) + roundScore;
});

// ✅ Emit updated scoreboard
console.log(`🏆 Scores for ${roomCode}:`, room.scores);
namespace.to(roomCode).emit("score-update", {
  totals: room.scores,
  deltas: roundChanges
});
    
    // Optional: reset for next round
    // room.votes = {};
  }

});








socket.on("disconnect", () => {
    const roomCode = socket.data.roomCode;
    const room = rooms[roomCode];
    if (!room) return;

    room.players = room.players.filter((p) => p.id !== socket.id);
    delete room.answers[socket.id]; // 🆕 Clear their answer if they leave
    delete room.votes[socket.id];  // ✅ Clear their vote if they leave

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
    // Room is emp
    delete rooms[roomCode];
    delete room.votes[socket.id];  // ✅ Clear their vote if they leave

    console.log(`🧹 Room ${roomCode} deleted (empty)`);
  }
}

});

});

};




// 🎯 Generate a new question pair set based on category and impostor count
async function generatePromptSet(category = "opinion", numImpostors = 1) {
  const systemPrompt = `You are a prompt writer for a social deception game called "Find the Impostor".
Each round, players get slightly different prompts to make the impostor blend in.
Generate one main question (for all normal players) and ${numImpostors} alternate impostor prompts
that are close in theme but different in meaning. Make sure that for different players the answer can be the same to all those prompts`;

  const userPrompt = `Category: ${category}

Examples of categories:
- opinion: preferences, choices, likes/dislikes
- sensory: visual or emotional descriptions
- cultural: pop culture, movies, holidays
- player-based: about people in the group

Output in JSON ONLY:
{
  "normal": "main prompt",
  "impostors": ["alt1", "alt2", ...]
}`;

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4.1-nano", // light + cheap
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      temperature: 0.9 // more creative variations
    });

    const raw = completion.choices[0].message.content;
    const json = JSON.parse(raw);

    if (json.normal && Array.isArray(json.impostors)) {
      return json;
    } else {
      console.error("⚠️ Invalid prompt structure:", raw);
      return null;
    }
  } catch (err) {
    console.error("❌ Error generating prompt:", err.message);
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

  // 🧹 Reset all per-round data in a room
function resetRoundState(room) {
  // Clear previous round data
  room.answers = {};         // players’ answers for the prompt
  room.votes = {};           // votes for impostor
  room.lastImpostors = [];   // reset impostor list (will be re-set in start-round)
  room.currentPrompt = null; // optional: track the prompt used this round
  room.roundActive = false;  // flag to mark if a round is currently ongoing

  console.log(`🧹 Cleared round state for room ${room.code || "?"}`);
}

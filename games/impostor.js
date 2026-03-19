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
    : Math.floor(Math.random() * (players.length + 1))
;

  // Assign roles properly — one role per player
const roles = Array(players.length).fill("normal");
for (let i = 0; i < numImpostors; i++) {
  roles[i] = "impostor";
}
shuffleArray(roles); // ensures random impostor placement


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
room.votes[socket.data.playerName] =votes;

  console.log(`🗳️ ${socket.data.playerName} voted for:`, selectedVotes);

  // ✅ Wait for all players to vote
  if (Object.keys(room.votes).length === room.players.length) {
    // 🧮 Count all votes
const allVotes = Object.values(room.votes).flat();
const tally = {};

// Count each vote (including "__NONE__")
allVotes.forEach(v => {
  const name = v === "__NONE__" ? "None" : v;
  tally[name] = (tally[name] || 0) + 1;
});

// If everyone voted none or no votes at all
if (Object.keys(tally).length === 0) {
  tally["None"] = room.players.length;
}

// Find top voted
const maxVotes = Math.max(...Object.values(tally));
let topVoted = Object.entries(tally)
  .filter(([_, c]) => c === maxVotes)
  .map(([name]) => name);

// Make sure “None” still appears if that’s all there is
if (topVoted.length === 0) {
  topVoted = ["None"];
}

// Always emit vote results
namespace.to(roomCode).emit("vote-results", {
  question: room.currentPrompt,
  votesByPlayer: room.votes,
  topVoted,
  impostors: room.lastImpostors || [],
  tally
});


if (!room.scores) room.scores = {};
const impostorMode = room.settings?.impostorMode || "variable";

const actualImpostors = room.lastImpostors || [];
const topVotedPlayers = topVoted || [];

// Map player roles
const playerRoles = {};
room.players.forEach(p => {
  playerRoles[p.name] = actualImpostors.includes(p.name) ? "impostor" : "normal";
});

const scoreDeltas = {};

// Compute scores per player
room.players.forEach(player => {
  const playerId = player.id;
  const playerName = player.name;
  const role = playerRoles[playerName];
  const playerVotes = room.votes?.[playerName] || [];
  let roundScore = 0;

  // ----- SINGLE IMPOSTOR MODE -----
  if (impostorMode === "one") {
    if (role === "impostor") {
      // Impostor: +2 if not top-voted (not caught)
      const wasTopVoted = topVotedPlayers.includes(playerName);
      roundScore += wasTopVoted ? 0 : 2;
    } else {
      // Non-Impostor: +1 if voted for top-voted player, −1 if they were top-voted
      const votedForTopPlayer = playerVotes.some(v => topVotedPlayers.includes(v));
      if (votedForTopPlayer) roundScore += 1;
      if (topVotedPlayers.includes(playerName)) roundScore -= 1;
    }
  }

  // ----- VARIABLE IMPOSTOR MODE -----
  else {
    const wasTopVoted = topVotedPlayers.includes(playerName);

    if (role === "impostor") {
      if (!wasTopVoted) roundScore += 2;
    } else {
      if (wasTopVoted) roundScore -= 1;
    }

    // Everyone: +1 per actual impostor voted, −1 per normal voted
    const impostorVoteCount = playerVotes.filter(v => actualImpostors.includes(v)).length;
    roundScore += impostorVoteCount;
    const normalVoteCount = playerVotes.filter(v => playerRoles[v] === "normal").length;
    roundScore -= normalVoteCount;

    // 🧠 Clean Ballot: +1 if voted for all impostors and no normals
    const votedForNormal = playerVotes.some(v => playerRoles[v] === "normal");
    const missedImpostor =
      actualImpostors.length > 0 &&
      actualImpostors.some(i => i !== playerName && !playerVotes.includes(i));

    if (!votedForNormal && !missedImpostor) {
      roundScore += 1;
    }
  }

  scoreDeltas[playerId] = roundScore;
  room.scores[playerId] = (room.scores[playerId] || 0) + roundScore;
});

// ✅ Emit updated scoreboard
console.log(`🏆 Scores for ${roomCode}:`, room.scores);
namespace.to(roomCode).emit("score-update", {
  totals: room.scores,
  deltas: scoreDeltas
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
    delete room.votes[socket.playerName];  // ✅ Clear their vote if they leave

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

if (room.players.length === 0) {
  delete rooms[roomCode];
  console.log(`🧹 Room ${roomCode} deleted (no players remaining)`);
}

});

});

};




// 🎯 Generate a new question pair set based on category and impostor count
async function generatePromptSet(category = "opinion", numImpostors = 1) {
  const systemPrompt = `
You are a game prompt generator for a social deception game called "Find the Impostor".
Each round, all players answer a question. The impostor(s) receive slightly different versions
on the same topic.

Rules for writing good prompts:
- It should be possible for players to give overlapping or believable answers.
- Prefer subtle context shifts (e.g., "What’s a meal you cook often?" vs "What’s a meal you wish you could cook?")
- Avoid yes/no questions or ones with factual answers.
- Keep all questions open-ended, conversational, and about experiences, opinions, or preferences.
- Do not ask why in the question.

Now, generate one normal question and ${numImpostors} impostor versions that meet these rules.
Each impostor version should feel close enough to the normal prompt to create confusion.
Output JSON in this format:
{
  "normal": "Main question",
  "impostors": ["Impostor1", "Impostor2", ...]
}`;

  const userPrompt = `Category: ${category}`;

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4.1-nano",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      temperature: 0.9,
    });

    const content = completion.choices[0].message.content;
    const json = JSON.parse(content);
    return json;
  } catch (err) {
    console.error("❌ Error generating prompt:", err.message);
    return null;
  }
}


// function generatePromptForRound(numImpostors) {
//   const normalPrompt = "What's your go-to midnight snack?";

//   // Make sure we always have a safe default array
//   const allImpostorPrompts = [
//     "What's a midnight snack that gives you the ick?",
//     "What snack do you avoid before bed?",
//     "What's the worst late-night craving you've had?",
//     "What's a snack you regret eating at night?",
//     "What food keeps you up at night?"
//   ];

//   // Shuffle and take as many impostor prompts as needed
//   const shuffled = [...allImpostorPrompts];
//   shuffleArray(shuffled);
//   const selected = shuffled.slice(0, numImpostors);

//   return {
//     normalPrompt,
//     impostorPrompts: selected
//   };
// }


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

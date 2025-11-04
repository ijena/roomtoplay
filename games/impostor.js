// games/impostor.js
// Real-time logic for the "Find the Impostor" game with OpenAI-powered prompt generation

require("dotenv").config();
const OpenAI = require("openai");

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});


module.exports = (socket) => {
  console.log(`👤 New player connected: ${socket.id}`);

  socket.on("join", ({ roomCode, playerName }) => {
    socket.join(roomCode);
    socket.data.playerName = playerName;
    socket.data.roomCode = roomCode;

    console.log(`📥 ${playerName} joined room ${roomCode}`);
    socket.to(roomCode).emit("player-joined", playerName);
  });

  socket.on("start-round", async () => {
    console.log("🚀 Start round triggered by", socket.id);
    const roomCode = socket.data.roomCode;
    const clients = Array.from(socket.nsp.adapter.rooms.get(roomCode) || []);
    if (clients.length < 2) return;

    const shuffled = clients.sort(() => Math.random() - 0.5);
    const numImpostors = Math.floor(Math.random() * (clients.length + 1));
    const impostorIds = new Set(shuffled.slice(0, numImpostors));
 
    // Request OpenAI to generate prompt set
    const promptSet = await generatePromptSet(numImpostors);
    console.log("📝 Generated prompt set:", promptSet);
    if (!promptSet) return;

    let impostorIndex = 0;

    for (const clientId of clients) {
      const isImpostor = impostorIds.has(clientId);
      const clientSocket = socket.nsp.sockets.get(clientId);

      if (clientSocket) {
        const prompt = isImpostor
          ? promptSet.impostors[impostorIndex++] || promptSet.normal // fallback
          : promptSet.normal;

        clientSocket.emit("prompt", {
          prompt,
          role: isImpostor ? "impostor" : "normal",
        });
      }
    }
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

    const content = completion.data.choices[0].message.content;
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

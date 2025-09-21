import express from "express";
import cors from "cors";
import multer from "multer";
import path from "path";
import fetch from "node-fetch";
import dotenv from "dotenv";
import { promises as fs } from "fs";
import voice from "elevenlabs-node";
import { exec } from "child_process";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { HumeClient } from "hume"
import {writeResultToFile} from "./helper/utils.js"

dotenv.config();

const hume = new HumeClient({ 
  apiKey: process.env.HUME_API_KEY
})


const elevenLabsApiKey = process.env.ELEVEN_LABS_API_KEY;
const geminiApiKey = process.env.GEMINI_API_KEY;
const agentId = process.env.NEXT_PUBLIC_AGENT_ID;
const voiceID = "Xb7hH8MSUJpSbSDYk0k2";
const genAI = geminiApiKey ? new GoogleGenerativeAI(geminiApiKey) : null;

const app = express();
app.use(express.json());
app.use(cors());
const port = 3000;

const upload = multer({ dest: "uploads/" });

// ---------- Utilities ----------
function execCommand(command) {
  return new Promise((resolve, reject) => {
    exec(command, (error, stdout, stderr) => {
      if (error) reject(error);
      resolve(stdout);
    });
  });
}
const pwd = process.cwd();
async function lipSyncMessage(i) {
  const originalFile = `${pwd}/audios/message_${i}.wav`
  const finalFile = `${pwd}/audios/message_${i}final.wav`
  // await execCommand(`ffmpeg -y -i audios/message_${i}.mp3 audios/message_${i}.wav`);
  await execCommand(
    `ffmpeg -y -i ${originalFile} -acodec pcm_s16le -ar 16000 ${finalFile}`
  );
  await execCommand(
    `./bin/rhubarb -f json -o ${pwd}/audios/message_${i}.json ${finalFile} -r phonetic`
  );
}

async function readJsonTranscript(file) {
  const data = await fs.readFile(file, "utf8");
  return JSON.parse(data);
}

async function audioFileToBase64(file) {
  const filepath = `${pwd}/${file}final.wav` 
  const data = await fs.readFile(filepath);
  return data.toString("base64");
}

// ---------- Endpoints ----------
app.get("/", (req, res) => {
  res.send("Hello World! Backend is running.");
});

app.get("/voices", async (req, res) => {
  try {
    const voices = await voice.getVoices(elevenLabsApiKey);
    res.send(voices);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/chat", async (req, res) => {
  const userMessage = req.body.message;
  if (!userMessage) return res.status(400).json({ error: "No message provided" });
  if (!elevenLabsApiKey || !geminiApiKey)
    return res.status(500).json({ error: "API keys missing" });

  let messages;
  try {
    const model = genAI.getGenerativeModel({
        model: "gemini-2.5-flash"
    });

    const result = await model.generateContent({
        contents: [{
            role: "user",
            parts: [{
                text: `You are a virtual agent. Reply with a JSON array of up to 3 messages. Each message has: text, facialExpression (smile, sad, angry, surprised, funnyFace, default), and animation (Talking_0, Talking_1, Talking_2, Crying, Laughing, Rumba, Idle, Terrified, Angry). User: ${userMessage}`
            }]
        }],
        // Add this configuration to enable JSON mode
        generationConfig: {
            responseMimeType: "application/json",
        },
    });

    // The response text is now guaranteed to be a valid JSON string
    messages = JSON.parse(result.response.text());

    if (messages.messages) {
      messages = messages.messages; // This check is still useful in case the model wraps the array
    }

} catch (e) {
    console.log(e);
    return res.status(500).json({ error: "Gemini API error", details: e.message });
}

console.log("till here", messages)
// return 
try {
  for (let i = 0; i < messages.length; i++) {
    const fileName = `audios/message_${i}`;
    const speech1 = await hume.tts.synthesizeJson({
      utterances: [{
        description: "A refined, British aristocrat",
        text: messages[i].text,
        voice: {
          id: '5bb7de05-c8fe-426a-8fcc-ba4fc4ce9f9c'
        }
      }]
    })
    await writeResultToFile(speech1.generations[0].audio, fileName)


    await hume.tts.voices.create({
      name: `aristocrat-${Date.now()}`,
      generationId: speech1.generations[0].generationId,
    })

    // await voice.textToSpeech(elevenLabsApiKey, voiceID, fileName, messages[i].text);
    await lipSyncMessage(i);
    messages[i].audio = await audioFileToBase64(fileName);
    messages[i].lipsync = await readJsonTranscript(`audios/message_${i}.json`);
  }
} catch (error) {
  console.log("Error: here",error)
}

  res.send({ messages });
});

app.post("/transcribe-and-chat", upload.single("audio"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No audio file uploaded" });

  try {
    const audioData = await fs.readFile(path.resolve(req.file.path));
    const sttResponse = await fetch("https://api.elevenlabs.io/v1/speech-to-text", {
      method: "POST",
      headers: {
        "xi-api-key": elevenLabsApiKey,
        "Content-Type": "audio/mpeg",
      },
      body: audioData,
    });
    if (!sttResponse.ok) return res.status(500).json({ error: "Failed to transcribe audio" });
    const { text: userMessage } = await sttResponse.json();

    let messages;
    try {
      const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
      const result = await model.generateContent([
        {
          role: "user",
          parts: [
            {
              text: `You are a virtual agent. Reply with a JSON array of up to 3 messages. Each message has: text, facialExpression (smile, sad, angry, surprised, funnyFace, default), and animation (Talking_0, Talking_1, Talking_2, Crying, Laughing, Rumba, Idle, Terrified, Angry). User: ${userMessage}`,
            },
          ],
        },
      ]);
      messages = JSON.parse(result.response.text());
      if (messages.messages) messages = messages.messages;
    } catch (e) {
      return res.status(500).json({ error: "Gemini API error", details: e.message });
    }

    for (let i = 0; i < messages.length; i++) {
      const fileName = `audios/message_${i}.mp3`;
      await voice.textToSpeech(elevenLabsApiKey, voiceID, fileName, messages[i].text);
      await lipSyncMessage(i);
      messages[i].audio = await audioFileToBase64(fileName);
      messages[i].lipsync = await readJsonTranscript(`audios/message_${i}.json`);
    }

    res.send({ messages });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(port, () => {
  console.log(`Backend listening on port ${port}`);
  console.log("ELEVEN_LABS_API_KEY:", !!elevenLabsApiKey);
  console.log("GEMINI_API_KEY:", !!geminiApiKey);
  console.log("NEXT_PUBLIC_AGENT_ID:", agentId);
});

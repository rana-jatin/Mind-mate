import { HumeClient } from "hume"
import dotenv from "dotenv"

dotenv.config()

const hume = new HumeClient({ 
  apiKey: process.env.HUME_API_KEY
})




const speech1 = await hume.tts.synthesizeJson({
  utterances: [{
    description: "A refined, British aristocrat",
    text: "Hi hrishabh how are you"
  }]
})
await writeResultToFile(speech1.generations[0].audio, "speech1_0")


await hume.tts.voices.create({
  name: `aristocrat-${Date.now()}`,
  generationId: speech1.generations[0].generationId,
})


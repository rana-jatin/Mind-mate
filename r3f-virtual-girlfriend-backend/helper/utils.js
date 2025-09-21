import fs from "fs/promises"
import path from "path"
import * as os from "os"
import * as child_process from "child_process"

const pwd = process.cwd()

const outputDir = path.join(pwd);

export const writeResultToFile = async (base64EncodedAudio, filename) => {
  const filePath = path.join(outputDir, `${filename}.wav`)

  console.log("Wriring into ",filePath)
  await fs.writeFile(filePath, Buffer.from(base64EncodedAudio, "base64"))
  console.log('Wrote', filePath)
}

const startAudioPlayer = () => {
  const proc = child_process.spawn('ffplay', ['-nodisp', '-autoexit', '-infbuf', '-i', '-'], {
    detached: true,
    stdio: ['pipe', 'ignore', 'ignore'],
  })

  proc.on('error', (err) => {
    if ((err).code === 'ENOENT') {
      console.error('ffplay not found. Please install ffmpeg to play audio.')
    }
  })

  return {
    sendAudio: (audio) => {
      const buffer = Buffer.from(audio, "base64")
      proc.stdin.write(buffer)
    },
    stop: () => {
      proc.stdin.end()
      proc.unref()
    }
  }
}

// const main = async () => {
//   await fs.mkdir(outputDir)
//   console.log('Writing to', outputDir)
// }

// main().then(() => console.log('Done')).catch(console.error)
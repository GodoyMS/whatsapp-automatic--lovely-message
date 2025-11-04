const fs = require("fs-extra");
const path = require("path");
const fetch = require("node-fetch");
const logger = require("./logger");

class VoiceGenerator {
  constructor(elevenLabsApiKey) {
    this.apiKey = elevenLabsApiKey;
    this.voiceId = "rLoiziv7f2z2Em1A74tZ"; 
    this.audioDir = path.join(__dirname, "../audio");
    this.lastVoiceMessage = null;
    this.initializeStorage();
  }

  async initializeStorage() {
    try {
      await fs.ensureDir(this.audioDir);
      logger.info('Voice generator audio directory initialized');
    } catch (error) {
      logger.error('Failed to initialize audio directory:', error);
    }
  }

  async generateVoice(text, options = {}) {
    try {
      if (!this.apiKey) {
        throw new Error('ElevenLabs API key not configured');
      }

      logger.info(`Generating voice for text: "${text.substring(0, 50)}..."`);

      const response = await fetch(
        `https://api.elevenlabs.io/v1/text-to-speech/${this.voiceId}`,
        {
          method: "POST",
          headers: {
            "xi-api-key": this.apiKey,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            text,
            model_id: options.model || "eleven_multilingual_v2",
            voice_settings: {
              stability: options.stability || 0.3,        // Lower stability for more expression
              similarity_boost: options.similarity_boost || 0.8,
              style: options.style || 0.6,               // Higher style for more emotion
              use_speaker_boost: options.use_speaker_boost || true
            },
            // Add pronunciation dictionary for better Spanish expressions
            pronunciation_dictionary_locators: options.pronunciation_dictionary_locators || []
          }),
        }
      );

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`ElevenLabs API error: ${response.status} ${response.statusText}\n${errText}`);
      }

      // Use response.buffer() for binary safety
      const audioBuffer = await response.buffer();

      // Generate unique filename with timestamp
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `voice_${timestamp}.mp3`;
      const filePath = path.join(this.audioDir, filename);

      // Save audio file
      await fs.writeFile(filePath, audioBuffer);
      
      logger.info(`Voice audio generated successfully: ${filename}`);
      
      this.lastVoiceMessage = {
        text,
        filePath,
        filename,
        timestamp: new Date(),
        size: audioBuffer.length
      };

      return {
        success: true,
        filePath,
        filename,
        text,
        size: audioBuffer.length
      };

    } catch (error) {
      logger.error('Error generating voice:', error);
      throw error;
    }
  }

  async generateVoiceForMessage(message, options = {}) {
    try {
      // Clean the message for voice generation (remove emojis and special characters)
      const cleanMessage = this.cleanMessageForVoice(message);
      
      if (!cleanMessage || cleanMessage.length < 10) {
        throw new Error('Message too short or empty for voice generation');
      }

      return await this.generateVoice(cleanMessage, options);
    } catch (error) {
      logger.error('Error generating voice for message:', error);
      throw error;
    }
  }

  cleanMessageForVoice(message) {
    // First, convert written expressions to more natural speech equivalents
    let cleanMessage = message
      // Convert internet expressions to natural speech
      .replace(/jajaja+/gi, 'ja ja ja')           // Make laughter more natural
      .replace(/jeje+/gi, 'je je')               // Convert jeje to natural speech
      .replace(/jiji+/gi, 'ji ji')               // Convert jiji to natural speech
      .replace(/ajajaj+/gi, 'a ja ja ja')        // Convert ajajaj to natural speech
      .replace(/:\)/g, '')                       // Remove smile emoticons
      .replace(/:\(/g, '')                       // Remove sad emoticons
      .replace(/:o/gi, 'oh')                     // Convert :o to "oh"
      .replace(/:c/gi, '')                       // Remove :c (doesn't translate well to voice)
      .replace(/:\//gi, '')                      // Remove :/ (doesn't translate well to voice)
      .replace(/jajaj/gi, 'ja ja')               // Shorter laugh
      .replace(/ajaj/gi, 'a ja')                 // Shorter laugh
      // Add pauses for better speech flow
      .replace(/\./g, '. ')                      // Add space after periods
      .replace(/,/g, ', ')                       // Add space after commas
      .replace(/\?/g, '? ')                      // Add space after question marks
      .replace(/!/g, '! ')                       // Add space after exclamation marks
      // Remove emojis and special characters
      .replace(/[\u{1F600}-\u{1F64F}]/gu, '')    // emoticons
      .replace(/[\u{1F300}-\u{1F5FF}]/gu, '')    // misc symbols
      .replace(/[\u{1F680}-\u{1F6FF}]/gu, '')    // transport
      .replace(/[\u{1F1E0}-\u{1F1FF}]/gu, '')    // flags
      .replace(/[\u{2600}-\u{26FF}]/gu, '')      // misc symbols
      .replace(/[\u{2700}-\u{27BF}]/gu, '')      // dingbats
      .replace(/[^\w\s\.,\?!¿¡áéíóúñü]/gi, '')   // keep only letters, numbers, spaces, and basic punctuation
      // Clean up multiple spaces and trim
      .replace(/\s+/g, ' ')
      .trim();

    // Truncate message if it's too long (aim for ~10 seconds of speech)
    // Assuming average speech rate of 150-200 words per minute in Spanish
    // For 10 seconds: ~25-30 words maximum
    const words = cleanMessage.split(' ');
    if (words.length > 25) {
      cleanMessage = words.slice(0, 25).join(' ');
      // Ensure it ends properly
      if (!cleanMessage.match(/[.!?]$/)) {
        cleanMessage += '.';
      }
      logger.info(`Truncated voice message to 25 words for 10-second limit`);
    }

    return cleanMessage;
  }

  async cleanupOldFiles(maxFiles = 10) {
    try {
      const files = await fs.readdir(this.audioDir);
      const mp3Files = files
        .filter(file => file.endsWith('.mp3'))
        .map(file => ({
          name: file,
          path: path.join(this.audioDir, file),
          stats: fs.statSync(path.join(this.audioDir, file))
        }))
        .sort((a, b) => b.stats.mtime - a.stats.mtime); // Sort by modification time, newest first

      if (mp3Files.length > maxFiles) {
        const filesToDelete = mp3Files.slice(maxFiles);
        for (const file of filesToDelete) {
          await fs.unlink(file.path);
          logger.info(`Cleaned up old voice file: ${file.name}`);
        }
      }
    } catch (error) {
      logger.warn('Error cleaning up old voice files:', error);
    }
  }

  getLastVoiceMessage() {
    return this.lastVoiceMessage;
  }

  getStats() {
    return {
      lastVoiceMessage: this.lastVoiceMessage,
      audioDirectory: this.audioDir,
      apiKeyConfigured: !!this.apiKey
    };
  }
}

module.exports = VoiceGenerator;

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const logger = require('./src/logger');
const WhatsAppService = require('./src/whatsappService');
const AlternativeWhatsAppService = require('./src/alternativeWhatsAppService');
const MessageGenerator = require('./src/messageGenerator');
const ConversationHistory = require('./src/conversationHistory');
const CronScheduler = require('./src/cronScheduler');
const VoiceGenerator = require('./src/voiceGenerator');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Global variables
let whatsappService = null;
let isUsingAlternative = false;
let messageGenerator = null;
let conversationHistory = null;
let cronScheduler = null;
let voiceGenerator = null;
let isAutomationInitialized = false;

// Configuration
const targetPhoneNumber = process.env.TARGET_PHONE_NUMBER;
const messageInterval = parseInt(process.env.MESSAGE_INTERVAL_SECONDS) || 10;
const voiceInterval = parseInt(process.env.VOICE_INTERVAL_SECONDS) || 240; // Voice messages every 240 seconds (4 minutes for testing)
const stats = {
    messagesSent: 0,
    voiceMessagesSent: 0,
    errors: 0,
    startTime: new Date()
};
let lastMessageSent = null;
let lastVoiceMessageSent = null;

// Automatic voice message sending function
async function sendAutomaticVoiceMessage() {
    try {
        if (!whatsappService || !whatsappService.isReady) {
            logger.warn('WhatsApp service is not ready for voice message');
            return null;
        }

        if (!voiceGenerator) {
            logger.warn('Voice generator not available');
            return null;
        }

        if (!targetPhoneNumber) {
            throw new Error('Target phone number not configured');
        }

        if (isUsingAlternative) {
            logger.warn('Voice messages not supported with alternative service');
            return null;
        }

        logger.info('Sending automatic voice message...');

        // Update conversation history from WhatsApp
        try {
            const whatsappMessages = await whatsappService.getMessages(targetPhoneNumber, 10);
            await conversationHistory.syncFromWhatsApp(targetPhoneNumber, whatsappMessages);
        } catch (error) {
            logger.warn('Failed to sync history from WhatsApp:', error.message);
        }

        // Get enhanced conversation context
        const conversationContext = await conversationHistory.getConversationContext(targetPhoneNumber, 20);

        // Generate message for voice with enhanced context
        const messageOptions = {
            style: process.env.MESSAGE_STYLE || 'romantic',
            language: process.env.MESSAGE_LANGUAGE || 'spanish',
            temperature: parseFloat(process.env.TEMPERATURE) || 0.9, // Higher for voice
            conversationContext: conversationContext
        };

        const result = await messageGenerator.generateVoiceMessage(conversationContext.messages, messageOptions);

        if (!result.message) {
            throw new Error('Failed to generate message for voice');
        }

        // Validate message
        const validation = messageGenerator.validateMessage(result.message);
        if (!validation.valid) {
            throw new Error(`Invalid message for voice: ${validation.reason}`);
        }

        // Generate voice audio
        const voiceResult = await voiceGenerator.generateVoiceForMessage(result.message);

        if (!voiceResult.success) {
            throw new Error('Failed to generate voice audio');
        }

        // Send voice message (voice only, no text)
        await whatsappService.sendVoiceMessage(
            targetPhoneNumber, 
            voiceResult.filePath
        );

        // Track voice message in conversation history
        await conversationHistory.markMessageSent(targetPhoneNumber, result.message, true);

        // Update stats
        stats.voiceMessagesSent++;
        lastVoiceMessageSent = {
            message: result.message,
            timestamp: new Date(),
            phoneNumber: targetPhoneNumber,
            type: 'automatic_voice',
            voiceFile: voiceResult.filename,
            openaiUsage: result.usage,
            serviceType: 'primary'
        };

        // Cleanup old voice files
        await voiceGenerator.cleanupOldFiles(10);

        logger.info(`Automatic voice message sent successfully: "${result.message}"`);
        return lastVoiceMessageSent;

    } catch (error) {
        logger.error('Error sending automatic voice message:', error);
        stats.errors++;
        throw error;
    }
}

// Automatic message sending function
async function sendAutomaticMessage() {
    try {
        if (!whatsappService || !whatsappService.isReady) {
            logger.warn('WhatsApp service is not ready for automatic message');
            return null;
        }

        if (!targetPhoneNumber) {
            throw new Error('Target phone number not configured');
        }

        logger.info('Sending automatic message...');

        // Update conversation history from WhatsApp (only for primary service)
        if (!isUsingAlternative) {
            try {
                const whatsappMessages = await whatsappService.getMessages(targetPhoneNumber, 10);
                console.log("Whatsapp messages", whatsappMessages);
                await conversationHistory.syncFromWhatsApp(targetPhoneNumber, whatsappMessages);
            } catch (error) {
                logger.warn('Failed to sync history from WhatsApp:', error.message);
            }
        }

        // Get enhanced conversation context
        const conversationContext = await conversationHistory.getConversationContext(targetPhoneNumber, 20);

        // Generate message with enhanced context
        const messageOptions = {
            style: process.env.MESSAGE_STYLE || 'friendly',
            language: process.env.MESSAGE_LANGUAGE || 'spanish',
            maxTokens: parseInt(process.env.MAX_TOKENS) || 150,
            temperature: parseFloat(process.env.TEMPERATURE) || 0.8,
            conversationContext: conversationContext
        };

        const result = await messageGenerator.generateMessage(conversationContext.messages, messageOptions);

        if (!result.message) {
            throw new Error('Failed to generate message');
        }

        // Validate message
        const validation = messageGenerator.validateMessage(result.message);
        if (!validation.valid) {
            throw new Error(`Invalid message: ${validation.reason}`);
        }

        // Send message
        await whatsappService.sendMessage(targetPhoneNumber, result.message);

        // Track message in conversation history
        await conversationHistory.markMessageSent(targetPhoneNumber, result.message, false);

        // Update stats
        stats.messagesSent++;
        lastMessageSent = {
            message: result.message,
            timestamp: new Date(),
            phoneNumber: targetPhoneNumber,
            type: 'automatic',
            openaiUsage: result.usage,
            serviceType: isUsingAlternative ? 'alternative' : 'primary'
        };

        logger.info(`Automatic message sent successfully: "${result.message}"`);
        return lastMessageSent;

    } catch (error) {
        logger.error('Error sending automatic message:', error);
        stats.errors++;
        throw error;
    }
}

// Initialize automation services
async function initializeAutomation() {
    try {
        if (!process.env.OPENAI_API_KEY) {
            logger.warn('OPENAI_API_KEY not configured - automatic messaging disabled');
            return false;
        }

        if (!targetPhoneNumber) {
            logger.warn('TARGET_PHONE_NUMBER not configured - automatic messaging disabled');
            return false;
        }

        logger.info('Initializing automation services...');

        // Initialize services
        messageGenerator = new MessageGenerator(
            process.env.OPENAI_API_KEY,
            process.env.OPENAI_MODEL || 'gpt-4o-mini'
        );

        conversationHistory = new ConversationHistory('./data');
        cronScheduler = new CronScheduler();

        // Initialize voice generator if API key is available
        if (process.env.ELEVENLABS_API_KEY) {
            voiceGenerator = new VoiceGenerator(process.env.ELEVENLABS_API_KEY);
            logger.info('Voice generator initialized successfully');
        } else {
            logger.warn('ELEVENLABS_API_KEY not configured - voice messages disabled');
        }

        // Setup scheduled automatic messages
        cronScheduler.scheduleAutoMessages(
            messageInterval,
            async () => {
                if (whatsappService && whatsappService.isReady) {
                    try {
                        await sendAutomaticMessage();
                    } catch (error) {
                        logger.error('Scheduled message failed:', error);
                    }
                } else {
                    logger.debug('Skipping auto message - WhatsApp not ready');
                }
            }
        );

        // Setup voice message scheduling (every 240 seconds or configured interval)
        if (voiceGenerator && !isUsingAlternative) {
            cronScheduler.scheduleCustomTask(
                'voiceMessages',
                cronScheduler.secondsToCronExpression(voiceInterval),
                async () => {
                    if (whatsappService && whatsappService.isReady) {
                        try {
                            await sendAutomaticVoiceMessage();
                        } catch (error) {
                            logger.error('Scheduled voice message failed:', error);
                        }
                    } else {
                        logger.debug('Skipping voice message - WhatsApp not ready');
                    }
                }
            );
            logger.info(`Voice messages scheduled every ${voiceInterval} seconds`);
        }

        // Setup daily history sync (only for primary service)
        if (!isUsingAlternative) {
            cronScheduler.scheduleHistorySync(async () => {
                if (whatsappService && whatsappService.isReady) {
                    try {
                        const messages = await whatsappService.getMessages(targetPhoneNumber, 20);
                        await conversationHistory.updateHistoryFromWhatsApp(targetPhoneNumber, messages);
                        logger.info('Daily history sync completed');
                    } catch (error) {
                        logger.error('Daily history sync failed:', error);
                    }
                } else {
                    logger.debug('Skipping history sync - WhatsApp not ready');
                }
            });
        }

        // Start scheduled jobs
        cronScheduler.startAll();

        isAutomationInitialized = true;
        logger.info(`Automation initialized successfully!`);
        logger.info(`📱 Text messages: every ${messageInterval} seconds`);
        if (voiceGenerator && !isUsingAlternative) {
            logger.info(`🎤 Voice messages: every ${voiceInterval} seconds`);
        }
        logger.info(`📞 Target: ${targetPhoneNumber}`);
        
        return true;
    } catch (error) {
        logger.error('Failed to initialize automation:', error);
        return false;
    }
}

// Initialize WhatsApp with fallback
async function initializeWhatsApp() {
    try {
        logger.info('Initializing primary WhatsApp service...');
        whatsappService = new WhatsAppService();
        
        // Set up incoming message handler BEFORE initializing
        whatsappService.on('incomingMessage', async (messageData) => {
            try {
                logger.info(`📨 Processing incoming message from ${messageData.phoneNumber}: ${messageData.body}`);
                
                // Normalize phone numbers for comparison (remove all non-digits)
                const cleanTargetNumber = targetPhoneNumber ? targetPhoneNumber.replace(/\D/g, '') : null;
                const cleanIncomingNumber = messageData.phoneNumber.replace(/\D/g, '');
                
                // Only store messages from our target contact
                if (cleanTargetNumber && cleanIncomingNumber === cleanTargetNumber) {
                    await conversationHistory.addMessage(cleanTargetNumber, messageData, true);
                    logger.info(`✅ Stored incoming message from ${messageData.phoneNumber}`);
                    
                    // Log the new message context
                    logger.info(`💬 New message in conversation history from Dulce Elena: "${messageData.body}"`);
                    
                    // Get updated conversation context to see the change
                    const context = await conversationHistory.getConversationContext(cleanTargetNumber, 5);
                    logger.info(`� Conversation now has ${context.messages.length} messages, last from: ${context.conversationFlow?.lastInteraction ? new Date(context.conversationFlow.lastInteraction).toLocaleTimeString() : 'unknown'}`);
                } else {
                    logger.debug(`Ignoring message from non-target contact: ${messageData.phoneNumber} (target: ${cleanTargetNumber})`);
                }
            } catch (error) {
                logger.error('Error handling incoming message:', error);
            }
        });
        
        await whatsappService.initialize();
        logger.info('Primary WhatsApp service initialized with message listener');
    } catch (error) {
        logger.error('Primary service failed, switching to alternative:', error.message);
        try {
            whatsappService = new AlternativeWhatsAppService();
            await whatsappService.initialize();
            isUsingAlternative = true;
            logger.info('Alternative WhatsApp service initialized (no incoming message support)');
        } catch (altError) {
            logger.error('Alternative service also failed:', altError.message);
            whatsappService = {
                isReady: false,
                getStatus: () => ({ isReady: false, error: 'All services failed' }),
                getQRCode: () => ({ data: 'Service unavailable', image: null })
            };
        }
    }

    // Check for WhatsApp readiness periodically
    const checkWhatsAppReady = async () => {
        if (whatsappService && whatsappService.isReady && !isAutomationInitialized) {
            logger.info('WhatsApp ready, initializing automation...');
            await initializeAutomation();
        } else if (!isAutomationInitialized) {
            // Check again in 2 seconds
            setTimeout(checkWhatsAppReady, 2000);
        }
    };

    // Start checking for readiness
    setTimeout(checkWhatsAppReady, 1000);
}

// Routes
app.get('/', (req, res) => {
    const automationStatus = isAutomationInitialized ? 
        `✅ Active (${messageInterval}s interval)` : 
        '❌ Not initialized';
    
    const voiceStatus = voiceGenerator && !isUsingAlternative ? 
        `✅ Active (${voiceInterval}s interval)` : 
        '❌ Not available';
    
    res.send(`
        <html>
        <head><title>WhatsApp Automation</title></head>
        <body style="font-family: Arial; text-align: center; padding: 50px;">
            <h1>📱 WhatsApp Automation System</h1>
            <p><strong>Service Type:</strong> ${isUsingAlternative ? 'Alternative' : 'Primary'}</p>
            <p><strong>Target:</strong> ${targetPhoneNumber || 'Not configured'}</p>
            <p><strong>Text Automation:</strong> ${automationStatus}</p>
            <p><strong>Voice Automation:</strong> ${voiceStatus}</p>
            <p><strong>Messages Sent:</strong> ${stats.messagesSent}</p>
            <p><strong>Voice Messages:</strong> ${stats.voiceMessagesSent}</p>
            <p><strong>Last Message:</strong> ${lastMessageSent ? lastMessageSent.timestamp.toLocaleString() : 'None'}</p>
            <p><strong>Last Voice:</strong> ${lastVoiceMessageSent ? lastVoiceMessageSent.timestamp.toLocaleString() : 'None'}</p>
            <div style="margin: 20px;">
                <a href="/status" style="margin: 10px; padding: 10px; background: #007cba; color: white; text-decoration: none;">Status</a>
                <a href="/qr" style="margin: 10px; padding: 10px; background: #25d366; color: white; text-decoration: none;">QR Code</a>
                <a href="/history" style="margin: 10px; padding: 10px; background: #8e44ad; color: white; text-decoration: none;">History</a>
            </div>
            <div style="margin: 20px;">
                <button onclick="sendTestMessage()" style="margin: 5px; padding: 10px; background: #e74c3c; color: white; border: none; cursor: pointer;">Send Test Message</button>
                <button onclick="sendTestVoice()" style="margin: 5px; padding: 10px; background: #9b59b6; color: white; border: none; cursor: pointer;">Send Test Voice</button>
                <button onclick="toggleScheduler()" style="margin: 5px; padding: 10px; background: #f39c12; color: white; border: none; cursor: pointer;">Toggle Scheduler</button>
            </div>
            <script>
                async function sendTestMessage() {
                    try {
                        const response = await fetch('/send-auto-message', { method: 'POST' });
                        const result = await response.json();
                        alert(result.success ? 'Message sent!' : 'Error: ' + result.error);
                        location.reload();
                    } catch (error) {
                        alert('Error: ' + error.message);
                    }
                }

                async function sendTestVoice() {
                    try {
                        const response = await fetch('/send-auto-voice', { method: 'POST' });
                        const result = await response.json();
                        alert(result.success ? 'Voice message sent!' : 'Error: ' + result.error);
                        location.reload();
                    } catch (error) {
                        alert('Error: ' + error.message);
                    }
                }
                
                async function toggleScheduler() {
                    try {
                        const action = prompt('Enter "start" or "stop":');
                        if (action === 'start' || action === 'stop') {
                            const response = await fetch('/schedule/' + action, { method: 'POST' });
                            const result = await response.json();
                            alert(result.message);
                        }
                    } catch (error) {
                        alert('Error: ' + error.message);
                    }
                }
            </script>
        </body>
        </html>
    `);
});

app.get('/status', async (req, res) => {
    try {
        const status = whatsappService ? whatsappService.getStatus() : { error: 'Not initialized' };
        const clientInfo = whatsappService && !isUsingAlternative ? await whatsappService.getClientInfo() : null;
        const conversationStats = conversationHistory ? await conversationHistory.getConversationStats(targetPhoneNumber) : null;
        const cronStats = cronScheduler ? cronScheduler.getStats() : null;
        const voiceStats = voiceGenerator ? voiceGenerator.getStats() : null;

        res.json({
            service: isUsingAlternative ? 'alternative' : 'primary',
            whatsapp: status,
            client: clientInfo,
            conversation: conversationStats,
            scheduler: cronStats,
            voice: voiceStats,
            automation: {
                initialized: isAutomationInitialized,
                target: targetPhoneNumber,
                textInterval: `${messageInterval} seconds`,
                voiceInterval: `${voiceInterval} seconds`,
                lastMessage: lastMessageSent,
                lastVoiceMessage: lastVoiceMessageSent
            },
            stats,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Send manual message
app.post('/send-message', async (req, res) => {
    try {
        const { message, phoneNumber } = req.body;
        
        if (!message) {
            return res.status(400).json({ error: 'Message is required' });
        }

        if (!whatsappService || !whatsappService.isReady) {
            return res.status(503).json({ error: 'WhatsApp service not ready' });
        }

        const targetPhone = phoneNumber || targetPhoneNumber;
        if (!targetPhone) {
            return res.status(400).json({ error: 'Phone number is required' });
        }

        const result = await whatsappService.sendMessage(targetPhone, message);
        
        // Save to history if conversation history is available
        if (conversationHistory) {
            await conversationHistory.addMessage(targetPhone, message, 'me');
        }

        stats.messagesSent++;
        lastMessageSent = {
            message,
            timestamp: new Date(),
            phoneNumber: targetPhone,
            type: 'manual',
            serviceType: isUsingAlternative ? 'alternative' : 'primary'
        };

        res.json({
            success: true,
            result,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        logger.error('Error sending manual message:', error);
        stats.errors++;
        res.status(500).json({ error: error.message });
    }
});

// Send automatic message (manual trigger)
app.post('/send-auto-message', async (req, res) => {
    try {
        if (!isAutomationInitialized) {
            return res.status(503).json({ error: 'Automation not initialized' });
        }

        const result = await sendAutomaticMessage();
        res.json({
            success: true,
            result,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        logger.error('Error sending automatic message:', error);
        stats.errors++;
        res.status(500).json({ error: error.message });
    }
});

// Send automatic voice message (manual trigger)
app.post('/send-auto-voice', async (req, res) => {
    try {
        if (!isAutomationInitialized) {
            return res.status(503).json({ error: 'Automation not initialized' });
        }

        if (!voiceGenerator) {
            return res.status(503).json({ error: 'Voice generator not available' });
        }

        if (isUsingAlternative) {
            return res.status(503).json({ error: 'Voice messages not supported with alternative service' });
        }

        const result = await sendAutomaticVoiceMessage();
        res.json({
            success: true,
            result,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        logger.error('Error sending automatic voice message:', error);
        stats.errors++;
        res.status(500).json({ error: error.message });
    }
});

// Send manual voice message
app.post('/send-voice-message', async (req, res) => {
    try {
        const { message, phoneNumber } = req.body;
        
        if (!message) {
            return res.status(400).json({ error: 'Message is required' });
        }

        if (!voiceGenerator) {
            return res.status(503).json({ error: 'Voice generator not available' });
        }

        if (!whatsappService || !whatsappService.isReady) {
            return res.status(503).json({ error: 'WhatsApp service not ready' });
        }

        if (isUsingAlternative) {
            return res.status(503).json({ error: 'Voice messages not supported with alternative service' });
        }

        const targetPhone = phoneNumber || targetPhoneNumber;
        if (!targetPhone) {
            return res.status(400).json({ error: 'Phone number is required' });
        }

        // Generate voice audio
        const voiceResult = await voiceGenerator.generateVoiceForMessage(message);

        if (!voiceResult.success) {
            throw new Error('Failed to generate voice audio');
        }

        // Send ONLY voice message (no text)
        const result = await whatsappService.sendVoiceMessage(targetPhone, voiceResult.filePath);
        
        // Save to history if conversation history is available
        if (conversationHistory) {
            await conversationHistory.addMessage(targetPhone, `[Voice: ${message}]`, 'me');
        }

        stats.voiceMessagesSent++;
        lastVoiceMessageSent = {
            message,
            timestamp: new Date(),
            phoneNumber: targetPhone,
            type: 'manual_voice',
            voiceFile: voiceResult.filename,
            serviceType: 'primary'
        };

        res.json({
            success: true,
            result,
            voiceFile: voiceResult.filename,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        logger.error('Error sending manual voice message:', error);
        stats.errors++;
        res.status(500).json({ error: error.message });
    }
});

// Get conversation history
app.get('/history/:phoneNumber?', async (req, res) => {
    try {
        if (!conversationHistory) {
            return res.status(503).json({ error: 'Conversation history not available' });
        }

        const phoneNumber = req.params.phoneNumber || targetPhoneNumber;
        const limit = parseInt(req.query.limit) || 20;

        const history = await conversationHistory.getHistory(phoneNumber, limit);
        const conversationStats = await conversationHistory.getConversationStats(phoneNumber);

        res.json({
            phoneNumber,
            history,
            stats: conversationStats
        });
    } catch (error) {
        logger.error('Error getting conversation history:', error);
        res.status(500).json({ error: error.message });
    }
});

// Update schedule
app.post('/schedule/update', async (req, res) => {
    try {
        const { intervalSeconds } = req.body;

        if (!intervalSeconds || intervalSeconds < 1) {
            return res.status(400).json({ error: 'Invalid interval seconds (must be >= 1)' });
        }

        if (!cronScheduler) {
            return res.status(503).json({ error: 'Scheduler not available' });
        }

        // Remove existing job
        cronScheduler.removeJob('autoMessages');

        // Create new job
        cronScheduler.scheduleAutoMessages(
            intervalSeconds,
            async () => {
                if (whatsappService && whatsappService.isReady) {
                    try {
                        await sendAutomaticMessage();
                    } catch (error) {
                        logger.error('Scheduled message failed:', error);
                    }
                } else {
                    logger.debug('Skipping auto message - WhatsApp not ready');
                }
            }
        );

        // Start the new job
        cronScheduler.startJob('autoMessages');

        logger.info(`Schedule updated to send messages every ${intervalSeconds} seconds`);

        res.json({
            success: true,
            newInterval: `${intervalSeconds} seconds`,
            message: 'Schedule updated successfully'
        });
    } catch (error) {
        logger.error('Error updating schedule:', error);
        res.status(500).json({ error: error.message });
    }
});

// Start scheduler
app.post('/schedule/start', async (req, res) => {
    try {
        if (!cronScheduler) {
            return res.status(503).json({ error: 'Scheduler not available' });
        }

        cronScheduler.startJob('autoMessages');
        res.json({ success: true, message: 'Scheduler started' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Stop scheduler
app.post('/schedule/stop', async (req, res) => {
    try {
        if (!cronScheduler) {
            return res.status(503).json({ error: 'Scheduler not available' });
        }

        cronScheduler.stopJob('autoMessages');
        res.json({ success: true, message: 'Scheduler stopped' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/qr', (req, res) => {
    try {
        if (!whatsappService) {
            return res.send(`
                <html>
                <head><title>Service Not Available</title></head>
                <body style="font-family: Arial; text-align: center; padding: 50px;">
                    <h1>Service Not Available</h1>
                    <p><a href="/status">Check Status</a></p>
                </body>
                </html>
            `);
        }

        const qrData = whatsappService.getQRCode();
        
        if (isUsingAlternative) {
            return res.send(`
                <html>
                <head><title>Alternative Service</title></head>
                <body style="font-family: Arial; text-align: center; padding: 50px;">
                    <h1>��� Alternative WhatsApp Service</h1>
                    <p>Status: ${qrData.data}</p>
                    <p>Primary Puppeteer service not available in this environment.</p>
                    <p><a href="/status">Check Status</a></p>
                </body>
                </html>
            `);
        }

        if (!qrData.data || !qrData.image) {
            return res.send(`
                <html>
                <head><title>QR Code Not Available</title></head>
                <body style="font-family: Arial; text-align: center; padding: 50px;">
                    <h1>QR Code Not Available</h1>
                    <p>WhatsApp may already be authenticated or initializing.</p>
                    <p><a href="/status">Check Status</a></p>
                </body>
                </html>
            `);
        }

        res.send(`
            <html>
            <head><title>WhatsApp QR Code</title><meta http-equiv="refresh" content="10"></head>
            <body style="font-family: Arial; text-align: center; padding: 50px;">
                <h1>��� WhatsApp QR Code</h1>
                <img src="${qrData.image}" style="max-width: 300px; border: 2px solid #ccc;">
                <p>Scan with WhatsApp on your phone</p>
                <p><a href="/status">Check Status</a></p>
            </body>
            </html>
        `);
    } catch (error) {
        res.status(500).send(`
            <html>
            <head><title>Error</title></head>
            <body style="font-family: Arial; text-align: center; padding: 50px;">
                <h1>Error</h1>
                <p>${error.message}</p>
            </body>
            </html>
        `);
    }
});

// Start server
async function start() {
    try {
        logger.info('Starting WhatsApp Automation System...');
        
        // Initialize WhatsApp service with fallback
        await initializeWhatsApp();
        
        // Start Express server
        app.listen(PORT, '0.0.0.0', () => {
            console.log(`��� Server running on port ${PORT}`);
            console.log(`��� QR Code: http://localhost:${PORT}/qr`);
            console.log(`��� Status: http://localhost:${PORT}/status`);
            logger.info(`Server started on port ${PORT}`);
        });
        
    } catch (error) {
        console.error('Failed to start:', error);
        process.exit(1);
    }
}

start();

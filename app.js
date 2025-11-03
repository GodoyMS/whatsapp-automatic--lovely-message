require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const path = require('path');

// Import our services
const WhatsAppService = require('./src/whatsappService');
const MessageGenerator = require('./src/messageGenerator');
const ConversationHistory = require('./src/conversationHistory');
const CronScheduler = require('./src/cronScheduler');
const logger = require('./src/logger');

// Immediate startup log
console.log('🚀 Starting WhatsApp Automatic Message System...');
console.log(`📅 Current time: ${new Date().toISOString()}`);
console.log(`🔧 Node.js version: ${process.version}`);
console.log(`📍 Working directory: ${process.cwd()}`);
console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
console.log('📝 Loading configuration...');

class WhatsAppAutomationApp {
    constructor() {
        console.log('🏗️ Initializing WhatsApp Automation App...');
        
        this.app = express();
        this.port = process.env.PORT || 3000;
        this.targetPhoneNumber = process.env.TARGET_PHONE_NUMBER;
        this.messageInterval = parseInt(process.env.MESSAGE_INTERVAL_SECONDS) || 10;
        
        console.log(`📱 Target phone: ${this.targetPhoneNumber}`);
        console.log(`⏱️ Message interval: ${this.messageInterval} seconds`);
        console.log(`🌐 Server port: ${this.port}`);
        
        // Services
        console.log('🔧 Creating services...');
        this.whatsappService = new WhatsAppService();
        this.messageGenerator = new MessageGenerator(
            process.env.OPENAI_API_KEY,
            process.env.OPENAI_MODEL || 'gpt-4'
        );
        this.conversationHistory = new ConversationHistory('./data');
        this.cronScheduler = new CronScheduler();
        
        // Application state
        this.isInitialized = false;
        this.lastMessageSent = null;
        this.stats = {
            messagesSent: 0,
            errors: 0,
            startTime: new Date()
        };

        console.log('⚙️ Setting up Express app...');

        this.setupExpress();
        this.setupRoutes();
        this.setupErrorHandling();
    }

    setupExpress() {
        // Security middleware
        this.app.use(helmet());
        this.app.use(cors({
            origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
            credentials: true
        }));

        // Basic middleware
        this.app.use(express.json({ limit: '10mb' }));
        this.app.use(express.urlencoded({ extended: true }));
        
        // Static files
        this.app.use('/static', express.static(path.join(__dirname, 'public')));
        
        // Request logging
        this.app.use((req, res, next) => {
            logger.info(`${req.method} ${req.path} - ${req.ip}`);
            next();
        });
    }

    setupRoutes() {
        // Health check
        this.app.get('/health', (req, res) => {
            res.json({
                status: 'ok',
                timestamp: new Date().toISOString(),
                uptime: process.uptime(),
                whatsapp: this.whatsappService.getStatus(),
                stats: this.stats,
                lastMessage: this.lastMessageSent
            });
        });

        // Status endpoint
        this.app.get('/status', async (req, res) => {
            try {
                const whatsappStatus = this.whatsappService.getStatus();
                const clientInfo = await this.whatsappService.getClientInfo();
                const conversationStats = await this.conversationHistory.getConversationStats(this.targetPhoneNumber);
                const cronStats = this.cronScheduler.getStats();

                res.json({
                    initialized: this.isInitialized,
                    whatsapp: whatsappStatus,
                    client: clientInfo,
                    conversation: conversationStats,
                    scheduler: cronStats,
                    target: this.targetPhoneNumber,
                    interval: `${this.messageInterval} seconds`,
                    stats: this.stats
                });
            } catch (error) {
                logger.error('Error getting status:', error);
                res.status(500).json({ error: 'Failed to get status' });
            }
        });

        // QR Code endpoint for WhatsApp authentication
        this.app.get('/qr', (req, res) => {
            try {
                const qrData = this.whatsappService.getQRCode();
                
                if (!qrData.generated || !qrData.image) {
                    return res.status(404).send(`
                        <!DOCTYPE html>
                        <html>
                        <head>
                            <title>WhatsApp QR Code</title>
                            <meta http-equiv="refresh" content="5">
                            <style>
                                body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
                                .loading { color: #666; }
                            </style>
                        </head>
                        <body>
                            <h1>WhatsApp Authentication</h1>
                            <p class="loading">Waiting for QR code... This page will refresh automatically.</p>
                            <p>Status: ${this.whatsappService.getStatus().isReady ? 'Connected' : 'Connecting...'}</p>
                        </body>
                        </html>
                    `);
                }

                res.send(`
                    <!DOCTYPE html>
                    <html>
                    <head>
                        <title>WhatsApp QR Code</title>
                        <meta http-equiv="refresh" content="30">
                        <style>
                            body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
                            .qr-container { margin: 20px auto; }
                            .qr-code { max-width: 300px; height: auto; border: 2px solid #ccc; }
                            .instructions { color: #666; margin-top: 20px; }
                        </style>
                    </head>
                    <body>
                        <h1>Scan QR Code with WhatsApp</h1>
                        <div class="qr-container">
                            <img src="${qrData.image}" alt="WhatsApp QR Code" class="qr-code" />
                        </div>
                        <div class="instructions">
                            <p>1. Open WhatsApp on your phone</p>
                            <p>2. Go to Settings → Linked Devices</p>
                            <p>3. Tap "Link a Device" and scan this QR code</p>
                        </div>
                        <p><small>This page refreshes every 30 seconds</small></p>
                    </body>
                    </html>
                `);
            } catch (error) {
                logger.error('Error serving QR code:', error);
                res.status(500).json({ error: 'Failed to get QR code' });
            }
        });

        // Manual message sending
        this.app.post('/send-message', async (req, res) => {
            try {
                const { message, phoneNumber } = req.body;
                const targetNumber = phoneNumber || this.targetPhoneNumber;

                if (!message || !targetNumber) {
                    return res.status(400).json({ error: 'Message and phone number are required' });
                }

                const result = await this.whatsappService.sendMessage(targetNumber, message);
                await this.conversationHistory.addMessage(targetNumber, message, 'me');
                
                this.stats.messagesSent++;
                this.lastMessageSent = {
                    message,
                    timestamp: new Date(),
                    phoneNumber: targetNumber,
                    type: 'manual'
                };

                res.json({ 
                    success: true, 
                    result,
                    timestamp: new Date().toISOString()
                });
            } catch (error) {
                logger.error('Error sending manual message:', error);
                this.stats.errors++;
                res.status(500).json({ error: 'Failed to send message' });
            }
        });

        // Generate and send automatic message
        this.app.post('/send-auto-message', async (req, res) => {
            try {
                const result = await this.sendAutomaticMessage();
                res.json({ 
                    success: true, 
                    result,
                    timestamp: new Date().toISOString()
                });
            } catch (error) {
                logger.error('Error sending automatic message:', error);
                this.stats.errors++;
                res.status(500).json({ error: 'Failed to send automatic message' });
            }
        });

        // Get conversation history
        this.app.get('/history/:phoneNumber?', async (req, res) => {
            try {
                const phoneNumber = req.params.phoneNumber || this.targetPhoneNumber;
                const limit = parseInt(req.query.limit) || 20;
                
                const history = await this.conversationHistory.getHistory(phoneNumber, limit);
                const stats = await this.conversationHistory.getConversationStats(phoneNumber);
                
                res.json({
                    phoneNumber,
                    history,
                    stats
                });
            } catch (error) {
                logger.error('Error getting conversation history:', error);
                res.status(500).json({ error: 'Failed to get conversation history' });
            }
        });

        // Update scheduler settings
        this.app.post('/schedule/update', async (req, res) => {
            try {
                const { intervalSeconds } = req.body;
                
                if (!intervalSeconds || intervalSeconds < 1) {
                    return res.status(400).json({ error: 'Invalid interval seconds (must be >= 1)' });
                }

                await this.updateSchedule(intervalSeconds);
                this.messageInterval = intervalSeconds;
                
                res.json({ 
                    success: true, 
                    newInterval: `${intervalSeconds} seconds`,
                    message: 'Schedule updated successfully'
                });
            } catch (error) {
                logger.error('Error updating schedule:', error);
                res.status(500).json({ error: 'Failed to update schedule' });
            }
        });

        // Start/Stop scheduler
        this.app.post('/schedule/:action', (req, res) => {
            try {
                const { action } = req.params;
                
                if (action === 'start') {
                    this.cronScheduler.startAll();
                    res.json({ success: true, message: 'Scheduler started' });
                } else if (action === 'stop') {
                    this.cronScheduler.stopAll();
                    res.json({ success: true, message: 'Scheduler stopped' });
                } else {
                    res.status(400).json({ error: 'Invalid action. Use start or stop' });
                }
            } catch (error) {
                logger.error(`Error ${req.params.action} scheduler:`, error);
                res.status(500).json({ error: `Failed to ${req.params.action} scheduler` });
            }
        });

        // Export conversation history
        this.app.get('/export/:phoneNumber?', async (req, res) => {
            try {
                const phoneNumber = req.params.phoneNumber || this.targetPhoneNumber;
                const format = req.query.format || 'json';
                
                const filepath = await this.conversationHistory.exportHistory(phoneNumber, format);
                
                if (filepath) {
                    res.download(filepath);
                } else {
                    res.status(500).json({ error: 'Failed to export history' });
                }
            } catch (error) {
                logger.error('Error exporting history:', error);
                res.status(500).json({ error: 'Failed to export history' });
            }
        });

        // Root endpoint
        this.app.get('/', (req, res) => {
            const whatsappStatus = this.whatsappService.getStatus();
            res.send(`
                <!DOCTYPE html>
                <html>
                <head>
                    <title>WhatsApp Automatic Message System</title>
                    <style>
                        body { font-family: Arial, sans-serif; margin: 40px; }
                        .status { padding: 10px; margin: 10px 0; border-radius: 5px; }
                        .ready { background-color: #d4edda; color: #155724; }
                        .not-ready { background-color: #f8d7da; color: #721c24; }
                        .endpoints { margin-top: 20px; }
                        .endpoints ul { list-style-type: none; padding: 0; }
                        .endpoints li { padding: 5px 0; }
                        a { color: #007bff; text-decoration: none; }
                        a:hover { text-decoration: underline; }
                        .qr-link { font-size: 18px; font-weight: bold; margin: 20px 0; }
                    </style>
                </head>
                <body>
                    <h1>WhatsApp Automatic Message System</h1>
                    <div class="status ${whatsappStatus.isReady ? 'ready' : 'not-ready'}">
                        Status: ${this.isInitialized ? 'Running' : 'Initializing'} | 
                        WhatsApp: ${whatsappStatus.isReady ? 'Connected' : 'Not Connected'}
                    </div>
                    
                    ${!whatsappStatus.isReady ? `
                        <div class="qr-link">
                            <a href="/qr">📱 Scan QR Code to Connect WhatsApp</a>
                        </div>
                    ` : `
                        <div class="status ready">
                            ✅ WhatsApp is connected and ready!
                        </div>
                    `}
                    
                    <div class="endpoints">
                        <h3>Available Endpoints:</h3>
                        <ul>
                            <li><a href="/qr">GET /qr</a> - WhatsApp QR Code for authentication</li>
                            <li><a href="/status">GET /status</a> - System status</li>
                            <li><a href="/health">GET /health</a> - Health check</li>
                            <li>POST /send-message - Send manual message</li>
                            <li>POST /send-auto-message - Send AI-generated message</li>
                            <li><a href="/history">GET /history/:phoneNumber?</a> - View conversation history</li>
                            <li>POST /schedule/update - Update message interval (seconds)</li>
                            <li>POST /schedule/start - Start automatic messaging</li>
                            <li>POST /schedule/stop - Stop automatic messaging</li>
                            <li>GET /export/:phoneNumber? - Export conversation history</li>
                        </ul>
                    </div>
                    
                    <script>
                        // Auto-refresh every 30 seconds to update status
                        setTimeout(() => window.location.reload(), 30000);
                    </script>
                </body>
                </html>
            `);
        });
    }

    setupErrorHandling() {
        // 404 handler
        this.app.use((req, res) => {
            res.status(404).json({ 
                error: 'Endpoint not found',
                path: req.path,
                method: req.method
            });
        });

        // Global error handler
        this.app.use((error, req, res, next) => {
            logger.error('Unhandled error:', error);
            res.status(500).json({ 
                error: 'Internal server error',
                message: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
            });
        });
    }

    async sendAutomaticMessage() {
        try {
            if (!this.whatsappService.isReady) {
                throw new Error('WhatsApp service is not ready');
            }

            if (!this.targetPhoneNumber) {
                throw new Error('Target phone number not configured');
            }

            // Update conversation history from WhatsApp
            const whatsappMessages = await this.whatsappService.getMessages(this.targetPhoneNumber, 10);
            await this.conversationHistory.updateHistoryFromWhatsApp(this.targetPhoneNumber, whatsappMessages);

            // Get recent conversation history
            const conversationHistory = await this.conversationHistory.getHistory(this.targetPhoneNumber, 10);

            // Generate message
            const messageOptions = {
                style: process.env.MESSAGE_STYLE || 'friendly',
                language: process.env.MESSAGE_LANGUAGE || 'english',
                maxTokens: parseInt(process.env.MAX_TOKENS) || 150,
                temperature: parseFloat(process.env.TEMPERATURE) || 0.8
            };

            const result = await this.messageGenerator.generateMessage(conversationHistory, messageOptions);
            
            if (!result.message) {
                throw new Error('Failed to generate message');
            }

            // Validate message
            const validation = this.messageGenerator.validateMessage(result.message);
            if (!validation.valid) {
                throw new Error(`Invalid message: ${validation.reason}`);
            }

            // Send message
            const sendResult = await this.whatsappService.sendMessage(this.targetPhoneNumber, result.message);

            // Save to history
            await this.conversationHistory.addMessage(this.targetPhoneNumber, result.message, 'me');

            // Update stats
            this.stats.messagesSent++;
            this.lastMessageSent = {
                message: result.message,
                timestamp: new Date(),
                phoneNumber: this.targetPhoneNumber,
                type: 'automatic',
                openaiUsage: result.usage
            };

            logger.info(`Automatic message sent successfully: ${result.message}`);

            return {
                message: result.message,
                whatsappResult: sendResult,
                openaiUsage: result.usage,
                timestamp: new Date().toISOString()
            };

        } catch (error) {
            logger.error('Failed to send automatic message:', error);
            this.stats.errors++;
            throw error;
        }
    }

    async updateSchedule(intervalSeconds) {
        try {
            // Stop existing auto message job
            this.cronScheduler.removeJob('autoMessages');

            // Create new job
            this.cronScheduler.scheduleAutoMessages(
                intervalSeconds,
                () => this.sendAutomaticMessage()
            );

            // Start the new job
            this.cronScheduler.startJob('autoMessages');

            logger.info(`Schedule updated to send messages every ${intervalSeconds} seconds`);
        } catch (error) {
            logger.error('Failed to update schedule:', error);
            throw error;
        }
    }

    async initialize() {
        try {
            logger.info('Initializing WhatsApp Automation App...');

            // Validate environment variables
            if (!process.env.OPENAI_API_KEY) {
                throw new Error('OPENAI_API_KEY environment variable is required');
            }

            if (!this.targetPhoneNumber) {
                throw new Error('TARGET_PHONE_NUMBER environment variable is required');
            }

            // Initialize WhatsApp service with retry mechanism
            logger.info('Initializing WhatsApp service...');
            try {
                await this.whatsappService.initialize();
                logger.info('WhatsApp service initialized successfully');
                
                // Verify target contact only if WhatsApp is ready
                const isValid = await this.whatsappService.isContactValid(this.targetPhoneNumber);
                if (!isValid) {
                    logger.warn(`Target phone number ${this.targetPhoneNumber} may not be a valid WhatsApp contact`);
                }
            } catch (whatsappError) {
                logger.error('Failed to initialize WhatsApp service:', whatsappError);
                logger.warn('App will start without WhatsApp connection. QR code will be available at /qr endpoint');
                logger.warn('WhatsApp connection can be retried through the health check mechanism');
                console.log('🔄 Continuing app initialization despite WhatsApp failure...');
            }

            console.log('📋 Setting up scheduled tasks...');
            // Setup scheduled tasks
            logger.info('Setting up scheduled tasks...');
            
            // Auto message sending (only if WhatsApp is ready)
            this.cronScheduler.scheduleAutoMessages(
                this.messageInterval,
                () => {
                    if (this.whatsappService.isReady) {
                        return this.sendAutomaticMessage();
                    } else {
                        logger.warn('Skipping auto message - WhatsApp not ready');
                        return Promise.resolve();
                    }
                }
            );

            // Daily history sync (only if WhatsApp is ready)
            this.cronScheduler.scheduleHistorySync(async () => {
                if (this.whatsappService.isReady) {
                    const messages = await this.whatsappService.getMessages(this.targetPhoneNumber, 20);
                    await this.conversationHistory.updateHistoryFromWhatsApp(this.targetPhoneNumber, messages);
                } else {
                    logger.debug('Skipping history sync - WhatsApp not ready');
                }
            });

            // Health check every 30 minutes - try to reconnect WhatsApp if needed
            this.cronScheduler.scheduleHealthCheck(async () => {
                if (!this.whatsappService.isReady) {
                    logger.warn('WhatsApp service is not ready - attempting to reconnect...');
                    try {
                        await this.whatsappService.initialize();
                        logger.info('WhatsApp service reconnected successfully');
                    } catch (error) {
                        logger.error('Failed to reconnect WhatsApp service:', error);
                    }
                }
            });

            // Start all scheduled jobs
            console.log('⚡ Starting scheduled jobs...');
            this.cronScheduler.startAll();

            this.isInitialized = true;
            console.log('✅ App initialization completed successfully!');
            logger.info('WhatsApp Automation App initialized successfully!');
            
            return true;
        } catch (error) {
            logger.error('Failed to initialize app:', error);
            throw error;
        }
    }

    async start() {
        try {
            console.log('🚀 Starting initialization process...');
            await this.initialize();

            console.log('🌐 Starting Express server...');
            this.app.listen(this.port, () => {
                console.log(`🎉 Server is running on port ${this.port}!`);
                logger.info(`WhatsApp Automation Server running on port ${this.port}`);
                logger.info(`Target: ${this.targetPhoneNumber}`);
                logger.info(`Message interval: ${this.messageInterval} seconds`);
                logger.info(`Dashboard: http://localhost:${this.port}`);
                console.log(`📱 QR Code available at: http://localhost:${this.port}/qr`);
            });

        } catch (error) {
            console.error('💥 Failed to start application:', error);
            logger.error('Failed to start application:', error);
            process.exit(1);
        }
    }

    async shutdown() {
        logger.info('Shutting down WhatsApp Automation App...');
        
        try {
            // Stop scheduled jobs
            await this.cronScheduler.shutdown();
            
            // Disconnect WhatsApp
            await this.whatsappService.disconnect();
            
            logger.info('Shutdown complete');
            process.exit(0);
        } catch (error) {
            logger.error('Error during shutdown:', error);
            process.exit(1);
        }
    }
}

// Create and start the application
const app = new WhatsAppAutomationApp();

// Handle graceful shutdown
process.on('SIGINT', () => app.shutdown());
process.on('SIGTERM', () => app.shutdown());
process.on('uncaughtException', (error) => {
    logger.error('Uncaught exception:', error);
    app.shutdown();
});

// Start the application
app.start();

module.exports = WhatsAppAutomationApp;
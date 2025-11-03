const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const QRCode = require('qrcode');
const logger = require('./logger');

class WhatsAppService {
    constructor() {
        this.client = null;
        this.isReady = false;
        this.qrCodeGenerated = false;
        this.qrCodeData = null; // Store QR code for web display
        this.qrCodeImage = null; // Store QR code as base64 image
    }

    async initialize() {
        try {
            // Enhanced Puppeteer configuration for cloud deployment
            const puppeteerConfig = {
                headless: true,
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-accelerated-2d-canvas',
                    '--no-first-run',
                    '--no-zygote',
                    '--single-process',
                    '--disable-gpu',
                    '--disable-background-timer-throttling',
                    '--disable-backgrounding-occluded-windows',
                    '--disable-renderer-backgrounding',
                    '--disable-features=TranslateUI',
                    '--disable-ipc-flooding-protection',
                    '--disable-extensions',
                    '--disable-default-apps',
                    '--disable-sync',
                    '--disable-translate',
                    '--disable-background-networking',
                    '--disable-component-extensions-with-background-pages',
                    '--disable-permissions-api',
                    '--disable-notifications',
                    '--disable-web-security',
                    '--memory-pressure-off',
                    '--max_old_space_size=4096'
                ]
            };

            // Use system Chrome in production (set in Dockerfile)
            if (process.env.NODE_ENV === 'production' && process.env.PUPPETEER_EXECUTABLE_PATH) {
                puppeteerConfig.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
                logger.info(`Using system Chrome at: ${process.env.PUPPETEER_EXECUTABLE_PATH}`);
            }

            // Initialize WhatsApp client with local authentication
            this.client = new Client({
                authStrategy: new LocalAuth({
                    clientId: 'whatsapp-auto-message',
                    dataPath: './session'
                }),
                puppeteer: puppeteerConfig
            });

            this.setupEventHandlers();
            
            logger.info('Initializing WhatsApp client...');
            await this.client.initialize();
            
            return new Promise((resolve, reject) => {
                const timeout = setTimeout(() => {
                    reject(new Error('WhatsApp initialization timeout'));
                }, 120000); // 2 minutes timeout

                this.client.once('ready', () => {
                    clearTimeout(timeout);
                    resolve();
                });

                this.client.once('auth_failure', (msg) => {
                    clearTimeout(timeout);
                    reject(new Error(`Authentication failed: ${msg}`));
                });
            });
        } catch (error) {
            logger.error('Failed to initialize WhatsApp client:', error);
            throw error;
        }
    }

    setupEventHandlers() {
        // QR Code generation
        this.client.on('qr', async (qr) => {
            if (!this.qrCodeGenerated) {
                logger.info('QR Code received. Please scan with your WhatsApp:');
                
                // Store QR data for web access
                this.qrCodeData = qr;
                
                try {
                    // Generate QR code as base64 image for web display
                    this.qrCodeImage = await QRCode.toDataURL(qr, {
                        width: 256,
                        margin: 2
                    });
                    logger.info('QR Code available at: http://localhost:3000/qr (or your deployment URL)');
                } catch (error) {
                    logger.error('Error generating QR code image:', error);
                }
                
                // Still show in terminal for local development
                if (process.env.NODE_ENV !== 'production') {
                    qrcode.generate(qr, { small: true });
                }
                
                this.qrCodeGenerated = true;
            }
        });

        // Authentication success
        this.client.on('authenticated', () => {
            logger.info('WhatsApp authenticated successfully');
        });

        // Client ready
        this.client.on('ready', () => {
            logger.info('WhatsApp client is ready!');
            this.isReady = true;
        });

        // Authentication failure
        this.client.on('auth_failure', (msg) => {
            logger.error('Authentication failed:', msg);
            this.isReady = false;
        });

        // Disconnected
        this.client.on('disconnected', (reason) => {
            logger.warn('WhatsApp client disconnected:', reason);
            this.isReady = false;
        });

        // Message received (for conversation history)
        this.client.on('message', async (message) => {
            try {
                const contact = await message.getContact();
                logger.info(`Message received from ${contact.number}: ${message.body}`);
            } catch (error) {
                logger.error('Error processing received message:', error);
            }
        });

        // Error handling
        this.client.on('error', (error) => {
            logger.error('WhatsApp client error:', error);
        });
    }

    async sendMessage(phoneNumber, message) {
        try {
            if (!this.isReady) {
                throw new Error('WhatsApp client is not ready');
            }

            // Format phone number (ensure it includes country code)
            const formattedNumber = `${phoneNumber}@c.us`;
            
            // Send message
            const result = await this.client.sendMessage(formattedNumber, message);
            
            logger.info(`Message sent to ${phoneNumber}: ${message}`);
            return result;
        } catch (error) {
            logger.error(`Failed to send message to ${phoneNumber}:`, error);
            throw error;
        }
    }

    async getMessages(phoneNumber, limit = 10) {
        try {
            if (!this.isReady) {
                throw new Error('WhatsApp client is not ready');
            }

            const formattedNumber = `${phoneNumber}@c.us`;
            const chat = await this.client.getChatById(formattedNumber);
            
            if (!chat) {
                logger.warn(`No chat found for ${phoneNumber}`);
                return [];
            }

            const messages = await chat.fetchMessages({ limit });
            
            return messages.map(msg => ({
                from: msg.from.includes(phoneNumber) ? 'contact' : 'me',
                body: msg.body,
                timestamp: msg.timestamp * 1000, // Convert to milliseconds
                type: msg.type
            }));
        } catch (error) {
            logger.error(`Failed to get messages for ${phoneNumber}:`, error);
            return [];
        }
    }

    async isContactValid(phoneNumber) {
        try {
            if (!this.isReady) {
                return false;
            }

            const formattedNumber = `${phoneNumber}@c.us`;
            const contact = await this.client.getContactById(formattedNumber);
            
            return contact && contact.isWAContact;
        } catch (error) {
            logger.error(`Failed to validate contact ${phoneNumber}:`, error);
            return false;
        }
    }

    async getClientInfo() {
        try {
            if (!this.isReady) {
                return null;
            }

            const info = this.client.info;
            return {
                wid: info.wid,
                pushname: info.pushname,
                phone: info.wid.user
            };
        } catch (error) {
            logger.error('Failed to get client info:', error);
            return null;
        }
    }

    async disconnect() {
        try {
            if (this.client) {
                await this.client.destroy();
                this.isReady = false;
                logger.info('WhatsApp client disconnected successfully');
            }
        } catch (error) {
            logger.error('Error disconnecting WhatsApp client:', error);
        }
    }

    getStatus() {
        return {
            isReady: this.isReady,
            qrCodeGenerated: this.qrCodeGenerated,
            hasQrCode: !!this.qrCodeData
        };
    }

    getQRCode() {
        return {
            data: this.qrCodeData,
            image: this.qrCodeImage,
            generated: this.qrCodeGenerated
        };
    }
}

module.exports = WhatsAppService;
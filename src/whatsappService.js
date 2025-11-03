const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const QRCode = require('qrcode');
const logger = require('./logger');

class WhatsAppService {
    constructor() {
        this.client = null;
        this.isReady = false;
        this.qrCodeGenerated = false;
        this.qrCodeData = null;
        this.qrCodeImage = null;
        this.isCloudEnvironment = this.detectCloudEnvironment();
        this.retryCount = 0;
        this.maxRetries = 3;
    }

    detectCloudEnvironment() {
        const cloudIndicators = [
            process.env.RAILWAY_ENVIRONMENT,
            process.env.VERCEL,
            process.env.HEROKU,
            process.env.AWS_LAMBDA_FUNCTION_NAME,
            process.env.GOOGLE_CLOUD_PROJECT,
            process.env.AZURE_FUNCTIONS_ENVIRONMENT,
            process.env.RENDER,
            process.env.NETLIFY
        ];
        
        const isCloud = cloudIndicators.some(indicator => indicator !== undefined) || 
                       process.env.NODE_ENV === 'production';

        logger.info(`Environment detected: ${isCloud ? 'Cloud' : 'Local'}`);
        return isCloud;
    }

    async createPuppeteerConfig() {
        const baseArgs = [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--disable-gpu',
            '--disable-background-timer-throttling',
            '--disable-backgrounding-occluded-windows',
            '--disable-renderer-backgrounding',
            '--disable-features=TranslateUI,VizDisplayCompositor',
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
            '--max_old_space_size=2048'
        ];

        const config = {
            headless: 'new',
            args: baseArgs
        };

        if (this.isCloudEnvironment) {
            logger.info('Configuring for cloud environment...');
            
            config.args.push(
                '--single-process',
                '--disable-blink-features=AutomationControlled',
                '--use-gl=swiftshader',
                '--disable-software-rasterizer'
            );

            // Try @sparticuz/chromium for cloud deployment
            try {
                const chromium = require('@sparticuz/chromium');
                config.executablePath = await chromium.executablePath();
                config.args = [...chromium.args, ...config.args];
                logger.info('Using @sparticuz/chromium for cloud deployment');
                return config;
            } catch (error) {
                logger.warn('@sparticuz/chromium not available, trying system Chrome');
            }

            // Fallback paths for system Chrome
            const possiblePaths = [
                '/usr/bin/google-chrome-stable',
                '/usr/bin/google-chrome',
                '/usr/bin/chromium-browser',
                '/usr/bin/chromium',
                process.env.PUPPETEER_EXECUTABLE_PATH,
                process.env.CHROME_BIN
            ].filter(Boolean);

            for (const path of possiblePaths) {
                try {
                    if (require('fs').existsSync(path)) {
                        config.executablePath = path;
                        logger.info(`Using system Chrome at: ${path}`);
                        break;
                    }
                } catch (e) {
                    // Continue to next path
                }
            }
        }

        return config;
    }

    async initialize() {
        for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
            try {
                logger.info(`WhatsApp initialization attempt ${attempt}/${this.maxRetries}`);
                
                if (this.client) {
                    await this.cleanup();
                }

                const puppeteerConfig = await this.createPuppeteerConfig();
                
                const authStrategy = new LocalAuth({
                    clientId: this.isCloudEnvironment ? "cloud-client" : "local-client",
                    dataPath: this.isCloudEnvironment ? '/tmp/wwebjs_auth' : undefined
                });

                this.client = new Client({
                    authStrategy: authStrategy,
                    puppeteer: puppeteerConfig,
                    webVersionCache: {
                        type: 'remote',
                        remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.2412.54.html',
                    },
                    takeoverOnConflict: true,
                    qrMaxRetries: 3,
                    authTimeoutMs: 60000,
                    restartOnAuthFail: true
                });

                this.setupEventHandlers();
                await this.client.initialize();
                
                logger.info('WhatsApp client initialized successfully');
                this.retryCount = 0;
                return;
                
            } catch (error) {
                logger.error(`Initialization attempt ${attempt} failed:`, error.message);
                
                if (attempt === this.maxRetries) {
                    logger.error('All initialization attempts failed. App will continue without WhatsApp.');
                    return; // Don't throw to allow app to continue
                }
                
                // Wait before retry
                await new Promise(resolve => setTimeout(resolve, 5000 * attempt));
            }
        }
    }

    setupEventHandlers() {
        this.client.on('qr', async (qr) => {
            if (!this.qrCodeGenerated) {
                logger.info('QR Code received');
                qrcode.generate(qr, { small: true });
                
                this.qrCodeData = qr;
                
                try {
                    this.qrCodeImage = await QRCode.toDataURL(qr);
                    logger.info('QR Code image generated for web display');
                } catch (error) {
                    logger.error('Error generating QR code image:', error);
                }
                
                this.qrCodeGenerated = true;
                logger.info('Please scan the QR code with your phone.');
            }
        });

        this.client.on('ready', () => {
            logger.info('WhatsApp Client is ready!');
            this.isReady = true;
            this.qrCodeGenerated = false;
            this.qrCodeData = null;
            this.qrCodeImage = null;
        });

        this.client.on('authenticated', () => {
            logger.info('WhatsApp Client authenticated successfully');
        });

        this.client.on('auth_failure', (msg) => {
            logger.error('Authentication failed:', msg);
            this.qrCodeGenerated = false;
        });

        this.client.on('disconnected', (reason) => {
            logger.warn('WhatsApp Client disconnected:', reason);
            this.isReady = false;
            this.qrCodeGenerated = false;
        });

        this.client.on('loading_screen', (percent, message) => {
            logger.info(`Loading: ${percent}% - ${message}`);
        });

        this.client.on('error', (error) => {
            logger.error('WhatsApp Client error:', error);
        });
    }

    async sendMessage(phoneNumber, message) {
        try {
            if (!this.isReady) {
                throw new Error('WhatsApp client is not ready');
            }

            const chatId = phoneNumber.includes('@c.us') ? phoneNumber : `${phoneNumber}@c.us`;
            
            logger.info(`Sending message to ${phoneNumber}`);
            const result = await this.client.sendMessage(chatId, message);
            logger.info(`Message sent successfully to ${phoneNumber}`);
            
            return result;
        } catch (error) {
            logger.error(`Error sending message to ${phoneNumber}:`, error);
            throw error;
        }
    }

    async getMessages(phoneNumber, limit = 10) {
        try {
            if (!this.isReady) {
                throw new Error('WhatsApp client is not ready');
            }

            const chatId = phoneNumber.includes('@c.us') ? phoneNumber : `${phoneNumber}@c.us`;
            const chat = await this.client.getChatById(chatId);
            
            if (!chat) {
                throw new Error(`Chat not found for ${phoneNumber}`);
            }

            const messages = await chat.fetchMessages({ limit });
            
            return messages.map(msg => ({
                id: msg.id._serialized,
                body: msg.body,
                from: msg.from,
                to: msg.to,
                timestamp: msg.timestamp,
                fromMe: msg.fromMe,
                type: msg.type
            }));
        } catch (error) {
            logger.error(`Error getting messages for ${phoneNumber}:`, error);
            throw error;
        }
    }

    async isContactValid(phoneNumber) {
        try {
            if (!this.isReady) {
                return false;
            }

            const contactId = phoneNumber.includes('@c.us') ? phoneNumber : `${phoneNumber}@c.us`;
            const contact = await this.client.getContactById(contactId);
            
            return contact && contact.isWAContact;
        } catch (error) {
            logger.error(`Error validating contact ${phoneNumber}:`, error);
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
                name: info.pushname,
                platform: info.platform,
                connected: this.isReady
            };
        } catch (error) {
            logger.error('Error getting client info:', error);
            return null;
        }
    }

    async cleanup() {
        try {
            if (this.client) {
                logger.info('Cleaning up WhatsApp client...');
                await this.client.destroy();
                this.client = null;
                this.isReady = false;
                this.qrCodeGenerated = false;
                this.qrCodeData = null;
                this.qrCodeImage = null;
                logger.info('WhatsApp client cleaned up');
            }
        } catch (error) {
            logger.error('Error during cleanup:', error);
        }
    }

    getStatus() {
        return {
            isReady: this.isReady,
            qrCodeGenerated: this.qrCodeGenerated,
            isCloudEnvironment: this.isCloudEnvironment,
            retryCount: this.retryCount
        };
    }

    getQRCode() {
        return {
            data: this.qrCodeData,
            image: this.qrCodeImage
        };
    }
}

module.exports = WhatsAppService;

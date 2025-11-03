const logger = require('./logger');

/**
 * Alternative WhatsApp service for environments where Puppeteer/Chrome cannot run
 * This implements a hybrid approach with webhook support and graceful degradation
 */
class AlternativeWhatsAppService {
    constructor() {
        this.isReady = false;
        this.qrCodeGenerated = false;
        this.qrCodeData = 'Please use local development or a supported cloud platform for WhatsApp integration';
        this.qrCodeImage = null;
        this.webhookUrl = process.env.WHATSAPP_WEBHOOK_URL;
        this.apiKey = process.env.WHATSAPP_API_KEY;
        this.mode = 'webhook'; // webhook, api, or mock
    }

    async initialize() {
        try {
            logger.info('Initializing Alternative WhatsApp Service...');
            
            if (this.webhookUrl && this.apiKey) {
                this.mode = 'webhook';
                logger.info('Using webhook mode for WhatsApp integration');
                this.isReady = true;
            } else if (process.env.WHATSAPP_BUSINESS_API_URL) {
                this.mode = 'api';
                logger.info('Using WhatsApp Business API mode');
                this.isReady = true;
            } else {
                this.mode = 'mock';
                logger.warn('Running in mock mode - messages will be logged but not sent');
                this.isReady = true;
            }

            // Simulate QR code generation for UI compatibility
            this.qrCodeGenerated = true;
            
        } catch (error) {
            logger.error('Error initializing Alternative WhatsApp service:', error);
            this.mode = 'mock';
            this.isReady = true; // Still mark as ready to allow app operation
        }
    }

    async sendMessage(phoneNumber, message) {
        try {
            if (!this.isReady) {
                throw new Error('Alternative WhatsApp service is not ready');
            }

            logger.info(`[${this.mode.toUpperCase()}] Sending message to ${phoneNumber}: ${message.substring(0, 50)}...`);

            switch (this.mode) {
                case 'webhook':
                    return await this.sendViaWebhook(phoneNumber, message);
                case 'api':
                    return await this.sendViaAPI(phoneNumber, message);
                case 'mock':
                default:
                    return this.mockSend(phoneNumber, message);
            }
        } catch (error) {
            logger.error(`Error sending message via ${this.mode}:`, error);
            throw error;
        }
    }

    async sendViaWebhook(phoneNumber, message) {
        try {
            const response = await fetch(this.webhookUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.apiKey}`
                },
                body: JSON.stringify({
                    to: phoneNumber,
                    message: message,
                    timestamp: Date.now()
                })
            });

            if (!response.ok) {
                throw new Error(`Webhook request failed: ${response.status}`);
            }

            const result = await response.json();
            logger.info(`Message sent via webhook to ${phoneNumber}`);
            return result;
        } catch (error) {
            logger.error('Webhook send failed:', error);
            throw error;
        }
    }

    async sendViaAPI(phoneNumber, message) {
        try {
            const apiUrl = process.env.WHATSAPP_BUSINESS_API_URL;
            const response = await fetch(`${apiUrl}/messages`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${process.env.WHATSAPP_BUSINESS_ACCESS_TOKEN}`
                },
                body: JSON.stringify({
                    messaging_product: 'whatsapp',
                    to: phoneNumber,
                    type: 'text',
                    text: { body: message }
                })
            });

            if (!response.ok) {
                throw new Error(`API request failed: ${response.status}`);
            }

            const result = await response.json();
            logger.info(`Message sent via Business API to ${phoneNumber}`);
            return result;
        } catch (error) {
            logger.error('Business API send failed:', error);
            throw error;
        }
    }

    mockSend(phoneNumber, message) {
        logger.info('='.repeat(60));
        logger.info('MOCK WHATSAPP MESSAGE');
        logger.info(`To: ${phoneNumber}`);
        logger.info(`Message: ${message}`);
        logger.info(`Timestamp: ${new Date().toISOString()}`);
        logger.info('='.repeat(60));
        
        return {
            id: `mock_${Date.now()}`,
            success: true,
            mode: 'mock',
            timestamp: Date.now()
        };
    }

    async getMessages(phoneNumber, limit = 10) {
        logger.warn('Message retrieval not supported in alternative service');
        return [];
    }

    async isContactValid(phoneNumber) {
        // In alternative mode, we assume all contacts are valid
        // In production, this could make an API call to validate
        return true;
    }

    async getClientInfo() {
        return {
            wid: 'alternative_service',
            name: 'Alternative WhatsApp Service',
            platform: this.mode,
            connected: this.isReady
        };
    }

    async cleanup() {
        logger.info('Cleaning up Alternative WhatsApp service...');
        this.isReady = false;
    }

    getStatus() {
        return {
            isReady: this.isReady,
            qrCodeGenerated: this.qrCodeGenerated,
            mode: this.mode,
            isAlternativeService: true
        };
    }

    getQRCode() {
        return {
            data: this.qrCodeData,
            image: null // No actual QR code in alternative service
        };
    }
}

module.exports = AlternativeWhatsAppService;
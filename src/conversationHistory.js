const fs = require('fs-extra');
const path = require('path');
const logger = require('./logger');

class ConversationHistory {
    constructor(dataDir = './data') {
        this.dataDir = dataDir;
        this.historyFile = path.join(dataDir, 'conversation_history.json');
        this.maxHistorySize = 100; // Maximum number of messages to store per contact
        this.initializeStorage();
    }

    async initializeStorage() {
        try {
            await fs.ensureDir(this.dataDir);
            
            // Create history file if it doesn't exist
            if (!await fs.pathExists(this.historyFile)) {
                await fs.writeJson(this.historyFile, {});
                logger.info('Created new conversation history file');
            }
        } catch (error) {
            logger.error('Failed to initialize conversation history storage:', error);
        }
    }

    async loadHistory() {
        try {
            if (await fs.pathExists(this.historyFile)) {
                return await fs.readJson(this.historyFile);
            }
            return {};
        } catch (error) {
            logger.error('Failed to load conversation history:', error);
            return {};
        }
    }

    async saveHistory(history) {
        try {
            await fs.writeJson(this.historyFile, history, { spaces: 2 });
        } catch (error) {
            logger.error('Failed to save conversation history:', error);
        }
    }

    async addMessage(phoneNumber, message, from = 'me') {
        try {
            const history = await this.loadHistory();
            
            if (!history[phoneNumber]) {
                history[phoneNumber] = [];
            }

            const messageEntry = {
                body: message,
                from: from,
                timestamp: Date.now(),
                type: 'chat'
            };

            history[phoneNumber].push(messageEntry);

            // Trim history if it exceeds max size
            if (history[phoneNumber].length > this.maxHistorySize) {
                history[phoneNumber] = history[phoneNumber].slice(-this.maxHistorySize);
            }

            await this.saveHistory(history);
            logger.debug(`Added message to history for ${phoneNumber}: ${message.substring(0, 50)}...`);
            
            return messageEntry;
        } catch (error) {
            logger.error('Failed to add message to history:', error);
            return null;
        }
    }

    async getHistory(phoneNumber, limit = 10) {
        try {
            const history = await this.loadHistory();
            
            if (!history[phoneNumber]) {
                return [];
            }

            // Return the most recent messages up to the limit
            return history[phoneNumber].slice(-limit);
        } catch (error) {
            logger.error('Failed to get conversation history:', error);
            return [];
        }
    }

    async getLastMessage(phoneNumber) {
        try {
            const history = await this.getHistory(phoneNumber, 1);
            return history.length > 0 ? history[0] : null;
        } catch (error) {
            logger.error('Failed to get last message:', error);
            return null;
        }
    }

    async updateHistoryFromWhatsApp(phoneNumber, whatsappMessages) {
        try {
            const currentHistory = await this.getHistory(phoneNumber, this.maxHistorySize);
            const currentTimestamps = new Set(currentHistory.map(msg => msg.timestamp));
            
            // Filter out messages that are already in our history
            const newMessages = whatsappMessages.filter(msg => 
                !currentTimestamps.has(msg.timestamp)
            );

            if (newMessages.length === 0) {
                return 0;
            }

            const history = await this.loadHistory();
            if (!history[phoneNumber]) {
                history[phoneNumber] = [];
            }

            // Add new messages
            history[phoneNumber].push(...newMessages);

            // Sort by timestamp
            history[phoneNumber].sort((a, b) => a.timestamp - b.timestamp);

            // Trim to max size
            if (history[phoneNumber].length > this.maxHistorySize) {
                history[phoneNumber] = history[phoneNumber].slice(-this.maxHistorySize);
            }

            await this.saveHistory(history);
            logger.info(`Updated history for ${phoneNumber} with ${newMessages.length} new messages`);
            
            return newMessages.length;
        } catch (error) {
            logger.error('Failed to update history from WhatsApp:', error);
            return 0;
        }
    }

    async getConversationStats(phoneNumber) {
        try {
            const history = await this.getHistory(phoneNumber, this.maxHistorySize);
            
            if (history.length === 0) {
                return {
                    totalMessages: 0,
                    myMessages: 0,
                    theirMessages: 0,
                    lastMessageTime: null,
                    conversationStarted: null
                };
            }

            const myMessages = history.filter(msg => msg.from === 'me').length;
            const theirMessages = history.filter(msg => msg.from === 'contact').length;
            const lastMessage = history[history.length - 1];
            const firstMessage = history[0];

            return {
                totalMessages: history.length,
                myMessages,
                theirMessages,
                lastMessageTime: new Date(lastMessage.timestamp),
                conversationStarted: new Date(firstMessage.timestamp),
                lastMessageFrom: lastMessage.from
            };
        } catch (error) {
            logger.error('Failed to get conversation stats:', error);
            return null;
        }
    }

    async getRecentActivity(phoneNumber, hoursBack = 24) {
        try {
            const history = await this.getHistory(phoneNumber, this.maxHistorySize);
            const cutoffTime = Date.now() - (hoursBack * 60 * 60 * 1000);
            
            return history.filter(msg => msg.timestamp > cutoffTime);
        } catch (error) {
            logger.error('Failed to get recent activity:', error);
            return [];
        }
    }

    async clearHistory(phoneNumber = null) {
        try {
            if (phoneNumber) {
                // Clear history for specific contact
                const history = await this.loadHistory();
                delete history[phoneNumber];
                await this.saveHistory(history);
                logger.info(`Cleared history for ${phoneNumber}`);
            } else {
                // Clear all history
                await this.saveHistory({});
                logger.info('Cleared all conversation history');
            }
            return true;
        } catch (error) {
            logger.error('Failed to clear history:', error);
            return false;
        }
    }

    async exportHistory(phoneNumber = null, format = 'json') {
        try {
            const history = await this.loadHistory();
            const exportData = phoneNumber ? { [phoneNumber]: history[phoneNumber] || [] } : history;
            
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const filename = `conversation_export_${timestamp}.${format}`;
            const filepath = path.join(this.dataDir, filename);

            if (format === 'json') {
                await fs.writeJson(filepath, exportData, { spaces: 2 });
            } else if (format === 'txt') {
                let content = '';
                for (const [contact, messages] of Object.entries(exportData)) {
                    content += `\n=== Conversation with ${contact} ===\n\n`;
                    for (const msg of messages) {
                        const date = new Date(msg.timestamp).toLocaleString();
                        content += `[${date}] ${msg.from === 'me' ? 'You' : 'Contact'}: ${msg.body}\n`;
                    }
                }
                await fs.writeFile(filepath, content, 'utf8');
            }

            logger.info(`Exported conversation history to ${filepath}`);
            return filepath;
        } catch (error) {
            logger.error('Failed to export history:', error);
            return null;
        }
    }

    async getStorageInfo() {
        try {
            if (!await fs.pathExists(this.historyFile)) {
                return { exists: false, size: 0, contacts: 0 };
            }

            const stats = await fs.stat(this.historyFile);
            const history = await this.loadHistory();
            
            return {
                exists: true,
                size: stats.size,
                contacts: Object.keys(history).length,
                lastModified: stats.mtime,
                path: this.historyFile
            };
        } catch (error) {
            logger.error('Failed to get storage info:', error);
            return null;
        }
    }
}

module.exports = ConversationHistory;
const fs = require('fs-extra');
const path = require('path');
const logger = require('./logger');

class ConversationHistory {
    constructor(dataDir = './data') {
        this.dataDir = dataDir;
        this.historyFile = path.join(dataDir, 'conversation_history.json');
        this.maxHistorySize = 50; // Increased for better context
        this.maxStoredMessages = 200; // Maximum messages stored per contact
        this.initializeStorage();
    }

    async initializeStorage() {
        try {
            await fs.ensureDir(this.dataDir);
            
            // Create history file if it doesn't exist
            if (!await fs.pathExists(this.historyFile)) {
                await fs.writeJson(this.historyFile, {
                    metadata: {
                        version: '2.0',
                        created: Date.now(),
                        lastUpdated: Date.now()
                    },
                    conversations: {}
                });
                logger.info('Created new conversation history file v2.0');
            } else {
                // Migrate old format if needed
                await this.migrateHistoryFormat();
            }
        } catch (error) {
            logger.error('Failed to initialize conversation history storage:', error);
        }
    }

    async migrateHistoryFormat() {
        try {
            const data = await fs.readJson(this.historyFile);
            
            // Check if it's old format (direct phone number keys)
            if (!data.metadata && !data.conversations) {
                logger.info('Migrating conversation history to new format...');
                
                const newFormat = {
                    metadata: {
                        version: '2.0',
                        created: Date.now(),
                        lastUpdated: Date.now(),
                        migrated: true
                    },
                    conversations: {}
                };

                // Migrate old data
                for (const [phoneNumber, messages] of Object.entries(data)) {
                    if (Array.isArray(messages)) {
                        newFormat.conversations[phoneNumber] = {
                            contact: {
                                phoneNumber,
                                name: null,
                                lastSeen: null
                            },
                            messages: messages.map(msg => ({
                                id: msg.id || `migrated_${msg.timestamp}`,
                                messageId: msg.messageId || null,
                                body: msg.body,
                                from: msg.from === 'me' ? 'outgoing' : 'incoming',
                                fromMe: msg.from === 'me',
                                timestamp: msg.timestamp,
                                type: msg.type || 'chat',
                                isVoiceMessage: msg.body?.startsWith('[Voice:') || false,
                                metadata: {
                                    migrated: true
                                }
                            }))
                        };
                    }
                }

                await fs.writeJson(this.historyFile, newFormat, { spaces: 2 });
                logger.info('Successfully migrated conversation history');
            }
        } catch (error) {
            logger.error('Failed to migrate history format:', error);
        }
    }

    async loadHistory() {
        try {
            if (await fs.pathExists(this.historyFile)) {
                const data = await fs.readJson(this.historyFile);
                
                // Ensure proper structure
                if (!data.metadata || !data.conversations) {
                    await this.migrateHistoryFormat();
                    return await fs.readJson(this.historyFile);
                }
                
                return data;
            }
            return {
                metadata: {
                    version: '2.0',
                    created: Date.now(),
                    lastUpdated: Date.now()
                },
                conversations: {}
            };
        } catch (error) {
            logger.error('Failed to load conversation history:', error);
            return {
                metadata: {
                    version: '2.0',
                    created: Date.now(),
                    lastUpdated: Date.now()
                },
                conversations: {}
            };
        }
    }

    async saveHistory(data) {
        try {
            // Update metadata
            data.metadata.lastUpdated = Date.now();
            await fs.writeJson(this.historyFile, data, { spaces: 2 });
        } catch (error) {
            logger.error('Failed to save conversation history:', error);
        }
    }

    async initializeConversation(phoneNumber, contactName = null) {
        try {
            const data = await this.loadHistory();
            
            if (!data.conversations[phoneNumber]) {
                // Create new conversation
                data.conversations[phoneNumber] = {
                    contact: {
                        phoneNumber,
                        name: contactName,
                        lastSeen: null,
                        isValid: null
                    },
                    messages: [],
                    stats: {
                        totalMessages: 0,
                        incomingMessages: 0,
                        outgoingMessages: 0,
                        voiceMessages: 0,
                        firstMessage: null,
                        lastMessage: null
                    }
                };
                
                await this.saveHistory(data);
                logger.info(`Initialized new conversation for ${phoneNumber}`);
            } else {
                // Ensure existing conversation has proper structure
                const conversation = data.conversations[phoneNumber];
                
                // Ensure contact structure exists
                if (!conversation.contact) {
                    conversation.contact = {
                        phoneNumber,
                        name: contactName,
                        lastSeen: null,
                        isValid: null
                    };
                }
                
                // Ensure messages array exists
                if (!conversation.messages) {
                    conversation.messages = [];
                }
                
                // Ensure stats object exists
                if (!conversation.stats) {
                    conversation.stats = {
                        totalMessages: conversation.messages.length || 0,
                        incomingMessages: conversation.messages.filter(m => m.from === 'incoming').length || 0,
                        outgoingMessages: conversation.messages.filter(m => m.from === 'outgoing').length || 0,
                        voiceMessages: conversation.messages.filter(m => m.isVoiceMessage).length || 0,
                        firstMessage: conversation.messages.length > 0 ? Math.min(...conversation.messages.map(m => m.timestamp)) : null,
                        lastMessage: conversation.messages.length > 0 ? Math.max(...conversation.messages.map(m => m.timestamp)) : null
                    };
                    
                    await this.saveHistory(data);
                    logger.info(`Updated conversation structure for ${phoneNumber}`);
                }
            }
            
            return data.conversations[phoneNumber];
        } catch (error) {
            logger.error(`Failed to initialize conversation for ${phoneNumber}:`, error);
            return null;
        }
    }

    async addMessage(phoneNumber, messageData, fromWhatsApp = false) {
        try {
            await this.initializeConversation(phoneNumber);
            const data = await this.loadHistory();
            const conversation = data.conversations[phoneNumber];
            
            // Normalize message data
            const normalizedMessage = this.normalizeMessage(messageData, fromWhatsApp);
            
            // Check for duplicates using multiple strategies
            if (this.isDuplicateMessage(conversation.messages, normalizedMessage)) {
                logger.debug(`Duplicate message detected for ${phoneNumber}, skipping`);
                return null;
            }
            
            // Add message
            conversation.messages.push(normalizedMessage);
            
            // Update stats
            this.updateConversationStats(conversation, normalizedMessage);
            
            // Trim messages if exceeding limit
            if (conversation.messages.length > this.maxStoredMessages) {
                const trimmed = conversation.messages.slice(-this.maxStoredMessages);
                conversation.messages = trimmed;
                logger.debug(`Trimmed conversation history for ${phoneNumber} to ${this.maxStoredMessages} messages`);
            }
            
            // Sort messages by timestamp to maintain order
            conversation.messages.sort((a, b) => a.timestamp - b.timestamp);
            
            await this.saveHistory(data);
            
            const logMessage = normalizedMessage.body.length > 50 
                ? `${normalizedMessage.body.substring(0, 50)}...` 
                : normalizedMessage.body;
            
            logger.info(`Added ${normalizedMessage.from} message for ${phoneNumber}: ${logMessage}`);
            
            return normalizedMessage;
        } catch (error) {
            logger.error(`Failed to add message for ${phoneNumber}:`, error);
            return null;
        }
    }

    normalizeMessage(messageData, fromWhatsApp = false) {
        const timestamp = fromWhatsApp ? (messageData.timestamp * 1000) : Date.now();
        const isVoice = messageData.body?.startsWith('[Voice:') || messageData.type === 'ptt' || messageData.type === 'audio';
        
        if (fromWhatsApp) {
            // Message from WhatsApp API
            return {
                id: messageData.id || `wa_${messageData.timestamp}`,
                messageId: messageData.id,
                body: messageData.body || '[Non-text message]',
                from: messageData.fromMe ? 'outgoing' : 'incoming',
                fromMe: messageData.fromMe,
                timestamp,
                type: messageData.type || 'chat',
                isVoiceMessage: isVoice,
                metadata: {
                    source: 'whatsapp',
                    originalFrom: messageData.from,
                    originalTo: messageData.to
                }
            };
        } else {
            // Message from our system
            return {
                id: `sys_${timestamp}_${Math.random().toString(36).substr(2, 9)}`,
                messageId: null,
                body: messageData.body || messageData,
                from: messageData.from === 'contact' ? 'incoming' : 'outgoing',
                fromMe: messageData.from !== 'contact',
                timestamp,
                type: messageData.type || 'chat',
                isVoiceMessage: isVoice,
                metadata: {
                    source: 'system'
                }
            };
        }
    }

    isDuplicateMessage(messages, newMessage) {
        // Check for exact duplicates (same ID)
        if (newMessage.messageId && messages.some(msg => msg.messageId === newMessage.messageId)) {
            return true;
        }
        
        // Check for near-duplicate content (same body within 5 seconds)
        const timeWindow = 5000; // 5 seconds
        const recentMessages = messages.filter(msg => 
            Math.abs(msg.timestamp - newMessage.timestamp) < timeWindow
        );
        
        return recentMessages.some(msg => 
            msg.body === newMessage.body && 
            msg.from === newMessage.from
        );
    }

    updateConversationStats(conversation, message) {
        // Ensure stats object exists (for existing conversations that might not have it)
        if (!conversation.stats) {
            conversation.stats = {
                totalMessages: 0,
                incomingMessages: 0,
                outgoingMessages: 0,
                voiceMessages: 0,
                firstMessage: null,
                lastMessage: null
            };
        }
        
        const stats = conversation.stats;
        
        stats.totalMessages++;
        
        if (message.from === 'incoming') {
            stats.incomingMessages++;
        } else {
            stats.outgoingMessages++;
        }
        
        if (message.isVoiceMessage) {
            stats.voiceMessages++;
        }
        
        if (!stats.firstMessage || message.timestamp < stats.firstMessage) {
            stats.firstMessage = message.timestamp;
        }
        
        if (!stats.lastMessage || message.timestamp > stats.lastMessage) {
            stats.lastMessage = message.timestamp;
        }
    }

    async getHistory(phoneNumber, limit = 10) {
        try {
            const data = await this.loadHistory();
            const conversation = data.conversations[phoneNumber];
            
            if (!conversation || !conversation.messages) {
                return [];
            }

            // Return the most recent messages up to the limit
            const messages = conversation.messages.slice(-limit);
            
            // Convert to legacy format for compatibility
            return messages.map(msg => ({
                id: msg.id,
                body: msg.body,
                from: msg.from === 'outgoing' ? 'me' : 'contact',
                fromMe: msg.fromMe,
                timestamp: msg.timestamp,
                type: msg.type,
                isVoiceMessage: msg.isVoiceMessage
            }));
        } catch (error) {
            logger.error(`Failed to get conversation history for ${phoneNumber}:`, error);
            return [];
        }
    }

    async getConversationContext(phoneNumber, limit = 20) {
        try {
            const data = await this.loadHistory();
            const conversation = data.conversations[phoneNumber];
            
            if (!conversation) {
                return {
                    messages: [],
                    contact: null,
                    stats: null,
                    hasHistory: false
                };
            }

            const recentMessages = conversation.messages.slice(-limit);
            
            return {
                messages: recentMessages,
                contact: conversation.contact,
                stats: conversation.stats,
                hasHistory: conversation.messages.length > 0,
                conversationFlow: this.analyzeConversationFlow(recentMessages)
            };
        } catch (error) {
            logger.error(`Failed to get conversation context for ${phoneNumber}:`, error);
            return {
                messages: [],
                contact: null,
                stats: null,
                hasHistory: false
            };
        }
    }

    analyzeConversationFlow(messages) {
        if (messages.length === 0) {
            return { pattern: 'empty', lastInteraction: null };
        }

        const lastMessage = messages[messages.length - 1];
        const lastIncoming = messages.slice().reverse().find(msg => msg.from === 'incoming');
        const lastOutgoing = messages.slice().reverse().find(msg => msg.from === 'outgoing');
        
        // Analyze conversation patterns
        const recentMessages = messages.slice(-5);
        const incomingCount = recentMessages.filter(msg => msg.from === 'incoming').length;
        const outgoingCount = recentMessages.filter(msg => msg.from === 'outgoing').length;
        
        let pattern = 'balanced';
        if (incomingCount === 0 && outgoingCount > 0) {
            pattern = 'monologue'; // Only our messages
        } else if (incomingCount > outgoingCount * 2) {
            pattern = 'responsive'; // They're talking more
        } else if (outgoingCount > incomingCount * 2) {
            pattern = 'initiating'; // We're talking more
        }

        return {
            pattern,
            lastInteraction: lastMessage?.timestamp,
            lastIncomingMessage: lastIncoming?.timestamp,
            lastOutgoingMessage: lastOutgoing?.timestamp,
            awaitingResponse: lastMessage?.from === 'outgoing',
            conversationAge: Date.now() - (messages[0]?.timestamp || Date.now())
        };
    }

    async getLastMessage(phoneNumber) {
        try {
            const context = await this.getConversationContext(phoneNumber, 1);
            return context.messages.length > 0 ? context.messages[0] : null;
        } catch (error) {
            logger.error(`Failed to get last message for ${phoneNumber}:`, error);
            return null;
        }
    }

    async syncFromWhatsApp(phoneNumber, whatsappMessages) {
        try {
            if (!whatsappMessages || whatsappMessages.length === 0) {
                return 0;
            }

            await this.initializeConversation(phoneNumber);
            let newMessagesCount = 0;

            // Process messages in chronological order
            const sortedMessages = whatsappMessages.sort((a, b) => a.timestamp - b.timestamp);

            for (const msg of sortedMessages) {
                const added = await this.addMessage(phoneNumber, msg, true);
                if (added) {
                    newMessagesCount++;
                }
            }

            if (newMessagesCount > 0) {
                logger.info(`Synced ${newMessagesCount} new messages from WhatsApp for ${phoneNumber}`);
            }

            return newMessagesCount;
        } catch (error) {
            logger.error(`Failed to sync from WhatsApp for ${phoneNumber}:`, error);
            return 0;
        }
    }

    async markMessageSent(phoneNumber, messageContent, voiceMessage = false) {
        try {
            const messageData = {
                body: voiceMessage ? `[Voice: ${messageContent}]` : messageContent,
                from: 'me',
                type: voiceMessage ? 'voice' : 'chat',
                isVoiceMessage: voiceMessage
            };

            return await this.addMessage(phoneNumber, messageData, false);
        } catch (error) {
            logger.error(`Failed to mark message as sent for ${phoneNumber}:`, error);
            return null;
        }
    }

    async getConversationStats(phoneNumber) {
        try {
            const data = await this.loadHistory();
            const conversation = data.conversations[phoneNumber];
            
            if (!conversation) {
                return {
                    totalMessages: 0,
                    incomingMessages: 0,
                    outgoingMessages: 0,
                    voiceMessages: 0,
                    lastMessageTime: null,
                    conversationStarted: null,
                    lastMessageFrom: null,
                    hasHistory: false
                };
            }

            const stats = conversation.stats;
            
            return {
                totalMessages: stats.totalMessages,
                incomingMessages: stats.incomingMessages,
                outgoingMessages: stats.outgoingMessages,
                voiceMessages: stats.voiceMessages,
                lastMessageTime: stats.lastMessage ? new Date(stats.lastMessage) : null,
                conversationStarted: stats.firstMessage ? new Date(stats.firstMessage) : null,
                lastMessageFrom: conversation.messages.length > 0 
                    ? conversation.messages[conversation.messages.length - 1].from 
                    : null,
                hasHistory: conversation.messages.length > 0
            };
        } catch (error) {
            logger.error(`Failed to get conversation stats for ${phoneNumber}:`, error);
            return {
                totalMessages: 0,
                incomingMessages: 0,
                outgoingMessages: 0,
                voiceMessages: 0,
                lastMessageTime: null,
                conversationStarted: null,
                lastMessageFrom: null,
                hasHistory: false
            };
        }
    }

    async getRecentActivity(phoneNumber, hoursBack = 24) {
        try {
            const cutoffTime = Date.now() - (hoursBack * 60 * 60 * 1000);
            const context = await this.getConversationContext(phoneNumber, 100);
            
            return context.messages.filter(msg => msg.timestamp > cutoffTime);
        } catch (error) {
            logger.error(`Failed to get recent activity for ${phoneNumber}:`, error);
            return [];
        }
    }

    async clearHistory(phoneNumber = null) {
        try {
            const data = await this.loadHistory();
            
            if (phoneNumber) {
                // Clear history for specific contact
                delete data.conversations[phoneNumber];
                await this.saveHistory(data);
                logger.info(`Cleared history for ${phoneNumber}`);
            } else {
                // Clear all conversations but keep metadata
                data.conversations = {};
                await this.saveHistory(data);
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
            const data = await this.loadHistory();
            const exportData = phoneNumber 
                ? { [phoneNumber]: data.conversations[phoneNumber] || null } 
                : data;
            
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const filename = `conversation_export_${timestamp}.${format}`;
            const filepath = path.join(this.dataDir, filename);

            if (format === 'json') {
                await fs.writeJson(filepath, exportData, { spaces: 2 });
            } else if (format === 'txt') {
                let content = `Conversation Export - ${new Date().toLocaleString()}\n`;
                content += `Generated by WhatsApp Automatic Message System\n\n`;
                
                const conversations = phoneNumber 
                    ? { [phoneNumber]: data.conversations[phoneNumber] }
                    : data.conversations;
                
                for (const [contact, conversation] of Object.entries(conversations)) {
                    if (!conversation) continue;
                    
                    content += `\n${'='.repeat(60)}\n`;
                    content += `Conversation with ${contact}\n`;
                    if (conversation.contact?.name) {
                        content += `Contact Name: ${conversation.contact.name}\n`;
                    }
                    content += `Total Messages: ${conversation.stats?.totalMessages || 0}\n`;
                    content += `${'='.repeat(60)}\n\n`;
                    
                    for (const msg of conversation.messages || []) {
                        const date = new Date(msg.timestamp).toLocaleString();
                        const sender = msg.from === 'outgoing' ? 'You' : 'Contact';
                        const voiceIndicator = msg.isVoiceMessage ? ' 🎵' : '';
                        content += `[${date}] ${sender}${voiceIndicator}: ${msg.body}\n`;
                    }
                    content += '\n';
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
            const data = await this.loadHistory();
            
            const totalMessages = Object.values(data.conversations || {})
                .reduce((total, conv) => total + (conv.messages?.length || 0), 0);
            
            return {
                exists: true,
                size: stats.size,
                contacts: Object.keys(data.conversations || {}).length,
                totalMessages,
                version: data.metadata?.version || 'unknown',
                lastModified: stats.mtime,
                path: this.historyFile
            };
        } catch (error) {
            logger.error('Failed to get storage info:', error);
            return null;
        }
    }

    // Legacy compatibility method
    async updateHistoryFromWhatsApp(phoneNumber, whatsappMessages) {
        return await this.syncFromWhatsApp(phoneNumber, whatsappMessages);
    }
}

module.exports = ConversationHistory;
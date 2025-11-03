require('dotenv').config();
const MessageGenerator = require('./src/messageGenerator');

// Test the message generator
async function testMessageGenerator() {
    try {
        console.log('🧪 Testing Godoy\'s message generator...\n');
        
        if (!process.env.OPENAI_API_KEY) {
            console.log('⚠️  OPENAI_API_KEY not found, using fallback messages');
        }
        
        const generator = new MessageGenerator(process.env.OPENAI_API_KEY || 'test');
        
        // Test with no conversation history (starting a conversation)
        console.log('📝 Generating message with no conversation history:');
        const result1 = await generator.generateMessage([]);
        console.log(`Message: "${result1.message}"`);
        console.log(`Model: ${result1.model}\n`);
        
        // Test with some conversation history
        const mockHistory = [
            {
                from: 'contact',
                body: 'Hola amor, ya terminé el trabajo por hoy',
                timestamp: Date.now() - 3600000 // 1 hour ago
            }
        ];
        
        console.log('📝 Generating response to: "Hola amor, ya terminé el trabajo por hoy"');
        const result2 = await generator.generateMessage(mockHistory);
        console.log(`Message: "${result2.message}"`);
        console.log(`Model: ${result2.model}\n`);
        
        // Test validation
        console.log('✅ Testing message validation:');
        const validation = generator.validateMessage(result2.message);
        console.log(`Valid: ${validation.valid}`);
        if (!validation.valid) {
            console.log(`Reason: ${validation.reason}`);
        }
        
        console.log('\n🎉 Message generator test completed!');
        
    } catch (error) {
        console.error('❌ Error testing message generator:', error.message);
    }
}

testMessageGenerator();
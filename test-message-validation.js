// Test script for the updated message generator
const MessageGenerator = require('./src/messageGenerator');

async function testMessageGenerator() {
    console.log('🧪 Testing Message Generator with updated requirements...\n');
    
    // Create instance (using a dummy API key for testing)
    const generator = new MessageGenerator('test-key');
    
    // Test validation function
    console.log('✅ Testing message validation:');
    
    // Valid messages
    const validMessages = [
        'Buenos días mi amor, cómo dormiste? :)',
        'Mi dulce crema de leche, que tal tu día?',
        'Hola mi chocolate de leche, espero estés bien jajaja',
        'Amor, no olvides tomar agüita sii'
    ];
    
    validMessages.forEach(msg => {
        const result = generator.validateMessage(msg);
        console.log(`"${msg}": ${result.valid ? '✅ VÁLIDO' : '❌ ' + result.reason}`);
    });
    
    console.log('\n❌ Testing invalid messages:');
    
    // Invalid messages
    const invalidMessages = [
        'Hola Dulce, cómo estás?', // Uses real name
        'Buenos días Elena', // Uses real name
        'Cómo están los niños?', // Mentions children
        'Los peques ya comieron?', // Mentions children
        'Hola bonita', // No pet name
        'Buenos días' // No pet name, too short
    ];
    
    invalidMessages.forEach(msg => {
        const result = generator.validateMessage(msg);
        console.log(`"${msg}": ${result.valid ? '✅ VÁLIDO' : '❌ ' + result.reason}`);
    });
    
    console.log('\n📝 Personal info loaded:');
    console.log('Pet names:', generator.personalInfo.petNames);
    console.log('Avoid topics:', generator.personalInfo.avoidTopics);
    
    console.log('\n✨ Test completed!');
}

// Run the test
testMessageGenerator().catch(console.error);
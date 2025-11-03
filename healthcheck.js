const http = require('http');

const options = {
    hostname: 'localhost',
    port: process.env.PORT || 3000,
    path: '/health',
    method: 'GET',
    timeout: 5000
};

const healthcheck = http.request(options, (res) => {
    if (res.statusCode === 200) {
        process.exit(0);
    } else {
        console.error(`Health check failed with status code: ${res.statusCode}`);
        process.exit(1);
    }
});

healthcheck.on('error', (err) => {
    console.error('Health check failed:', err.message);
    process.exit(1);
});

healthcheck.on('timeout', () => {
    console.error('Health check timed out');
    healthcheck.destroy();
    process.exit(1);
});

healthcheck.end();
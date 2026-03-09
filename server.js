require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const path = require('path');
const morgan = require('morgan');
const helmet = require('helmet');
const compression = require('compression');

const app = express();
const PORT = process.env.PORT || 3100;

const N8N_REQUEST_TIMEOUT = 30000;
const MAX_WORKFLOW_SIZE = 50 * 1024 * 1024;

app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false
}));
app.use(compression());
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(morgan('dev'));
app.use(express.static(path.join(__dirname, 'public')));

function isValidUrl(string) {
    try {
        const url = new URL(string);
        return url.protocol === 'http:' || url.protocol === 'https:';
    } catch (_) {
        return false;
    }
}

function getAxiosClient(req) {
    const n8nUrl = req.headers['x-n8n-url'];
    const n8nApiKey = req.headers['x-n8n-api-key'];

    if (!n8nUrl || !n8nApiKey) {
        const error = new Error('Missing x-n8n-url or x-n8n-api-key header');
        error.statusCode = 400;
        throw error;
    }

    if (!isValidUrl(n8nUrl)) {
        const error = new Error('Invalid n8n URL format');
        error.statusCode = 400;
        throw error;
    }

    const baseURL = n8nUrl.replace(/\/$/, '') + '/api/v1';

    return axios.create({
        baseURL,
        timeout: N8N_REQUEST_TIMEOUT,
        headers: {
            'X-N8N-API-KEY': n8nApiKey,
            'Accept': 'application/json',
            'Content-Type': 'application/json'
        },
        maxBodyLength: MAX_WORKFLOW_SIZE,
        maxContentLength: MAX_WORKFLOW_SIZE
    });
}

function asyncHandler(fn) {
    return (req, res, next) => {
        Promise.resolve(fn(req, res, next)).catch(next);
    };
}

app.get('/api/workflows', asyncHandler(async (req, res) => {
    const client = getAxiosClient(req);
    const params = { active: true, limit: 100, ...req.query };
    const response = await client.get('/workflows', { params });
    res.json(response.data);
}));

app.get('/api/workflows/:id', asyncHandler(async (req, res) => {
    const client = getAxiosClient(req);
    const { id } = req.params;
    
    if (!id || !/^[a-zA-Z0-9_-]+$/.test(id)) {
        return res.status(400).json({ error: 'Invalid workflow ID' });
    }
    
    const response = await client.get(`/workflows/${id}`);
    res.json(response.data);
}));

app.put('/api/workflows/:id', asyncHandler(async (req, res) => {
    const client = getAxiosClient(req);
    const { id } = req.params;
    let workflowData = req.body;

    if (!id || !/^[a-zA-Z0-9_-]+$/.test(id)) {
        return res.status(400).json({ error: 'Invalid workflow ID' });
    }

    if (!workflowData || typeof workflowData !== 'object') {
        return res.status(400).json({ error: 'Invalid workflow data' });
    }

    console.log('\n=== PUT workflow:', id, '===');
    console.log('Payload keys:', Object.keys(workflowData));
    console.log('Settings keys:', Object.keys(workflowData.settings || {}));
    console.log('Nodes count:', workflowData.nodes?.length);
    
    try {
        const response = await client.put(`/workflows/${id}`, workflowData);
        console.log('✓ SUCCESS');
        res.json(response.data);
    } catch (axiosErr) {
        console.log('✗ FAILED');
        const n8nError = axiosErr.response?.data;
        console.error('n8n error:', axiosErr.response?.status, n8nError?.message);
        
        const status = axiosErr.response?.status || 500;
        const errorMsg = n8nError?.message || axiosErr.message || 'Save failed';
        res.status(status).json({ error: errorMsg });
    }
}));

app.use((err, req, res, next) => {
    console.error('Error:', err.message);
    
    if (err.code === 'ECONNABORTED') {
        return res.status(504).json({ error: 'Request timeout - n8n server took too long to respond' });
    }
    
    if (err.code === 'ENOTFOUND' || err.code === 'ECONNREFUSED') {
        return res.status(503).json({ error: 'Cannot connect to n8n server - check URL' });
    }
    
    const status = err.statusCode || err.response?.status || 500;
    const msg = err.response?.data?.message || err.message || 'Internal server error';
    res.status(status).json({ error: msg });
});

const server = app.listen(PORT, () => {
    console.log(`n8n LLM Dashboard running at http://localhost:${PORT}`);
});

process.on('SIGTERM', () => {
    console.log('SIGTERM received, shutting down gracefully');
    server.close(() => {
        console.log('Server closed');
        process.exit(0);
    });
});

process.on('SIGINT', () => {
    console.log('SIGINT received, shutting down gracefully');
    server.close(() => {
        console.log('Server closed');
        process.exit(0);
    });
});

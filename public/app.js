// ============================================================
//  n8n LLM Agent Dashboard — app.js
// ============================================================

// DOM refs
const els = {
    btnSettings: document.getElementById('btn-settings'),
    btnCloseSettings: document.getElementById('btn-close-settings'),
    btnSaveSettings: document.getElementById('btn-save-settings'),
    btnRefresh: document.getElementById('btn-refresh'),
    modalSettings: document.getElementById('modal-settings'),
    inputN8nUrl: document.getElementById('input-n8n-url'),
    inputN8nApi: document.getElementById('input-n8n-api'),
    viewDashboard: document.getElementById('view-dashboard'),
    loadingState: document.getElementById('loading-state'),
    emptyState: document.getElementById('empty-state'),
    tableWrapper: document.querySelector('.table-wrapper'),
    tableBody: document.getElementById('agent-table-body'),
    workflowStats: document.getElementById('workflow-stats'),
    toast: document.getElementById('toast')
};

// ─── Safe Storage Helpers ─────────────────────────────────────
function safeGetItem(key) {
    try {
        return localStorage.getItem(key);
    } catch (e) {
        console.warn('localStorage not available:', e);
        return null;
    }
}

function safeSetItem(key, value) {
    try {
        localStorage.setItem(key, value);
        return true;
    } catch (e) {
        console.warn('localStorage not available:', e);
        return false;
    }
}

// ─── Debounce Helper ──────────────────────────────────────────
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// ─── Provider Config (Minimal - models loaded from JSON + localStorage) ────
const PROVIDER_BASE = {
    lmChatGoogleGemini: { label: 'Google Gemini', color: '#4285f4', paramKey: 'modelName', credType: 'googlePalmApi' },
    lmChatOpenAi: { 
        label: 'OpenAI', color: '#10a37f', paramKey: 'model', credType: 'openAiApi',
        credLabels: { 'lmstudio': { label: 'LMStudio', color: '#8b5cf6' }, 'local': { label: 'Local AI', color: '#8b5cf6' }, 'opencode': { label: 'OpenCode', color: '#06b6d4' }, 'openrouter': { label: 'OpenRouter (OAI)', color: '#ef4444' }, 'chatanywhere': { label: 'ChatAnyWhere', color: '#f59e0b' } }
    },
    lmChatAnthropic: { label: 'Anthropic', color: '#d97706', paramKey: 'model', credType: 'anthropicApi' },
    lmChatOllama: { label: 'Ollama', color: '#7c3aed', paramKey: 'model', credType: 'ollamaApi' },
    lmChatOpenRouter: { label: 'OpenRouter', color: '#ef4444', paramKey: 'model', credType: 'openRouterApi' },
    lmChatMistralCloud: { label: 'Mistral AI', color: '#f59e0b', paramKey: 'model', credType: 'mistralCloudApi' },
    lmChatOpenCode: { label: 'OpenCode', color: '#06b6d4', paramKey: 'model', credType: 'openCodeApi' }
};

let BASE_MODELS = {};
let PROVIDERS = {};

async function loadModels() {
    try {
        const res = await fetch('/models.json');
        BASE_MODELS = await res.json();
        
        PROVIDERS = {};
        for (const [key, config] of Object.entries(PROVIDER_BASE)) {
            PROVIDERS[key] = { ...config, models: BASE_MODELS[key]?.models || [] };
        }
        
        mergeCustomModels();
    } catch (e) {
        console.warn('Failed to load models.json, using fallback:', e);
        PROVIDERS = PROVIDER_BASE;
    }
}

function getCustomModels() {
    try {
        return JSON.parse(localStorage.getItem('custom_models') || '{}');
    } catch { return {}; }
}

function saveCustomModel(providerKey, modelName) {
    if (!modelName) return;
    const custom = getCustomModels();
    if (!custom[providerKey]) custom[providerKey] = [];
    if (!custom[providerKey].includes(modelName)) {
        custom[providerKey].push(modelName);
        localStorage.setItem('custom_models', JSON.stringify(custom));
    }
}

let workflowModelsCache = {};

function mergeCustomModels() {
    const custom = getCustomModels();
    for (const [providerKey, models] of Object.entries(custom)) {
        if (PROVIDERS[providerKey] && !PROVIDERS[providerKey].customModels) {
            PROVIDERS[providerKey].customModels = [];
        }
        if (PROVIDERS[providerKey]) {
            for (const model of models) {
                if (!PROVIDERS[providerKey].customModels.includes(model)) {
                    PROVIDERS[providerKey].customModels.push(model);
                }
            }
        }
    }
}

function addWorkflowModelsToProviders(groups) {
    workflowModelsCache = {};
    for (const wf of groups) {
        for (const agent of wf.agents) {
            for (const ln of agent.lmNodes) {
                if (ln.model && ln.providerKey) {
                    if (!workflowModelsCache[ln.providerKey]) {
                        workflowModelsCache[ln.providerKey] = new Set();
                    }
                    workflowModelsCache[ln.providerKey].add(ln.model);
                }
            }
        }
    }
}

function getProviderModels(providerKey) {
    const cfg = PROVIDERS[providerKey];
    if (!cfg) return [];
    
    const workflowModels = Array.from(workflowModelsCache[providerKey] || []);
    const customModels = cfg.customModels || [];
    const baseModels = cfg.models || [];
    
    const result = [];
    const seen = new Set();
    
    for (const m of [...workflowModels, ...customModels, ...baseModels]) {
        if (!seen.has(m)) {
            seen.add(m);
            result.push(m);
        }
    }
    
    return result;
}

function getProviderModels(providerKey) {
    return PROVIDERS[providerKey]?.models || [];
}

// ─── Helpers ────────────────────────────────────────────────

function extractModel(node, providerKey) {
    const cfg = PROVIDERS[providerKey];
    if (!cfg) return '';
    
    // For Gemini native nodes, check modelId first
    if (providerKey === 'lmChatGoogleGemini' && node.parameters?.modelId) {
        const modelId = node.parameters.modelId;
        if (typeof modelId === 'object' && modelId.__rl) {
            return modelId.value || modelId.cachedResultName || '';
        }
        if (typeof modelId === 'string') return modelId;
    }
    
    const raw = node.parameters?.[cfg.paramKey];
    if (!raw) return '';
    if (typeof raw === 'object' && raw.__rl) return raw.value || raw.cachedResultName || '';
    if (typeof raw === 'string') return raw;
    return String(raw);
}

function getProviderMeta(providerKey, credential) {
    const cfg = PROVIDERS[providerKey];
    if (!cfg) return { label: providerKey, color: '#888' };
    if (providerKey === 'lmChatOpenAi' && cfg.credLabels && credential?.name) {
        const credLowerName = credential.name.toLowerCase();
        for (const [keyword, meta] of Object.entries(cfg.credLabels)) {
            if (credLowerName.includes(keyword)) return meta;
        }
    }
    return { label: cfg.label, color: cfg.color };
}

function extractCredential(node, providerKey) {
    const cfg = PROVIDERS[providerKey];
    if (!cfg) return null;
    const cred = node.credentials?.[cfg.credType];
    return cred ? { id: cred.id, name: cred.name } : null;
}

function getHeaders() {
    return {
        'x-n8n-url': safeGetItem('n8n_url'),
        'x-n8n-api-key': safeGetItem('n8n_api'),
        'Content-Type': 'application/json'
    };
}

function showModal(show) {
    els.modalSettings.classList.toggle('active', show);
}

function showToast(msg, type = 'success') {
    const t = els.toast;
    t.className = `toast show ${type}`;
    t.querySelector('.toast-icon').className = type === 'success'
        ? 'fa-solid fa-check-circle toast-icon'
        : 'fa-solid fa-triangle-exclamation toast-icon';
    t.querySelector('.toast-msg').textContent = msg;
    setTimeout(() => { t.className = 'toast'; }, 4000);
}

function setViewState(s) {
    els.viewDashboard.classList.remove('view-hidden');
    els.tableWrapper.classList.add('view-hidden');
    els.loadingState.classList.add('view-hidden');
    els.emptyState.classList.add('view-hidden');
    if (s === 'loading') { els.btnRefresh.disabled = true; els.loadingState.classList.remove('view-hidden'); }
    else if (s === 'loaded') { els.btnRefresh.disabled = false; els.tableWrapper.classList.remove('view-hidden'); }
    else if (s === 'empty') { els.btnRefresh.disabled = false; els.emptyState.classList.remove('view-hidden'); }
}

// ─── Filter State ────────────────────────────────────────────
let activeFilter = null;
let searchQuery = '';
let workflowGroups = [];
let autoRefreshInterval = null;

function startAutoRefresh() {
    if (autoRefreshInterval) clearInterval(autoRefreshInterval);
    autoRefreshInterval = setInterval(loadWorkflows, 30000);
    const indicator = document.getElementById('auto-refresh-indicator');
    if (indicator) indicator.classList.remove('paused');
}

function stopAutoRefresh() {
    if (autoRefreshInterval) {
        clearInterval(autoRefreshInterval);
        autoRefreshInterval = null;
    }
    const indicator = document.getElementById('auto-refresh-indicator');
    if (indicator) indicator.classList.add('paused');
}

async function loadWorkflows() {
    setViewState('loading');
    
    try {
        const res = await fetch('/api/workflows', { headers: getHeaders() });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || `Failed to load (${res.status})`);
        
const workflows = data.data || data;
    processWorkflows(workflows);
    addWorkflowModelsToProviders(workflowGroups);
        
        if (!autoRefreshInterval) {
            startAutoRefresh();
        }
    } catch (err) {
        console.error('Load error:', err);
        showToast('Failed to load workflows: ' + err.message, 'error');
        setViewState('empty');
    }
}

function processWorkflows(workflows) {
    workflowGroups = [];
    
    workflows.forEach(wf => {
        const nodes = wf.nodes || [];
        const connections = wf.connections || {};
        
        // Find all AI Agent nodes and Basic LLM nodes
        const agentNodes = nodes.filter(n => 
            n.type === '@n8n/n8n-nodes-langchain.agent' ||
            n.type === 'n8n-nodes-base.agent'
        );
        
        // Find Basic LLM nodes (standalone LLM nodes without agent wrapper)
        const basicLLMTypes = [
            '@n8n/n8n-nodes-langchain.googleGemini',
            '@n8n/n8n-nodes-langchain.openAi',
            '@n8n/n8n-nodes-langchain.anthropic',
            '@n8n/n8n-nodes-langchain.ollama',
            '@n8n/n8n-nodes-langchain.mistral',
            '@n8n/n8n-nodes-langchain.chainLlm'
        ];
        
        const basicLLMNodes = nodes.filter(n => basicLLMTypes.includes(n.type));
        
        const allAgentNodes = [...agentNodes, ...basicLLMNodes];
        
        if (!allAgentNodes.length) return;
        
        const connectedAgents = getConnectedAgents(allAgentNodes, nodes, connections);
        
        if (!connectedAgents.length) return;
        
        const agents = [];
        
        connectedAgents.forEach(agent => {
            const isBasicLLM = basicLLMNodes.includes(agent);
            
            if (isBasicLLM) {
                const providerKey = extractProviderFromType(agent.type);
                
                if (agent.type.includes('chainLlm')) {
                    const lmNodes = getOrderedLMNodes(agent, nodes, connections);
                    if (lmNodes.length) {
                        agents.push({ agentNode: agent.name, lmNodes });
                    }
                    return;
                }
                
                const model = extractModel(agent, providerKey);
                const credential = extractCredential(agent, providerKey);
                
                if (model || credential) {
                    agents.push({
                        agentNode: agent.name,
                        lmNodes: [{
                            nodeName: agent.name,
                            providerKey,
                            model,
                            credential,
                            nodeRef: agent,
                            connectionOrder: 0,
                            isBasicLLM: true
                        }]
                    });
                }
            } else {
                const lmNodes = getOrderedLMNodes(agent, nodes, connections);
                if (lmNodes.length) {
                    agents.push({ agentNode: agent.name, lmNodes });
                }
            }
        });
        
        if (agents.length) {
            workflowGroups.push({ 
                workflowId: wf.id, 
                workflowName: wf.name, 
                fullWorkflowData: wf, 
                agents 
            });
        }
    });
    
    renderTable();
}

function filterTable(providerKey) {
    if (!providerKey || providerKey === 'null') providerKey = null;
    activeFilter = (activeFilter === providerKey) ? null : providerKey;
    renderTable();
}

const debouncedSearch = debounce((query) => {
    searchQuery = query.toLowerCase().trim();
    renderTable();
}, 300);

function saveCredentials() {
    const url = document.getElementById('input-n8n-url').value.trim();
    const apiKey = document.getElementById('input-n8n-api').value.trim();
    
    if (!url || !apiKey) {
        showToast('Please fill in all fields', 'error');
        return;
    }
    
    localStorage.setItem('n8n_url', url);
    localStorage.setItem('n8n_api', apiKey);
    
    showModal(false);
    showToast('Settings saved!', 'success');
    loadModels().then(() => loadWorkflows());
}

// ─── Init ───────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    els.btnSettings.addEventListener('click', () => showModal(true));
    els.btnCloseSettings.addEventListener('click', () => showModal(false));
    els.btnSaveSettings.addEventListener('click', saveCredentials);
    els.btnRefresh.addEventListener('click', loadWorkflows);
    
    const autoRefreshIndicator = document.getElementById('auto-refresh-indicator');
    if (autoRefreshIndicator) {
        autoRefreshIndicator.addEventListener('click', () => {
            if (autoRefreshInterval) {
                stopAutoRefresh();
                showToast('Auto-refresh paused', 'error');
            } else {
                startAutoRefresh();
                showToast('Auto-refresh enabled (30s)', 'success');
            }
        });
    }

    loadModels().then(() => loadWorkflows());
});

function getAgentExecutionOrder(agents, allNodes, connections) {
    const nodeMap = new Map();
    allNodes.forEach(n => nodeMap.set(n.name, n));
    
    const depthMap = new Map();
    
    function getDepth(nodeName, visited = new Set()) {
        if (depthMap.has(nodeName)) return depthMap.get(nodeName);
        if (visited.has(nodeName)) return 0;
        visited.add(nodeName);
        
        let maxIncomingDepth = 0;
        
        for (const [srcName, outputs] of Object.entries(connections)) {
            for (const outputName in outputs) {
                const targets = outputs[outputName];
                if (!Array.isArray(targets)) continue;
                
                for (const group of targets) {
                    if (!Array.isArray(group)) continue;
                    for (const target of group) {
                        if (target?.node === nodeName) {
                            const srcDepth = getDepth(srcName, new Set(visited));
                            maxIncomingDepth = Math.max(maxIncomingDepth, srcDepth + 1);
                        }
                    }
                }
            }
        }
        
        depthMap.set(nodeName, maxIncomingDepth);
        return maxIncomingDepth;
    }
    
    agents.forEach(agent => getDepth(agent.name));
    
    return agents.slice().sort((a, b) => {
        const depthA = depthMap.get(a.name) || 0;
        const depthB = depthMap.get(b.name) || 0;
        return depthA - depthB;
    });
}

function extractProviderFromType(nodeType) {
    // Map Basic LLM node types to provider keys
    const providerMap = {
        '@n8n/n8n-nodes-langchain.googleGemini': 'lmChatGoogleGemini',
        '@n8n/n8n-nodes-langchain.openAi': 'lmChatOpenAi',
        '@n8n/n8n-nodes-langchain.anthropic': 'lmChatAnthropic',
        '@n8n/n8n-nodes-langchain.ollama': 'lmChatOllama',
        '@n8n/n8n-nodes-langchain.mistral': 'lmChatMistralCloud',
        '@n8n/n8n-nodes-langchain.chainLlm': 'lmChatOpenAi' // Default to OpenAI for chain
    };
    
    return providerMap[nodeType] || 'lmChatOpenAi';
}

function getOrderedLMNodes(agent, allNodes, connections) {
    const lmNodes = [];
    const lmConnections = [];
    
    for (const [srcName, outputs] of Object.entries(connections)) {
        for (const [outputName, groups] of Object.entries(outputs)) {
            if (!Array.isArray(groups)) continue;
            
            groups.forEach((group, groupIndex) => {
                if (!Array.isArray(group)) return;
                
                group.forEach((target, targetIndex) => {
                    if (target?.node !== agent.name) return;
                    
                    const srcNode = allNodes.find(n => n.name === srcName);
                    
                    // Check if this is an LLM node (multiple possible types)
                    const isLMNode = 
                        srcNode?.type.startsWith('@n8n/n8n-nodes-langchain.lm') ||
                        srcNode?.type.startsWith('n8n-nodes-opencode-ai.lm') ||
                        srcNode?.type.includes('lmChat') ||
                        srcNode?.type.includes('chatModel') ||
                        srcNode?.type === '@n8n/n8n-nodes-langchain.lmChatOpenAi' ||
                        srcNode?.type === '@n8n/n8n-nodes-langchain.lmChatAnthropic' ||
                        srcNode?.type === '@n8n/n8n-nodes-langchain.lmChatGoogleGemini' ||
                        srcNode?.type === '@n8n/n8n-nodes-langchain.lmChatOllama' ||
                        srcNode?.type === '@n8n/n8n-nodes-langchain.lmChatMistral' ||
                        srcNode?.type === 'n8n-nodes-base.lmChat';
                    
                    if (!isLMNode) return;

                    let providerKey = '';
                    if (srcNode.type.startsWith('@n8n/n8n-nodes-langchain.')) {
                        providerKey = srcNode.type.replace('@n8n/n8n-nodes-langchain.', '');
                        // Normalize: lmOllama -> lmChatOllama, lmOpenAi -> lmChatOpenAi, etc.
                        if (providerKey.startsWith('lm') && !providerKey.startsWith('lmChat')) {
                            providerKey = 'lmChat' + providerKey.charAt(2).toUpperCase() + providerKey.slice(3);
                        }
                    } else if (srcNode.type.startsWith('n8n-nodes-opencode-ai.')) {
                        providerKey = srcNode.type.replace('n8n-nodes-opencode-ai.', '');
                    }

                    const model = extractModel(srcNode, providerKey);
                    const credential = extractCredential(srcNode, providerKey);
                    
                    const xPos = srcNode.position ? srcNode.position[0] : 0;
                    
                    lmConnections.push({
                        nodeName: srcName,
                        providerKey,
                        model,
                        credential,
                        nodeRef: srcNode,
                        xPos
                    });
                });
            });
        }
    }
    
    // Sort by X position (leftmost = Primary, rightmost = Fallback)
    lmConnections.sort((a, b) => a.xPos - b.xPos);
    
    lmConnections.forEach(conn => {
        if (!lmNodes.find(x => x.nodeName === conn.nodeName)) {
            lmNodes.push({
                nodeName: conn.nodeName,
                providerKey: conn.providerKey,
                model: conn.model,
                credential: conn.credential,
                nodeRef: conn.nodeRef,
                connectionOrder: lmNodes.length
            });
        }
    });
    
    return lmNodes;
}

function getConnectedAgents(agentNodes, allNodes, connections) {
    const triggerTypes = [
        'n8n-nodes-base.manualTrigger',
        'n8n-nodes-base.scheduleTrigger',
        'n8n-nodes-base.cron',
        'n8n-nodes-base.webhook',
        'n8n-nodes-base.formTrigger',
        'n8n-nodes-base.chatTrigger',
        '@n8n/n8n-nodes-langchain.chatTrigger',
        'n8n-nodes-base.start',
        'n8n-nodes-base.pollingTrigger',
        'n8n-nodes-base.readBinaryFile',
        'n8n-nodes-base.executeWorkflowTrigger'
    ];
    
    const reachableFromTrigger = new Set();
    
    function dfsFromNode(nodeName, visited) {
        if (visited.has(nodeName)) return;
        visited.add(nodeName);
        reachableFromTrigger.add(nodeName);
        
        const outgoing = connections[nodeName];
        if (!outgoing) return;
        
        for (const outputName in outgoing) {
            const targets = outgoing[outputName];
            if (!Array.isArray(targets)) continue;
            
            for (const group of targets) {
                if (!Array.isArray(group)) continue;
                for (const target of group) {
                    if (target?.node) {
                        dfsFromNode(target.node, visited);
                    }
                }
            }
        }
    }
    
    // Find all trigger nodes and start traversal
    const foundTriggers = [];
    allNodes.forEach(node => {
        const isTrigger = 
            triggerTypes.some(t => node.type === t) ||
            (node.type.toLowerCase().includes('trigger') && !node.type.includes('lmChat')) ||
            node.type === 'n8n-nodes-base.start';
        
        if (isTrigger) {
            dfsFromNode(node.name, new Set());
        }
    });
    
    return agentNodes.filter(agent => reachableFromTrigger.has(agent.name));
}

function buildReverseConnections(connections) {
    const reverse = {};
    
    for (const [srcName, outputs] of Object.entries(connections)) {
        for (const outputName in outputs) {
            const targets = outputs[outputName];
            if (!Array.isArray(targets)) continue;
            
            for (const group of targets) {
                if (!Array.isArray(group)) continue;
                for (const target of group) {
                    if (target?.node) {
                        if (!reverse[target.node]) {
                            reverse[target.node] = [];
                        }
                        reverse[target.node].push(srcName);
                    }
                }
            }
        }
    }
    
    return reverse;
}

function buildReverseConnections(connections) {
    const reverse = {};
    
    for (const [srcName, outputs] of Object.entries(connections)) {
        for (const outputName in outputs) {
            const targets = outputs[outputName];
            if (!Array.isArray(targets)) continue;
            
            for (const group of targets) {
                if (!Array.isArray(group)) continue;
                for (const target of group) {
                    if (target?.node) {
                        if (!reverse[target.node]) {
                            reverse[target.node] = [];
                        }
                        reverse[target.node].push(srcName);
                    }
                }
            }
        }
    }
    
    return reverse;
}

// ─── Render ──────────────────────────────────────────────────
function renderTable() {
    if (!workflowGroups.length) {
        setViewState('empty');
        els.workflowStats.textContent = '0 workflows with AI Agents found';
        return;
    }

    const totalAgents = workflowGroups.reduce((s, g) => s + g.agents.length, 0);
    els.workflowStats.textContent = `${totalAgents} Agents across ${workflowGroups.length} Workflows`;

    const presentProviders = new Set();
    workflowGroups.forEach(wf => wf.agents.forEach(a => a.lmNodes.forEach(ln => presentProviders.add(ln.providerKey))));

    let filterHtml = '<div class="filter-bar"><span class="filter-label">Filter:</span>';
    filterHtml += `<input type="text" id="search-input" class="search-input" placeholder="Search workflows..." value="${escapeHtml(searchQuery)}">`;
    filterHtml += `<button class="filter-btn ${!activeFilter ? 'active' : ''}" data-filter="" onclick="filterTable(null)">All</button>`;
    presentProviders.forEach(pk => {
        const sampleLn = workflowGroups.flatMap(wf => wf.agents.flatMap(a => a.lmNodes)).find(ln => ln.providerKey === pk);
        const meta = getProviderMeta(pk, sampleLn?.credential);
        const cfg = PROVIDERS[pk] || {};
        const isActive = activeFilter === pk ? 'active' : '';
        filterHtml += `<button class="filter-btn ${isActive}" style="--pcolor:${cfg.color || '#888'}" data-filter="${pk}" onclick="filterTable('${pk}')">${meta.label}</button>`;
    });
    
    const hasChanges = document.querySelectorAll('.btn-save-row.active').length > 0;
    filterHtml += `<button class="btn-save-all ${hasChanges ? 'active' : ''}" id="btn-save-all" onclick="saveAllChanges()" ${hasChanges ? '' : 'disabled'}><i class="fa-solid fa-cloud-arrow-up"></i> Save All</button>`;
    filterHtml += '</div>';

    const existingBar = document.querySelector('.filter-bar');
    if (existingBar) existingBar.remove();
    els.tableWrapper.insertAdjacentHTML('beforebegin', filterHtml);

    const searchInput = document.getElementById('search-input');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => debouncedSearch(e.target.value));
    }

    let html = '';
    workflowGroups.forEach((wf, wfIdx) => {
        if (searchQuery && !wf.workflowName.toLowerCase().includes(searchQuery)) {
            return;
        }

        const filteredAgents = wf.agents.map((agent, originalAgentIdx) => {
            const matchedLMs = activeFilter
                ? agent.lmNodes.map((ln, originalLnIdx) => ({ ln, originalLnIdx })).filter(x => x.ln.providerKey === activeFilter)
                : agent.lmNodes.map((ln, originalLnIdx) => ({ ln, originalLnIdx }));

            return {
                originalAgentIdx,
                agentNode: agent.agentNode,
                lmNodes: matchedLMs
            };
        }).filter(agent => agent.lmNodes.length > 0);

        if (filteredAgents.length === 0) return;

        const totalRows = filteredAgents.reduce((s, a) => s + a.lmNodes.length, 0);
        let firstRowOfWf = true;

        filteredAgents.forEach((agent) => {
            const totalAgentRows = agent.lmNodes.length;
            let firstRowOfAgent = true;

            agent.lmNodes.forEach((x) => {
                const ln = x.ln;
                const originalLnIdx = x.originalLnIdx;
const id = `${wfIdx}-${agent.originalAgentIdx}-${originalLnIdx}`;
    const cfg = PROVIDERS[ln.providerKey] || { label: ln.providerKey, color: '#888', models: [] };
    const meta = getProviderMeta(ln.providerKey, ln.credential);

    const knownModels = [...getProviderModels(ln.providerKey)];
                const currentModel = ln.model;
                const isCustomModel = currentModel && !currentModel.startsWith('=') && !knownModels.includes(currentModel);
                
                if (isCustomModel) {
                    knownModels.unshift(currentModel);
                }

                const modelOpts = knownModels.length
                    ? knownModels.map(m => `<option value="${m}" ${m === currentModel ? 'selected' : ''}>${m}</option>`).join('')
                    : `<option value="${currentModel || ''}">${currentModel || '(default)'}</option>`;

                const customValue = isCustomModel ? currentModel : '';
                
                const connectionOrder = ln.connectionOrder || 0;
                const orderLabel = connectionOrder === 0 ? 'Primary' : connectionOrder === 1 ? 'Fallback' : `LLM ${connectionOrder + 1}`;

                const credHtml = ln.credential
                    ? `<div class="cred-badge" title="${ln.credential.name}"><i class="fa-solid fa-key"></i> ${ln.credential.name}</div>`
                    : '<div class="cred-badge cred-unknown"><i class="fa-solid fa-circle-question"></i> Unknown</div>';

                html += `<tr data-provider="${ln.providerKey}" data-wfidx="${wfIdx}">`;

                if (firstRowOfWf) {
                    html += `<td rowspan="${totalRows}" class="wf-name-cell">
                        <div class="wf-name"><i class="fa-solid fa-diagram-project wf-icon"></i>
                        <span>${escapeHtml(wf.workflowName)}</span></div></td>`;
                    firstRowOfWf = false;
                }

                if (firstRowOfAgent) {
                    html += `<td rowspan="${totalAgentRows}"><span class="agent-node-name">${escapeHtml(agent.agentNode)}</span></td>`;
                    firstRowOfAgent = false;
                }

                html += `
                    <td>
                        <div class="lm-order-badge">${orderLabel}</div>
                        <div class="provider-badge" style="--pcolor:${meta.color}">${meta.label}</div>
                        ${credHtml}
                    </td>
                    <td>
                        <div class="model-input-wrapper">
                            <select class="modern-select model-select" id="sel-${id}"
                                data-wfidx="${wfIdx}" data-agentidx="${agent.originalAgentIdx}" data-lnidx="${originalLnIdx}"
                                data-original="${escapeHtml(currentModel)}">
                                <option value="">— Select model —</option>
                                ${modelOpts}
                                <option value="__custom__">✏️ Custom model...</option>
                            </select>
                            <input type="text" class="custom-model-input view-hidden" id="custom-${id}"
                                placeholder="Enter model name..."
                                value="${escapeHtml(customValue)}"
                                data-select-id="sel-${id}">
                        </div>
                    </td>
                    <td>
                        <button class="btn-save-row" id="btn-${id}"
                            data-wfidx="${wfIdx}" data-agentidx="${agent.originalAgentIdx}" data-lnidx="${originalLnIdx}">
                            <i class="fa-solid fa-cloud-arrow-up"></i> Save
                        </button>
                    </td>
                </tr>`;
            });
        });
    });

    els.tableBody.innerHTML = html;
    
    renderMobileCards(workflowGroups);
    
    setViewState('loaded');

    document.querySelectorAll('.model-select').forEach(s => s.addEventListener('change', onModelChange));
    document.querySelectorAll('.custom-model-input').forEach(i => i.addEventListener('input', onCustomModelInput));
    document.querySelectorAll('.btn-save-row').forEach(b => b.addEventListener('click', onSave));
}

function renderMobileCards(groups) {
    let cardHtml = '<div class="agent-cards">';
    
    groups.forEach((wf, wfIdx) => {
        if (searchQuery && !wf.workflowName.toLowerCase().includes(searchQuery)) {
            return;
        }

        const filteredAgents = wf.agents.map((agent, originalAgentIdx) => {
            const matchedLMs = activeFilter
                ? agent.lmNodes.map((ln, originalLnIdx) => ({ ln, originalLnIdx })).filter(x => x.ln.providerKey === activeFilter)
                : agent.lmNodes.map((ln, originalLnIdx) => ({ ln, originalLnIdx }));

            return {
                originalAgentIdx,
                agentNode: agent.agentNode,
                lmNodes: matchedLMs
            };
        }).filter(agent => agent.lmNodes.length > 0);

        if (filteredAgents.length === 0) return;

        // Create ONE card per workflow with all agents grouped inside
        cardHtml += `
            <div class="workflow-card" data-wfidx="${wfIdx}">
                <div class="workflow-card-header">
                    <i class="fa-solid fa-diagram-project wf-icon"></i>
                    <span class="workflow-card-name">${escapeHtml(wf.workflowName)}</span>
                </div>
                <div class="workflow-card-body">`;

        // Add each agent within this workflow
        filteredAgents.forEach((agent) => {
            cardHtml += `
                    <div class="agent-section">
                        <div class="agent-section-header">
                            <span class="agent-label">Agent:</span>
                            <span class="agent-name">${escapeHtml(agent.agentNode)}</span>
                        </div>
                        <div class="agent-lm-list">`;

            // Add each LM node for this agent
            agent.lmNodes.forEach((x) => {
                const ln = x.ln;
                const originalLnIdx = x.originalLnIdx;
const id = `mobile-${wfIdx}-${agent.originalAgentIdx}-${originalLnIdx}`;
    const cfg = PROVIDERS[ln.providerKey] || { label: ln.providerKey, color: '#888', models: [] };
    const meta = getProviderMeta(ln.providerKey, ln.credential);

    const knownModels = [...getProviderModels(ln.providerKey)];
                const currentModel = ln.model;
                const isCustomModel = currentModel && !currentModel.startsWith('=') && !knownModels.includes(currentModel);
                
                if (isCustomModel) {
                    knownModels.unshift(currentModel);
                }

                const modelOpts = knownModels.length
                    ? knownModels.map(m => `<option value="${m}" ${m === currentModel ? 'selected' : ''}>${m}</option>`).join('')
                    : `<option value="${currentModel || ''}">${currentModel || '(default)'}</option>`;

                const customValue = isCustomModel ? currentModel : '';
                
                const connectionOrder = ln.connectionOrder || 0;
                const orderLabel = connectionOrder === 0 ? 'Primary' : connectionOrder === 1 ? 'Fallback' : `LLM ${connectionOrder + 1}`;

                const credHtml = ln.credential
                    ? `<div class="cred-badge" title="${ln.credential.name}"><i class="fa-solid fa-key"></i> ${ln.credential.name}</div>`
                    : '<div class="cred-badge cred-unknown"><i class="fa-solid fa-circle-question"></i> Unknown</div>';

                cardHtml += `
                            <div class="lm-item">
                                <div class="lm-header">
                                    <div class="lm-order-badge">${orderLabel}</div>
                                    <div class="provider-badge" style="--pcolor:${meta.color}">${meta.label}</div>
                                    ${credHtml}
                                </div>
                                <div class="lm-model-section">
                                    <div class="model-input-wrapper">
                                        <select class="modern-select model-select" id="sel-${id}"
                                            data-wfidx="${wfIdx}" data-agentidx="${agent.originalAgentIdx}" data-lnidx="${originalLnIdx}"
                                            data-original="${escapeHtml(currentModel)}">
                                            <option value="">— Select model —</option>
                                            ${modelOpts}
                                            <option value="__custom__">✏️ Custom model...</option>
                                        </select>
                                        <input type="text" class="custom-model-input view-hidden" id="custom-${id}"
                                            placeholder="Enter model name..."
                                            value="${escapeHtml(customValue)}"
                                            data-select-id="sel-${id}">
                                    </div>
                                </div>
                                <div class="lm-actions">
                                    <button class="btn-save-row" id="btn-${id}"
                                        data-wfidx="${wfIdx}" data-agentidx="${agent.originalAgentIdx}" data-lnidx="${originalLnIdx}">
                                        <i class="fa-solid fa-cloud-arrow-up"></i> Save
                                    </button>
                                </div>
                            </div>`;
            });

            cardHtml += `
                        </div>
                    </div>`;
        });

        cardHtml += `
                </div>
            </div>`;
    });
    
    cardHtml += '</div>';
    
    const existingCards = document.querySelector('.agent-cards');
    if (existingCards) {
        existingCards.remove();
    }
    
    els.tableWrapper.insertAdjacentHTML('afterend', cardHtml);
}

function escapeHtml(str) {
    return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function onModelChange(e) {
    const s = e.target;
    const id = s.id.replace('sel-', '');
    const customInput = document.getElementById(`custom-${id}`);
    const btn = document.getElementById(`btn-${id}`);
    
    if (s.value === '__custom__') {
        customInput.classList.remove('view-hidden');
        customInput.focus();
        s.classList.add('view-hidden');
        return;
    }
    
    customInput.classList.add('view-hidden');
    s.classList.remove('view-hidden');
    
    const hasChange = s.value !== s.dataset.original;
    btn.classList.toggle('active', hasChange);
    updateSaveAllButton();
}

function onCustomModelInput(e) {
    const input = e.target;
    const selectId = input.dataset.selectId;
    const select = document.getElementById(selectId);
    const id = selectId.replace('sel-', '');
    const btn = document.getElementById(`btn-${id}`);
    
    const hasChange = input.value !== select.dataset.original;
    btn.classList.toggle('active', hasChange);
    updateSaveAllButton();
}

function getModelValue(selectId) {
    const select = document.getElementById(selectId);
    if (!select) return '';
    
    if (select.value === '__custom__' || select.classList.contains('view-hidden')) {
        const id = selectId.replace('sel-', '');
        const customInput = document.getElementById(`custom-${id}`);
        return customInput ? customInput.value.trim() : '';
    }
    
    return select.value;
}

function updateSaveAllButton() {
    const saveAllBtn = document.getElementById('btn-save-all');
    if (saveAllBtn) {
        const hasChanges = document.querySelectorAll('.btn-save-row.active').length > 0;
        saveAllBtn.classList.toggle('active', hasChanges);
        saveAllBtn.disabled = !hasChanges;
    }
}

function cleanWorkflowPayload(fullData) {
    return {
        name: fullData.name,
        nodes: fullData.nodes,
        connections: fullData.connections,
        settings: {}
    };
}

async function onSave(e) {
    const btn = e.currentTarget;
    const { wfidx, agentidx, lnidx } = btn.dataset;
    
    const btnId = btn.id;
    const isMobile = btnId.includes('mobile-');
    const idPrefix = isMobile ? 'mobile-' : '';
    const id = `${idPrefix}${wfidx}-${agentidx}-${lnidx}`;
    
    const wf = workflowGroups[wfidx];
    const ln = wf.agents[agentidx].lmNodes[lnidx];
    const select = document.getElementById(`sel-${id}`);
    const newModel = getModelValue(`sel-${id}`);
    
    if (!newModel) {
        showToast('Please select or enter a model name', 'error');
        return;
    }
    
    const cfg = PROVIDERS[ln.providerKey];
    if (!cfg) {
        showToast('Unknown provider type: ' + ln.providerKey, 'error');
        return;
    }

    const fullData = JSON.parse(JSON.stringify(wf.fullWorkflowData));
    const nodeToUpdate = fullData.nodes.find(n => n.name === ln.nodeName);
    
    if (!nodeToUpdate) { 
        showToast('Node not found in workflow', 'error'); 
        return; 
    }
    
    if (!nodeToUpdate.parameters) {
        nodeToUpdate.parameters = {};
    }

    const isGeminiNative = ln.providerKey === 'lmChatGoogleGemini' && 
                           nodeToUpdate.type === '@n8n/n8n-nodes-langchain.googleGemini' &&
                           nodeToUpdate.parameters?.modelId;
    
    if (isGeminiNative) {
        const modelId = nodeToUpdate.parameters.modelId;
        if (typeof modelId === 'object' && modelId.__rl) {
            nodeToUpdate.parameters.modelId = { 
                __rl: true, 
                value: newModel, 
                cachedResultName: newModel,
                mode: modelId.mode || 'list'
            };
        } else {
            nodeToUpdate.parameters.modelId = newModel;
        }
    } else {
        const raw = nodeToUpdate.parameters[cfg.paramKey];
        
        if (raw && typeof raw === 'object' && raw.__rl) {
            nodeToUpdate.parameters[cfg.paramKey] = { 
                __rl: true, 
                value: newModel,  
                cachedResultName: newModel,
                mode: raw.mode || 'list'
            };
        } else {
            nodeToUpdate.parameters[cfg.paramKey] = newModel;
        }
    }

    const wfData = cleanWorkflowPayload(fullData);

    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving...';
    btn.classList.remove('active');

    try {
        const res = await fetch(`/api/workflows/${wf.workflowId}`, {
            method: 'PUT',
            headers: getHeaders(),
            body: JSON.stringify(wfData)
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || `Save failed (${res.status})`);

        ln.model = newModel;
        wf.fullWorkflowData = data;
        select.dataset.original = newModel;
        saveCustomModel(ln.providerKey, newModel);

        showToast('Saved to n8n!', 'success');
        btn.innerHTML = '<i class="fa-solid fa-check"></i> Saved!';
        updateSaveAllButton();
        setTimeout(() => { btn.innerHTML = '<i class="fa-solid fa-cloud-arrow-up"></i> Save'; }, 2500);
    } catch (err) {
        showToast('Save failed: ' + err.message, 'error');
        btn.innerHTML = '<i class="fa-solid fa-cloud-arrow-up"></i> Save';
        btn.classList.add('active');
        updateSaveAllButton();
    }
}

async function saveAllChanges() {
    const changedBtns = Array.from(document.querySelectorAll('.btn-save-row.active'));
    if (changedBtns.length === 0) return;

    const saveAllBtn = document.getElementById('btn-save-all');
    saveAllBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving All...';
    saveAllBtn.disabled = true;

    let successCount = 0;
    let failCount = 0;

    for (const btn of changedBtns) {
        try {
            await onSave({ currentTarget: btn });
            successCount++;
        } catch (e) {
            failCount++;
        }
    }

    saveAllBtn.innerHTML = '<i class="fa-solid fa-cloud-arrow-up"></i> Save All';
    updateSaveAllButton();

    if (failCount === 0) {
        showToast(`All ${successCount} changes saved!`, 'success');
    } else {
        showToast(`${successCount} saved, ${failCount} failed`, 'error');
    }
}

window.filterTable = filterTable;
window.saveAllChanges = saveAllChanges;

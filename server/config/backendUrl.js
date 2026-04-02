const getBackendUrl = () => {
    // Get config values - this will load the appropriate .env file
    const BACKEND_BASE_URL = process.env.BACKEND_BASE_URL;
    const API_PATH = process.env.API_PATH;
    return normalizeBackendUrl(`${BACKEND_BASE_URL}${API_PATH}`);
};

const normalizeBackendUrl = (url) => {
    if (!url) {
        return url;
    }
    return url.replace(/\/+$/, '');
};

const ensureHttpProtocol = (url) => {
    if (!url) {
        return url;
    }
    if (url.startsWith('http://') || url.startsWith('https://')) {
        return url;
    }
    return `https://${url}`;
};

// ✅ NEW: Extract domain+port from URL (strips path components like /api)
const extractDomainFromUrl = (url) => {
    if (!url) {
        return url;
    }
    const ensured = ensureHttpProtocol(url);
    try {
        const urlObj = new URL(ensured);
        return `${urlObj.protocol}//${urlObj.host}`;
    } catch (e) {
        console.error('Failed to parse URL:', ensured, e.message);
        return ensured;
    }
};

// ✅ FIXED: Accept optional appUrl parameter for WebSocket URL construction
const buildBackendUrl = (path = '', appUrl = null) => {
    const baseUrl = appUrl ? normalizeBackendUrl(appUrl) : getBackendUrl();

    if (!baseUrl) {
        return baseUrl;
    }

    if (!path) {
        return baseUrl;
    }

    const normalizedPath = path.startsWith('/') ? path : `/${path}`;
    return `${baseUrl}${normalizedPath}`;
};

// ✅ FIXED: Accept optional appUrl parameter for WebSocket URL construction
// IMPORTANT: For WebSocket URLs, we extract just the domain+port to avoid path duplication
const buildBackendWsUrl = (path = '', appUrl = null) => {
    let baseUrl;
    if (appUrl) {
        // Extract domain from appUrl (removes /api path if present)
        baseUrl = extractDomainFromUrl(appUrl);
    } else {
        // Use domain-only version of backend URL
        baseUrl = extractDomainFromUrl(getBackendUrl());
    }

    if (!baseUrl) {
        return baseUrl;
    }

    // Convert http(s) to ws(s)
    const wsUrl = baseUrl.replace(/^https:\/\//, 'wss://').replace(/^http:\/\//, 'ws://');
    
    if (!path) {
        return wsUrl;
    }
    const normalizedPath = path.startsWith('/') ? path : `/${path}`;
    return `${wsUrl}${normalizedPath}`;
};

module.exports = {
    getBackendUrl,
    normalizeBackendUrl,
    ensureHttpProtocol,
    extractDomainFromUrl,
    buildBackendUrl,
    buildBackendWsUrl
};

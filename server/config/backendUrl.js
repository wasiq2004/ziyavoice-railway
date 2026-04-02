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
const buildBackendWsUrl = (path = '', appUrl = null) => {
    const baseUrl = appUrl ? normalizeBackendUrl(appUrl) : getBackendUrl();
    const httpUrl = ensureHttpProtocol(baseUrl);

    if (!httpUrl) {
        return httpUrl;
    }
    const wsUrl = httpUrl.replace(/^https:\/\//, 'wss://').replace(/^http:\/\//, 'ws://');
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
    buildBackendUrl,
    buildBackendWsUrl
};

import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './index.css';
import { resolveUrl } from './api.js';

// Автоматически направляем все относительные вызовы /api/ и /uploads/
// на базовый префикс (например, /tgbot/api/ и /tgbot/uploads/)
const originalFetch = window.fetch;
window.fetch = function (resource, config) {
    if (typeof resource === 'string') {
        resource = resolveUrl(resource);
    } else if (resource && typeof resource.url === 'string') {
        const newUrl = resolveUrl(resource.url);
        if (newUrl !== resource.url) {
            resource = new Request(newUrl, resource);
        }
    }
    return originalFetch.call(this, resource, config);
};

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

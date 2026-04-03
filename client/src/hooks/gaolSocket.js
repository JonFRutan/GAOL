//WebSocket
//for use w/ Go backend
//queues messages sent before the connection is open, drains on connect.
class GaolSocket {
  constructor(url) {
    this.url = url;
    this.ws = null;
    this.listeners = {};
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 10;
    this.reconnectDelay = 1000;
    this.connected = false;
    this._queue = []; //messages queued before connection opens
    this.connect();
  }

  connect() {
    try {
      this.ws = new WebSocket(this.url);
    } catch (e) {
      console.error('[WS] Failed to create WebSocket:', e);
      this._scheduleReconnect();
      return;
    }

    this.ws.onopen = () => {
      console.log('[WS] Connected to', this.url);
      this.connected = true;
      this.reconnectAttempts = 0;
      //drain queue of everything buffered before the connection
      while (this._queue.length > 0) {
        const msg = this._queue.shift();
        this.ws.send(msg);
      }

      this._fire('connect', {});
    };

    this.ws.onclose = (event) => {
      console.log('[WS] Disconnected:', event.code, event.reason);
      this.connected = false;
      this._fire('disconnect', { code: event.code, reason: event.reason });
      this._scheduleReconnect();
    };

    this.ws.onerror = (error) => console.error('[WS] Error:', error);

    this.ws.onmessage = (event) => {
      try {
        const envelope = JSON.parse(event.data);
        if (envelope.event && envelope.data !== undefined) {
          const data = typeof envelope.data === 'string'
            ? JSON.parse(envelope.data)
            : envelope.data;
          this._fire(envelope.event, data);
        }
      } catch (e) {
        console.error('[WS] Parse error:', e);
      }
    };
  }

  _scheduleReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('[WS] Max reconnect attempts reached.');
      return;
    }
    this.reconnectAttempts++;
    const delay = this.reconnectDelay * Math.min(this.reconnectAttempts, 5);
    console.log(`[WS] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})...`);
    setTimeout(() => this.connect(), delay);
  }

  on(event, callback) {
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event].push(callback);
  }

  off(event, callback) {
    if (!this.listeners[event]) return;
    if (callback) {
      this.listeners[event] = this.listeners[event].filter(cb => cb !== callback);
    } else {
      delete this.listeners[event];
    }
  }

  //emit an event. This is queued if not connected yet
  emit(event, data = {}) {
    const msg = JSON.stringify({ event, data });
    if (this.connected && this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(msg);
    } else {
      //add to queue
      this._queue.push(msg);
    }
  }

  _fire(event, data) {
    (this.listeners[event] || []).forEach(cb => {
      try { cb(data); } catch (e) { console.error(`[WS] Handler error '${event}':`, e); }
    });
  }

  disconnect() {
    this.maxReconnectAttempts = 0;
    this._queue = [];
    if (this.ws) this.ws.close();
  }
}

//converts HTTP urls to WebSocket urls appending /ws path
export function createSocket(url) {
  if (url) {
    url = url.replace(/^http/, 'ws');
    if (!url.endsWith('/ws')) {
      url = url.replace(/\/$/, '') + '/ws';
    }
  } else {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    url = `${protocol}//${window.location.host}/ws`;
  }
  return new GaolSocket(url);
}

export default GaolSocket;
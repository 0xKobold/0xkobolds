/**
 * Twitch IRC Client
 * 
 * Connects to Twitch IRC server for chat integration.
 * Handles connection, authentication, message parsing, and rate limiting.
 * 
 * Twitch IRC docs: https://dev.twitch.tv/docs/irc
 */

import { EventEmitter } from 'events';
import { Socket, createConnection as createNetConnection } from 'net';
import { connect as tlsConnect, TLSSocket } from 'tls';

export interface TwitchMessage {
  channel: string;
  username: string;
  displayName: string;
  message: string;
  timestamp: number;
  badges: string[];
  bits: number;
  isMod: boolean;
  isVip: boolean;
  isSubscriber: boolean;
  isBroadcaster: boolean;
  color: string | null;
}

export interface TwitchWhisper {
  username: string;
  displayName: string;
  message: string;
  timestamp: number;
}

export interface TwitchEvent {
  channel: string;
  username: string;
  type: 'join' | 'part' | 'hosted' | 'raided';
  data?: unknown;
}

type RateLimitQueue = {
  channel: string;
  message: string;
  timestamp: number;
};

export class TwitchIRIClient extends EventEmitter {
  private config: {
    username: string;
    oauthToken: string;
    server: string;
    port: number;
    useSSL: boolean;
    rateLimit: number;
  };
  
  private socket: Socket | TLSSocket | null = null;
  private connected = false;
  private authenticated = false;
  private channels: Set<string> = new Set();
  private rateLimitQueue: RateLimitQueue[] = [];
  private rateLimitTimer: Timer | null = null;
  private lastMessageTime = 0;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;

  constructor(config: {
    username: string;
    oauthToken: string;
    server?: string;
    port?: number;
    useSSL?: boolean;
    rateLimit?: number;
  }) {
    super();
    
    this.config = {
      username: config.username.toLowerCase(),
      oauthToken: config.oauthToken,
      server: config.server || 'irc.chat.twitch.tv',
      port: config.port || 6667,
      useSSL: config.useSSL ?? false,
      rateLimit: config.rateLimit || 20,
    };
  }

  /**
   * Connect to Twitch IRC
   */
  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        console.log(`[TwitchIRC] Connecting to ${this.config.server}:${this.config.port}...`);
        
        // Create connection
        if (this.config.useSSL) {
          this.socket = tlsConnect({
            host: this.config.server,
            port: this.config.port,
          }, () => {
            this.onConnect();
            resolve();
          });
        } else {
          this.socket = createNetConnection({
            host: this.config.server,
            port: this.config.port,
          }, () => {
            this.onConnect();
            resolve();
          });
        }
        
        // Set up event handlers
        this.socket?.on('data', (data) => this.onData(data));
        this.socket?.on('error', (err) => this.onError(err));
        this.socket?.on('close', () => this.onClose());
        
        // Timeout
        this.socket?.setTimeout(30000);
        this.socket?.on('timeout', () => {
          this.emit('error', new Error('Connection timeout'));
          this.socket?.destroy();
        });
        
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * On successful connection
   */
  private onConnect(): void {
    this.connected = true;
    console.log('[TwitchIRC] Connected');
    
    // Authenticate
    this.sendRaw(`PASS ${this.config.oauthToken}`);
    this.sendRaw(`NICK ${this.config.username}`);
    
    // Request additional capabilities
    this.sendRaw('CAP REQ :twitch.tv/commands');
    this.sendRaw('CAP REQ :twitch.tv/tags');
    this.sendRaw('CAP REQ :twitch.tv/membership');
  }

  /**
   * Disconnect from Twitch IRC
   */
  async disconnect(): Promise<void> {
    if (this.rateLimitTimer) {
      clearInterval(this.rateLimitTimer);
      this.rateLimitTimer = null;
    }
    
    if (this.socket) {
      // Leave all channels
      for (const channel of this.channels) {
        this.sendRaw(`PART ${channel}`);
      }
      
      this.socket.destroy();
      this.socket = null;
    }
    
    this.connected = false;
    this.authenticated = false;
    this.channels.clear();
    
    console.log('[TwitchIRC] Disconnected');
    this.emit('disconnect');
  }

  /**
   * Join a channel
   */
  async join(channel: string): Promise<void> {
    if (!channel.startsWith('#')) {
      channel = `#${channel}`;
    }
    
    this.channels.add(channel.toLowerCase());
    this.sendRaw(`JOIN ${channel.toLowerCase()}`);
    console.log(`[TwitchIRC] Joined ${channel}`);
  }

  /**
   * Leave a channel
   */
  async part(channel: string): Promise<void> {
    if (!channel.startsWith('#')) {
      channel = `#${channel}`;
    }
    
    this.channels.delete(channel.toLowerCase());
    this.sendRaw(`PART ${channel.toLowerCase()}`);
    console.log(`[TwitchIRC] Left ${channel}`);
  }

  /**
   * Send a message to a channel (rate limited)
   */
  async say(channel: string, message: string): Promise<void> {
    if (!channel.startsWith('#')) {
      channel = `#${channel}`;
    }
    
    // Add to rate limit queue
    this.rateLimitQueue.push({
      channel: channel.toLowerCase(),
      message,
      timestamp: Date.now(),
    });
    
    // Process queue
    this.processRateLimitQueue();
  }

  /**
   * Send a whisper (private message)
   */
  async whisper(username: string, message: string): Promise<void> {
    // Whispers use a different rate limit
    this.sendRaw(`PRIVMSG #jtv :/w ${username.toLowerCase()} ${message}`);
  }

  /**
   * Process rate limited message queue
   */
  private processRateLimitQueue(): void {
    if (this.rateLimitTimer) return;
    
    // Calculate messages per second from rate limit
    const messagesPerSecond = this.config.rateLimit / 30;
    const delayMs = 1000 / messagesPerSecond;
    
    this.rateLimitTimer = setInterval(() => {
      if (this.rateLimitQueue.length === 0) {
        clearInterval(this.rateLimitTimer!);
        this.rateLimitTimer = null;
        return;
      }
      
      const { channel, message } = this.rateLimitQueue.shift()!;
      this.sendRaw(`PRIVMSG ${channel} :${message}`);
      this.emit('sent', { channel, message });
    }, delayMs);
  }

  /**
   * Send raw IRC command
   */
  private sendRaw(command: string): void {
    if (!this.socket || !this.connected) {
      this.emit('error', new Error('Not connected'));
      return;
    }
    
    this.socket.write(`${command}\r\n`);
  }

  /**
   * Handle incoming data
   */
  private onData(data: Buffer): void {
    const lines = data.toString().split('\r\n');
    
    for (const line of lines) {
      if (!line.trim()) continue;
      
      // Parse IRC message
      this.parseLine(line);
    }
  }

  /**
   * Parse an IRC line
   */
  private parseLine(line: string): void {
    // Handle PING/PONG
    if (line.startsWith('PING ')) {
      this.sendRaw('PONG ' + line.substring(5));
      return;
    }
    
    // Handle authentication
    if (line.includes('001 ')) {
      this.authenticated = true;
      console.log('[TwitchIRC] Authenticated');
      this.emit('authenticated');
      return;
    }
    
    // Handle NOTICE (errors)
    if (line.includes('NOTICE * :')) {
      const match = line.match(/NOTICE \* :(.+)/);
      if (match) {
        console.log('[TwitchIRC] Notice:', match[1]);
        this.emit('notice', match[1]);
      }
      return;
    }
    
    // Parse PRIVMSG (chat messages)
    if (line.includes('PRIVMSG #')) {
      this.parsePrivmsg(line);
      return;
    }
    
    // Parse WHISPER (private messages)
    if (line.includes('WHISPER ')) {
      this.parseWhisper(line);
      return;
    }
    
    // Parse JOIN
    if (line.includes('JOIN #')) {
      const match = line.match(/:([^!]+)!.*JOIN (#\S+)/);
      if (match) {
        this.emit('join', { username: match[1].toLowerCase(), channel: match[2] });
      }
      return;
    }
    
    // Parse PART
    if (line.includes('PART #')) {
      const match = line.match(/:([^!]+)!.*PART (#\S+)/);
      if (match) {
        this.emit('part', { username: match[1].toLowerCase(), channel: match[2] });
      }
      return;
    }
    
    // Parse ROOMSTATE
    if (line.includes('ROOMSTATE #')) {
      // Channel state change (slow mode, sub mode, etc.)
      return;
    }
    
    // Parse USERSTATE
    if (line.includes('USERSTATE #')) {
      // Current user's state in channel
      return;
    }
  }

  /**
   * Parse PRIVMSG (chat message)
   */
  private parsePrivmsg(line: string): void {
    // IRC format: @tags :user!user@user.tmi.twitch.tv PRIVMSG #channel :message
    const tagsMatch = line.match(/^@([^ ]+) :?([^!]+)!([^ ]+) PRIVMSG (#\S+) :(.*)$/);
    if (!tagsMatch) return;
    
    const [, tagsRaw, username, , channel, message] = tagsMatch;
    
    // Parse tags
    const tags = this.parseTags(tagsRaw);
    
    const chatMessage: TwitchMessage = {
      channel: channel.toLowerCase(),
      username: username.toLowerCase(),
      displayName: tags['display-name'] || username,
      message: message.trim(),
      timestamp: parseInt(tags['tmi-sent-ts'] || Date.now().toString()),
      badges: (tags['badges'] || '').split(',').filter(Boolean),
      bits: parseInt(tags['bits'] || '0'),
      isMod: tags['mod'] === '1' || (tags['badges'] || '').includes('moderator'),
      isVip: (tags['badges'] || '').includes('vip'),
      isSubscriber: tags['subscriber'] === '1' || (tags['badges'] || '').includes('subscriber'),
      isBroadcaster: (tags['badges'] || '').includes('broadcaster'),
      color: tags['color'] || null,
    };
    
    this.emit('message', chatMessage);
  }

  /**
   * Parse WHISPER (private message)
   */
  private parseWhisper(line: string): void {
    const tagsMatch = line.match(/^@([^ ]+) :?([^!]+)!([^ ]+) WHISPER (\S+) :(.*)$/);
    if (!tagsMatch) return;
    
    const [, tagsRaw, username, , , message] = tagsMatch;
    const tags = this.parseTags(tagsRaw);
    
    const whisper: TwitchWhisper = {
      username: username.toLowerCase(),
      displayName: tags['display-name'] || username,
      message: message.trim(),
      timestamp: parseInt(tags['tmi-sent-ts'] || Date.now().toString()),
    };
    
    this.emit('whisper', whisper);
  }

  /**
   * Parse Twitch IRC tags
   */
  private parseTags(tagsRaw: string): Record<string, string> {
    const tags: Record<string, string> = {};
    
    for (const tag of tagsRaw.split(';')) {
      const [key, value] = tag.split('=');
      if (key) {
        // Unescape Twitch IRC escaping
        tags[key] = (value || '')
          .replace(/\\s/g, ' ')
          .replace(/\\n/g, '\n')
          .replace(/\\r/g, '\r')
          .replace(/\\/g, '\\');
      }
    }
    
    return tags;
  }

  /**
   * Handle connection error
   */
  private onError(error: Error): void {
    console.error('[TwitchIRC] Error:', error.message);
    this.emit('error', error);
    
    // Attempt reconnection
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      console.log(`[TwitchIRC] Reconnecting (attempt ${this.reconnectAttempts})...`);
      setTimeout(() => this.connect().catch(console.error), this.reconnectDelay * this.reconnectAttempts);
    }
  }

  /**
   * Handle connection close
   */
  private onClose(): void {
    this.connected = false;
    this.authenticated = false;
    console.log('[TwitchIRC] Connection closed');
    this.emit('close');
    
    // Attempt reconnection
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      console.log(`[TwitchIRC] Reconnecting (attempt ${this.reconnectAttempts})...`);
      setTimeout(() => this.connect().catch(console.error), this.reconnectDelay * this.reconnectAttempts);
    }
  }

  /**
   * Get client status
   */
  getStatus(): { connected: boolean; authenticated: boolean; channels: string[] } {
    return {
      connected: this.connected,
      authenticated: this.authenticated,
      channels: Array.from(this.channels),
    };
  }
}

export default TwitchIRIClient;
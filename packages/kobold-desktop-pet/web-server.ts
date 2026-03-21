#!/usr/bin/env bun
/**
 * Simple web server to preview the Cool Turtle VRM
 * 
 * Run: bun run web-server.ts
 * Open: http://localhost:3000
 */

import { serve } from 'bun';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const PORT = 3001;
const ROOT_DIR = import.meta.dir;

console.log(`🐢 Starting Cool Turtle Preview Server...`);
console.log(`   Root: ${ROOT_DIR}`);
console.log(`   Port: ${PORT}`);

serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);
    let path = url.pathname;

    // Default to web-preview.html
    if (path === '/' || path === '') {
      path = '/web-preview.html';
    }

    // Resolve file path
    const filePath = join(ROOT_DIR, path);
    
    console.log(`[Server] ${req.method} ${path}`);

    // Serve file
    const file = Bun.file(filePath);
    
    if (await file.exists()) {
      return new Response(file);
    }

    // 404
    return new Response('Not Found', { status: 404 });
  },
  error(error) {
    console.error('[Server] Error:', error);
    return new Response('Server Error', { status: 500 });
  }
});

console.log(`\n✅ Server running at http://localhost:${PORT}`);
console.log(`\nOpen in browser to see the Cool Turtle!`);
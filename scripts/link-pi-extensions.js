#!/usr/bin/env node
/**
 * 🐉 0xKobold PI Extension Linker
 * 
 * Automatically links PI community extensions to ~/.0xkobold/
 * Run during postinstall to set up the extension environment
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { homedir } from 'node:os';
import { pathToFileURL } from 'node:url';

const KOBOLD_DIR = path.join(homedir(), '.0xkobold');

// Extensions to link
const EXTENSIONS = [
  { pkg: 'pi-subagents', type: 'extension', config: { maxDepth: 5, autoCleanup: true } },
  { pkg: 'pi-messenger', type: 'extension' },
  { pkg: 'pi-web-access', type: 'skill' },
  { pkg: 'pi-memory-md', type: 'extension' },
  { pkg: 'pi-librarian', type: 'skill' },
];

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

async function symlinkExtension(pkg, type) {
  const sourcePath = pathToFileURL(
    path.join(process.cwd(), 'node_modules', pkg)
  ).pathname;
  
  const targetPath = path.join(
    KOBOLD_DIR,
    type === 'skill' ? 'skills/community' : 'extensions/community',
    pkg
  );
  
  // Check if source exists
  try {
    await fs.access(sourcePath);
  } catch {
    console.log(`⚠️  Package ${pkg} not found in node_modules, skipping...`);
    return false;
  }
  
  // Remove existing link if stale
  try {
    const stats = await fs.lstat(targetPath);
    if (stats.isSymbolicLink()) {
      await fs.unlink(targetPath);
    }
  } catch {
    // Doesn't exist, that's fine
  }
  
  // Create symlink
  try {
    await fs.symlink(sourcePath, targetPath, 'junction');
    console.log(`🔗 Linked ${pkg} → ~/.0xkobold/${type}s/community/${pkg}`);
    return true;
  } catch (err) {
    // Fallback: copy instead of symlink
    console.log(`📦 Copying ${pkg} (symlink failed: ${err.message})`);
    await fs.cp(sourcePath, targetPath, { recursive: true, force: true });
    return true;
  }
}

async function writeManifest() {
  const manifestPath = path.join(KOBOLD_DIR, 'community-extensions.json');
  const manifest = {
    name: '0xKobold Community Pack',
    version: '0.5.0',
    installedAt: new Date().toISOString(),
    extensions: EXTENSIONS.reduce((acc, { pkg, config }) => {
      acc[pkg] = config || {};
      return acc;
    }, {})
  };
  
  await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2));
  console.log(`📝 Written manifest: ${manifestPath}`);
}

async function main() {
  console.log('🐉 0xKobold Extension Setup');
  console.log('============================');
  
  // Ensure directories exist
  await ensureDir(path.join(KOBOLD_DIR, 'extensions/community'));
  await ensureDir(path.join(KOBOLD_DIR, 'skills/community'));
  
  // Link each extension
  let linked = 0;
  for (const { pkg, type } of EXTENSIONS) {
    if (await symlinkExtension(pkg, type)) {
      linked++;
    }
  }
  
  // Write manifest
  await writeManifest();
  
  console.log('');
  console.log(`✅ Linked ${linked}/${EXTENSIONS.length} community extensions`);
  console.log('');
  console.log('Available commands:');
  console.log('  /agent-spawn    - Spawn subagents (pi-subagents)');
  console.log('  /messenger      - Inter-agent messaging (pi-messenger)');
  console.log('  /web-search     - Web search & fetch (pi-web-access)');
  console.log('  /memory         - Persistent memory (pi-memory-md)');
  console.log('  /librarian      - GitHub research (pi-librarian)');
}

main().catch(err => {
  console.error('❌ Extension setup failed:', err);
  process.exit(1);
});

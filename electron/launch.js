#!/usr/bin/env node
/**
 * Launcher that strips ELECTRON_RUN_AS_NODE before starting Electron.
 *
 * VS Code (and some other Electron hosts) export ELECTRON_RUN_AS_NODE=1 into
 * their integrated terminals. With it set, Electron starts as a plain Node
 * process: `require('electron')` returns the binary PATH STRING instead of the
 * module, so `const { app } = require('electron')` yields undefined and main.js
 * dies with "Cannot read properties of undefined (reading 'app')".
 *
 * Running under plain node here is intentional -- that is what makes
 * `require('electron')` resolve to the executable path we need to spawn.
 */

const { spawn } = require('child_process');
const path = require('path');
const electronBinary = require('electron');

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

const child = spawn(
  electronBinary,
  [path.join(__dirname, '..'), ...process.argv.slice(2)],
  { stdio: 'inherit', env }
);

child.on('close', (code) => process.exit(code ?? 0));

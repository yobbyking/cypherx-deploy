/**
 * string-dumper.js — Preloaded BEFORE the bot starts.
 *
 * Monkey-patches String.prototype and the global require to dump every
 * string that the bot decodes at runtime, so we can identify the
 * obfuscated "Platform Linux is not allowed" check and find what
 * detection method it's actually using.
 *
 * Loaded via `node --require ./string-dumper.js index.js` (TEMPORARY — for
 * the next deploy only, to diagnose the platform check).
 */

'use strict';

// Keywords to watch for
const KEYWORDS = ['linux', 'is not allowed', 'crashing', 'win32', 'darwin', '/etc/', '/proc/', 'uname', 'windows'];
// Also include 'platform' but be more careful — only dump strings that have platform + something else suspicious

function isDumperOutput(s) {
  // Don't recurse on our own output
  return typeof s === 'string' && s.includes('STRING-DUMPER');
}

function shouldDump(s) {
  if (typeof s !== 'string') return false;
  if (s.length < 3 || s.length > 500) return false;
  if (isDumperOutput(s)) return false; // prevent recursion
  const lower = s.toLowerCase();
  // For "platform", require another keyword too (avoid spam)
  if (lower.includes('platform')) {
    return KEYWORDS.some(k => lower.includes(k)) || lower.includes('os.') || lower.includes('process.');
  }
  return KEYWORDS.some(k => lower.includes(k));
}

// Use a flag to track when we're writing our own output, so we don't recurse
let inDumper = false;

function safeDump(tag, text) {
  if (inDumper) return;
  inDumper = true;
  try {
    // Use the ORIGINAL stderr write, not our patched one
    const buf = `\n[STRING-DUMPER ${tag}] ${JSON.stringify(text)}\n`;
    origStderrWrite(buf);
  } finally {
    inDumper = false;
  }
}

// ---- Capture originals ----
const origLog = console.log.bind(console);
const origWarn = console.warn.bind(console);
const origErr = console.error.bind(console);
const origStdoutWrite = process.stdout.write.bind(process.stdout);
const origStderrWrite = process.stderr.write.bind(process.stderr);

// ---- Patch console methods (call originals directly, no recursion) ----
console.log = function (...args) {
  for (const a of args) {
    if (typeof a === 'string' && shouldDump(a)) safeDump('log', a);
  }
  return origLog(...args);
};
console.warn = function (...args) {
  for (const a of args) {
    if (typeof a === 'string' && shouldDump(a)) safeDump('warn', a);
  }
  return origWarn(...args);
};
console.error = function (...args) {
  for (const a of args) {
    if (typeof a === 'string' && shouldDump(a)) safeDump('err', a);
  }
  return origErr(...args);
};

// ---- Patch stdout/stderr writes ----
process.stdout.write = function (data, ...rest) {
  if (typeof data === 'string' && shouldDump(data)) safeDump('stdout', data);
  return origStdoutWrite(data, ...rest);
};
process.stderr.write = function (data, ...rest) {
  if (typeof data === 'string' && shouldDump(data)) safeDump('stderr', data);
  return origStderrWrite(data, ...rest);
};

// ---- Patch String.fromCharCode ----
const origFromCharCode = String.fromCharCode;
String.fromCharCode = function (...codes) {
  const result = origFromCharCode.apply(String, codes);
  if (shouldDump(result)) safeDump('fromCharCode', result);
  return result;
};

// ---- Patch String.fromCodePoint ----
const origFromCodePoint = String.fromCodePoint;
String.fromCodePoint = function (...codes) {
  const result = origFromCodePoint.apply(String, codes);
  if (shouldDump(result)) safeDump('fromCodePoint', result);
  return result;
};

// ---- Patch Buffer.from (only when used to decode strings) ----
const origBufferFrom = Buffer.from;
Buffer.from = function (...args) {
  const result = origBufferFrom.apply(Buffer, args);
  try {
    const s = result.toString('utf8');
    if (shouldDump(s)) safeDump('Buffer.from', s);
  } catch (e) {}
  return result;
};

// ---- Patch eval ----
const origEval = global.eval;
global.eval = function (code) {
  if (typeof code === 'string' && shouldDump(code)) safeDump('eval', code);
  return origEval.call(this, code);
};

// ---- Patch os methods to log what they return (use safeDump to avoid recursion) ----
try {
  const os = require('os');
  // Wrap each os method
  ['platform', 'type', 'release', 'hostname', 'homedir', 'arch', 'endianness'].forEach(fn => {
    const orig = os[fn];
    if (typeof orig === 'function') {
      os[fn] = function (...args) {
        const result = orig.apply(this, args);
        // Only log when result is a non-empty string and looks relevant
        if (typeof result === 'string' && result.length > 0 && result.length < 100) {
          // Avoid logging 'win32' over and over (it's our own patch result)
          if (result !== 'win32' && result !== 'Windows_NT') {
            safeDump(`os.${fn}()`, `returned: ${JSON.stringify(result)}`);
          }
        }
        return result;
      };
    }
  });
  // os.userInfo returns an object
  const origUserInfo = os.userInfo;
  os.userInfo = function (...args) {
    const result = origUserInfo.apply(this, args);
    try {
      const s = JSON.stringify(result);
      if (shouldDump(s)) safeDump('os.userInfo()', s);
    } catch (e) {}
    return result;
  };
} catch (e) {}

// ---- Patch child_process.execSync / execFileSync to see if the bot runs uname ----
try {
  const cp = require('child_process');
  const origExecSync = cp.execSync;
  cp.execSync = function (cmd, opts) {
    if (typeof cmd === 'string' && (cmd.includes('uname') || cmd.includes('/etc/') || cmd.includes('/proc/'))) {
      safeDump('execSync', `cmd: ${cmd}`);
    }
    return origExecSync.apply(this, arguments);
  };
  const origExecFileSync = cp.execFileSync;
  cp.execFileSync = function (file, args, opts) {
    const argStr = Array.isArray(args) ? args.join(' ') : '';
    if (typeof file === 'string' && (file.includes('uname') || file.includes('/etc/') || file.includes('/proc/'))) {
      safeDump('execFileSync', `file: ${file} args: ${argStr}`);
    }
    return origExecFileSync.apply(this, arguments);
  };
} catch (e) {}

// ---- Patch fs.readFileSync to see if the bot reads /etc/os-release or /proc/version ----
try {
  const fs = require('fs');
  const origReadFileSync = fs.readFileSync;
  fs.readFileSync = function (p, opts) {
    if (typeof p === 'string' && (p.includes('/etc/') || p.includes('/proc/'))) {
      safeDump('readFileSync', `path: ${p}`);
    }
    return origReadFileSync.apply(this, arguments);
  };
  const origExistsSync = fs.existsSync;
  fs.existsSync = function (p) {
    if (typeof p === 'string' && (p.includes('/etc/') || p.includes('/proc/'))) {
      safeDump('existsSync', `path: ${p} -> (will check)`);
    }
    return origExistsSync.apply(this, arguments);
  };
} catch (e) {}

safeDump('init', 'String dumper installed. Watching for platform-detection calls.');

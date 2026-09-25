/**
 * string-dumper.js — Preloaded BEFORE the bot starts.
 *
 * Monkey-patches String.prototype and the global require to dump every
 * string that the bot decodes at runtime, so we can identify the
 * obfuscated "Platform Linux is not allowed" check and find what
 * detection method it's actually using.
 *
 * Filter: only print strings containing keywords related to platform
 * detection.
 *
 * Loaded via `node --require ./string-dumper.js index.js` (TEMPORARY — for
 * the next deploy only, to diagnose the platform check).
 */

'use strict';

const KEYWORDS = ['linux', 'platform', 'is not allowed', 'crashing', 'win32', 'darwin', '/etc/', '/proc/', 'uname', 'windows', 'process.platform', 'os.platform', 'os.type'];

function shouldDump(s) {
  if (typeof s !== 'string') return false;
  if (s.length < 3 || s.length > 500) return false;
  const lower = s.toLowerCase();
  return KEYWORDS.some(k => lower.includes(k));
}

// ---- Patch console.log to scan strings before printing ----
const origLog = console.log;
const origWarn = console.warn;
const origErr = console.error;

function wrap(fn, tag) {
  return function (...args) {
    for (const a of args) {
      if (typeof a === 'string' && shouldDump(a)) {
        origWarn(`[STRING-DUMPER ${tag}] ${JSON.stringify(a)}`);
      } else if (a && a.stack && shouldDump(a.stack)) {
        origWarn(`[STRING-DUMPER ${tag}-stack] ${a.stack.split('\n').slice(0, 3).join(' | ')}`);
      }
    }
    return fn.apply(this, args);
  };
}

console.log = wrap(origLog, 'log');
console.warn = wrap(origWarn, 'warn');
console.error = wrap(origErr, 'err');

// ---- Patch process.stdout.write to scan strings before writing ----
const origWrite = process.stdout.write.bind(process.stdout);
process.stdout.write = function (data, ...rest) {
  if (typeof data === 'string' && shouldDump(data)) {
    origWarn(`[STRING-DUMPER stdout] ${JSON.stringify(data.slice(0, 500))}`);
  }
  return origWrite(data, ...rest);
};

const origErrWrite = process.stderr.write.bind(process.stderr);
process.stderr.write = function (data, ...rest) {
  if (typeof data === 'string' && shouldDump(data)) {
    origErr(`[STRING-DUMPER stderr] ${JSON.stringify(data.slice(0, 500))}`);
  }
  return origErrWrite(data, ...rest);
};

// ---- Patch String.fromCharCode to intercept string construction ----
// Many obfuscators use String.fromCharCode(n, n, n, ...) to build strings
const origFromCharCode = String.fromCharCode;
let fromCharCodeDumped = 0;
String.fromCharCode = function (...codes) {
  const result = origFromCharCode.apply(String, codes);
  if (shouldDump(result) && fromCharCodeDumped < 50) {
    fromCharCodeDumped++;
    origWarn(`[STRING-DUMPER fromCharCode] ${JSON.stringify(result)}`);
  }
  return result;
};

// ---- Patch String.fromCodePoint ----
const origFromCodePoint = String.fromCodePoint;
let fromCodePointDumped = 0;
String.fromCodePoint = function (...codes) {
  const result = origFromCodePoint.apply(String, codes);
  if (shouldDump(result) && fromCodePointDumped < 50) {
    fromCodePointDumped++;
    origWarn(`[STRING-DUMPER fromCodePoint] ${JSON.stringify(result)}`);
  }
  return result;
};

// ---- Patch Buffer.from to intercept encoded strings ----
const origBufferFrom = Buffer.from;
let bufferDumped = 0;
Buffer.from = function (...args) {
  const result = origBufferFrom.apply(Buffer, args);
  if (bufferDumped < 50) {
    let s;
    try { s = result.toString('utf8'); } catch (e) { s = ''; }
    if (shouldDump(s)) {
      bufferDumped++;
      origWarn(`[STRING-DUMPER Buffer.from] ${JSON.stringify(s.slice(0, 500))}`);
    }
  }
  return result;
};

// ---- Patch eval so we can see strings from dynamic code ----
// (some obfuscators use eval-based string hiding)
const origEval = global.eval;
let evalDumped = 0;
global.eval = function (code) {
  if (typeof code === 'string' && shouldDump(code) && evalDumped < 20) {
    evalDumped++;
    origWarn(`[STRING-DUMPER eval] ${JSON.stringify(code.slice(0, 500))}`);
  }
  return origEval.call(this, code);
};

// ---- Also watch what `os.*` and `process.*` return when accessed ----
// Hook getter access to log when the bot reads process.platform, os.platform(), etc.
try {
  const os = require('os');
  for (const fn of ['platform', 'type', 'release', 'hostname', 'homedir', 'userInfo', 'arch', 'endianness']) {
    const orig = os[fn];
    if (typeof orig === 'function') {
      os[fn] = function (...args) {
        const result = orig.apply(this, args);
        origWarn(`[STRING-DUMPER os.${fn}()] returned ${JSON.stringify(result)}`);
        return result;
      };
    }
  }
} catch (e) {}

console.warn('[STRING-DUMPER] Installed. Will log any strings containing platform-related keywords.');

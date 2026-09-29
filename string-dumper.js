/**
 * string-dumper.js — Preloaded BEFORE the bot starts.
 *
 * Dumps every platform-related string + prints stack traces for the
 * "Platform Linux" error message so we can find the exact source line
 * where the bot triggers the crash.
 */

'use strict';

const KEYWORDS = ['linux', 'is not allowed', 'crashing', 'win32', 'darwin', '/etc/', '/proc/', 'uname', 'windows'];

function isDumperOutput(s) {
  return typeof s === 'string' && s.includes('STRING-DUMPER');
}

function shouldDump(s) {
  if (typeof s !== 'string') return false;
  if (s.length < 3 || s.length > 500) return false;
  if (isDumperOutput(s)) return false;
  const lower = s.toLowerCase();
  if (lower.includes('platform')) {
    return KEYWORDS.some(k => lower.includes(k)) || lower.includes('os.') || lower.includes('process.');
  }
  return KEYWORDS.some(k => lower.includes(k));
}

let inDumper = false;

function safeDump(tag, text, stack) {
  if (inDumper) return;
  inDumper = true;
  try {
    let buf = `\n[STRING-DUMPER ${tag}] ${JSON.stringify(text)}`;
    if (stack) {
      // Only show top 8 stack frames (skip the dumper itself)
      const lines = stack.split('\n').filter(l => !l.includes('string-dumper') && !l.includes('safeDump'));
      buf += '\n' + lines.slice(0, 8).join('\n');
    }
    buf += '\n';
    origStderrWrite(buf);
  } finally {
    inDumper = false;
  }
}

const origLog = console.log.bind(console);
const origWarn = console.warn.bind(console);
const origErr = console.error.bind(console);
const origStdoutWrite = process.stdout.write.bind(process.stdout);
const origStderrWrite = process.stderr.write.bind(process.stderr);

console.log = function (...args) {
  for (const a of args) {
    if (typeof a === 'string' && shouldDump(a)) safeDump('log', a, new Error().stack);
  }
  return origLog(...args);
};
console.warn = function (...args) {
  for (const a of args) {
    if (typeof a === 'string' && shouldDump(a)) safeDump('warn', a, new Error().stack);
  }
  return origWarn(...args);
};
console.error = function (...args) {
  for (const a of args) {
    if (typeof a === 'string' && shouldDump(a)) safeDump('err', a, new Error().stack);
  }
  return origErr(...args);
};

process.stdout.write = function (data, ...rest) {
  if (typeof data === 'string' && shouldDump(data)) safeDump('stdout', data, new Error().stack);
  return origStdoutWrite(data, ...rest);
};
process.stderr.write = function (data, ...rest) {
  if (typeof data === 'string' && shouldDump(data)) safeDump('stderr', data, new Error().stack);
  return origStderrWrite(data, ...rest);
};

const origFromCharCode = String.fromCharCode;
String.fromCharCode = function (...codes) {
  const result = origFromCharCode.apply(String, codes);
  if (shouldDump(result)) safeDump('fromCharCode', result, new Error().stack);
  return result;
};

const origFromCodePoint = String.fromCodePoint;
String.fromCodePoint = function (...codes) {
  const result = origFromCodePoint.apply(String, codes);
  if (shouldDump(result)) safeDump('fromCodePoint', result, new Error().stack);
  return result;
};

const origBufferFrom = Buffer.from;
Buffer.from = function (...args) {
  const result = origBufferFrom.apply(Buffer, args);
  try {
    const s = result.toString('utf8');
    if (shouldDump(s)) safeDump('Buffer.from', s, new Error().stack);
  } catch (e) {}
  return result;
};

const origEval = global.eval;
global.eval = function (code) {
  if (typeof code === 'string' && shouldDump(code)) safeDump('eval', code, new Error().stack);
  return origEval.call(this, code);
};

// Hook os methods
try {
  const os = require('os');
  ['platform', 'type', 'release', 'hostname', 'homedir', 'arch', 'endianness'].forEach(fn => {
    const orig = os[fn];
    if (typeof orig === 'function') {
      os[fn] = function (...args) {
        const result = orig.apply(this, args);
        if (typeof result === 'string' && result.length > 0 && result.length < 100) {
          if (result !== 'win32' && result !== 'Windows_NT' && result !== '10.0.19041' && result !== 'LE') {
            safeDump(`os.${fn}()`, `returned: ${JSON.stringify(result)}`, new Error().stack);
          }
        }
        return result;
      };
    }
  });
  const origUserInfo = os.userInfo;
  os.userInfo = function (...args) {
    const result = origUserInfo.apply(this, args);
    try {
      const s = JSON.stringify(result);
      if (shouldDump(s)) safeDump('os.userInfo()', s, new Error().stack);
    } catch (e) {}
    return result;
  };
} catch (e) {}

// Hook child_process
try {
  const cp = require('child_process');
  const origExecSync = cp.execSync;
  cp.execSync = function (cmd, opts) {
    if (typeof cmd === 'string' && (cmd.includes('uname') || cmd.includes('/etc/') || cmd.includes('/proc/'))) {
      safeDump('execSync', `cmd: ${cmd}`, new Error().stack);
    }
    return origExecSync.apply(this, arguments);
  };
  const origExecFileSync = cp.execFileSync;
  cp.execFileSync = function (file, args, opts) {
    const argStr = Array.isArray(args) ? args.join(' ') : '';
    if (typeof file === 'string' && (file.includes('uname') || file.includes('/etc/') || file.includes('/proc/'))) {
      safeDump('execFileSync', `file: ${file} args: ${argStr}`, new Error().stack);
    }
    return origExecFileSync.apply(this, arguments);
  };
} catch (e) {}

// Hook fs
try {
  const fs = require('fs');
  const origReadFileSync = fs.readFileSync;
  fs.readFileSync = function (p, opts) {
    if (typeof p === 'string' && (p.includes('/etc/') || p.includes('/proc/'))) {
      safeDump('readFileSync', `path: ${p}`, new Error().stack);
    }
    return origReadFileSync.apply(this, arguments);
  };
  const origExistsSync = fs.existsSync;
  fs.existsSync = function (p) {
    if (typeof p === 'string' && (p.includes('/etc/') || p.includes('/proc/'))) {
      safeDump('existsSync', `path: ${p}`, new Error().stack);
    }
    return origExistsSync.apply(this, arguments);
  };
} catch (e) {}

// NEW: Hook path module access (path.sep, path.delimiter reads)
try {
  const path = require('path');
  // Watch every time path.sep is read
  let sepVal = path.sep;
  let delimVal = path.delimiter;
  Object.defineProperty(path, 'sep', {
    get() {
      safeDump('path.sep GET', `returned: ${JSON.stringify(sepVal)}`, new Error().stack);
      return sepVal;
    },
    set(v) { sepVal = v; },
    configurable: true,
    enumerable: true,
  });
  Object.defineProperty(path, 'delimiter', {
    get() {
      safeDump('path.delimiter GET', `returned: ${JSON.stringify(delimVal)}`, new Error().stack);
      return delimVal;
    },
    set(v) { delimVal = v; },
    configurable: true,
    enumerable: true,
  });
} catch (e) {}

// NEW: Hook process.execPath, process.cwd() reads
try {
  const origCwd = process.cwd;
  process.cwd = function () {
    const r = origCwd.call(process);
    safeDump('process.cwd()', `returned: ${JSON.stringify(r)}`, new Error().stack);
    return r;
  };
} catch (e) {}

safeDump('init', 'String dumper installed v2. Now with stack traces + path/execPath/cwd hooks.');

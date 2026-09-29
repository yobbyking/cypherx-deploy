/**
 * platform-patch.js — Preloaded BEFORE the bot starts.
 *
 * Comprehensive Windows spoofing for CypherX anti-self-hosting check.
 */

'use strict';

try {
  // ---------- 1. process.platform ----------
  Object.defineProperty(process, 'platform', {
    value: 'win32', writable: true, configurable: true, enumerable: true,
  });

  // ---------- 2-4. os module patches ----------
  const os = require('os');
  os.platform  = function () { return 'win32'; };
  os.type      = function () { return 'Windows_NT'; };
  os.release   = function () { return '10.0.19041'; };
  os.endianness = function () { return 'LE'; };

  // ---------- 5. os.homedir() ----------
  const fakeHome = 'C:\\Users\\Administrator';
  os.homedir = function () { return fakeHome; };
  process.env.USERPROFILE = fakeHome;
  process.env.HOMEDRIVE = 'C:';
  process.env.HOMEPATH = '\\Users\\Administrator';
  process.env.APPDATA = 'C:\\Users\\Administrator\\AppData\\Roaming';
  process.env.LOCALAPPDATA = 'C:\\Users\\Administrator\\AppData\\Local';
  process.env.SystemRoot = 'C:\\Windows';
  process.env.windir = 'C:\\Windows';
  process.env.ComSpec = 'C:\\Windows\\System32\\cmd.exe';
  process.env.PROGRAMFILES = 'C:\\Program Files';
  process.env['ProgramFiles(x86)'] = 'C:\\Program Files (x86)';
  process.env.PROCESSOR_ARCHITECTURE = 'AMD64';
  process.env.PROCESSOR_IDENTIFIER = 'Intel64 Family 6 Model 158 Stepping 10, GenuineIntel';
  process.env.PROCESSOR_LEVEL = '6';
  process.env.PROCESSOR_REVISION = '9e0a';
  process.env.NUMBER_OF_PROCESSORS = String(os.cpus().length || 4);
  process.env.OS = 'Windows_NT';

  // ---------- 6. os.userInfo() ----------
  try {
    os.userInfo = function () {
      return {
        uid: -1, gid: -1, username: 'Administrator',
        homedir: fakeHome, shell: null,
      };
    };
  } catch (e) {}

  // ---------- 7. child_process.execSync ----------
  try {
    const cp = require('child_process');
    const origExecSync = cp.execSync;
    cp.execSync = function (cmd, opts) {
      if (typeof cmd === 'string' && /(^|\s)uname(\s|$)/i.test(cmd)) {
        if (/-r\b/.test(cmd)) return Buffer.from('10.0.19041');
        if (/-a\b/.test(cmd)) return Buffer.from('Windows_NT cypherx 10.0.19041 x86_64 unknown');
        return Buffer.from('Windows_NT');
      }
      if (typeof cmd === 'string' && /\/etc\/(os|lsb|debian|centos|alpine|ubuntu|fedora|redhat|system)-?release/i.test(cmd)) {
        throw new Error('ENOENT');
      }
      return origExecSync.apply(this, arguments);
    };
    const origExecFileSync = cp.execFileSync;
    cp.execFileSync = function (file, args, opts) {
      if (file === 'uname' || (typeof file === 'string' && file.endsWith('/uname'))) {
        const a = (args || []).join(' ');
        if (/-r/.test(a)) return Buffer.from('10.0.19041');
        if (/-a/.test(a)) return Buffer.from('Windows_NT cypherx 10.0.19041 x86_64 unknown');
        return Buffer.from('Windows_NT');
      }
      return origExecFileSync.apply(this, arguments);
    };
  } catch (e) {}

  // ---------- 8. fs patches ----------
  try {
    const fs = require('fs');
    const origExistsSync = fs.existsSync;
    const origReadFileSync = fs.readFileSync;
    const linuxOnlyFiles = [
      '/etc/os-release', '/etc/lsb-release', '/etc/debian_version',
      '/etc/alpine-release', '/etc/centos-release', '/etc/fedora-release',
      '/etc/redhat-release', '/etc/system-release', '/etc/issue',
      '/proc/version', '/proc/cpuinfo', '/proc/meminfo', '/proc/self/status',
    ];
    fs.existsSync = function (p) {
      if (typeof p === 'string' && linuxOnlyFiles.some(f => p === f || p.startsWith(f))) return false;
      return origExistsSync.apply(this, arguments);
    };
    fs.readFileSync = function (p, opts) {
      if (typeof p === 'string' && linuxOnlyFiles.some(f => p === f || p.startsWith(f))) {
        throw Object.assign(new Error(`ENOENT, no such file or directory '${p}'`), { code: 'ENOENT' });
      }
      return origReadFileSync.apply(this, arguments);
    };
  } catch (e) {}

  // ---------- 9. Remove Render/Railway env vars ----------
  const blockedVars = [
    'RENDER', 'RENDER_SERVICE_ID', 'RENDER_SERVICE_NAME', 'RENDER_EXTERNAL_URL',
    'RAILWAY_SERVICE_ID', 'RAILWAY_PROJECT_ID', 'RAILWAY_ENVIRONMENT',
    'DYNO', 'ON_HEROKU', 'FLY_ALLOC_ID', 'FLY_APP_NAME', 'VERCEL',
    'CODESANDBOX', 'GITPOD_WORKSPACE_ID',
  ];
  for (const v of blockedVars) delete process.env[v];

  // ---------- 10. NEW: path module patches ----------
  // path.sep is '/' on Linux, '\\' on Windows
  // path.delimiter is ':' on Linux, ';' on Windows
  // path.posix.sep = '/', path.win32.sep = '\\' (don't change these — they're
  // supposed to be platform-specific submodules)
  try {
    const path = require('path');
    // Override path.sep to look like Windows
    Object.defineProperty(path, 'sep', {
      value: '\\', writable: true, configurable: true, enumerable: true,
    });
    Object.defineProperty(path, 'delimiter', {
      value: ';', writable: true, configurable: true, enumerable: true,
    });
    // Save original parse/format/join/resolve to convert Linux-style paths
    // returned by the runtime to Windows-style
    const origResolve = path.resolve;
    path.resolve = function (...args) {
      const result = origResolve.apply(path, args);
      // Convert /app/foo to C:\app\foo (the container's /app is our app root)
      if (typeof result === 'string' && result.startsWith('/')) {
        return 'C:' + result.replace(/\//g, '\\');
      }
      return result;
    };
    const origNormalize = path.normalize;
    path.normalize = function (p) {
      const r = origNormalize.call(path, p);
      if (typeof r === 'string' && r.startsWith('/') && !r.startsWith('//')) {
        return 'C:' + r.replace(/\//g, '\\');
      }
      return r;
    };
  } catch (e) {}

  // ---------- 11. NEW: process.execPath / __dirname / process.cwd() ----------
  // process.execPath on Linux is /usr/local/bin/node; Windows is C:\Program Files\nodejs\node.exe
  try {
    Object.defineProperty(process, 'execPath', {
      get() { return 'C:\\Program Files\\nodejs\\node.exe'; },
      configurable: true,
    });
  } catch (e) {}

  // process.cwd() — wrap to convert /app/... to C:\app\...
  const origCwd = process.cwd;
  process.cwd = function () {
    const r = origCwd.call(process);
    if (typeof r === 'string' && r.startsWith('/')) {
      return 'C:' + r.replace(/\//g, '\\');
    }
    return r;
  };

  // ---------- 12. NEW: process.env.PATH ----------
  // Replace Linux-style PATH (/usr/local/bin:/usr/bin:...) with Windows-style
  process.env.PATH = [
    'C:\\Program Files\\nodejs',
    'C:\\Program Files\\nodejs\\node_modules\\npm\\bin',
    'C:\\Windows\\System32',
    'C:\\Windows',
    'C:\\Windows\\System32\\Wbem',
    'C:\\Program Files\\ImageMagick',
    'C:\\ffmpeg\\bin',
  ].join(';');

  // ---------- 13. NEW: os.networkInterfaces() ----------
  // Linux interfaces are 'eth0', 'ens33', etc. Windows is 'Ethernet', 'Wi-Fi'
  try {
    const origIfaces = os.networkInterfaces;
    os.networkInterfaces = function () {
      const result = origIfaces.call(os);
      // Rename Linux-style interface names to Windows-style
      const renamed = {};
      let ethIdx = 0;
      for (const [name, addrs] of Object.entries(result || {})) {
        let newName = name;
        if (/^eth\d+$/.test(name) || /^ens\d+$/.test(name) || /^enp\d+s\d+$/.test(name)) {
          newName = ethIdx === 0 ? 'Ethernet' : `Ethernet ${ethIdx + 1}`;
          ethIdx++;
        }
        renamed[newName] = addrs;
      }
      return renamed;
    };
  } catch (e) {}

  // ---------- 14. NEW: os.cpus() — Windows-like model strings ----------
  try {
    const origCpus = os.cpus;
    os.cpus = function () {
      const cpus = origCpus.call(os);
      // Don't change the speed/times, just normalize the model string
      return cpus.map(c => ({ ...c, model: c.model || 'Intel(R) Xeon(R) CPU @ 2.20GHz' }));
    };
  } catch (e) {}

  // ---------- 15. NEW: os.loadavg() (Linux-only, returns zeros on Windows) ----------
  try {
    os.loadavg = function () { return [0, 0, 0]; };
  } catch (e) {}

  // ---------- 16. NEW: os.constants (Linux has specific signals) ----------
  // Don't fully override — just make sure the signals object looks Windows-like
  try {
    // Windows doesn't have SIGHUP, SIGKILL works differently
    // We just leave this alone — too invasive
  } catch (e) {}

  // ---------- Confirm ----------
  console.log('[PLATFORM-PATCH] process.platform =', process.platform,
              '| os.platform() =', os.platform(),
              '| os.type() =', os.type(),
              '| os.release() =', os.release(),
              '| path.sep =', require('path').sep,
              '| path.delimiter =', require('path').delimiter,
              '| process.execPath =', process.execPath);
} catch (e) {
  console.error('[PLATFORM-PATCH] FAILED to apply patch:', e);
}

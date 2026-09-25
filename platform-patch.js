/**
 * platform-patch.js — Preloaded BEFORE the bot starts.
 *
 * CypherX has an anti-self-hosting check that refuses to run on Linux
 * ("🚫 Platform "Linux" is not allowed! Crashing infinitely...").
 * Render/Railway run Linux, so we spoof a Windows environment before
 * the bot code loads.
 *
 * Loaded via `node --require ./platform-patch.js index.js` in server.js.
 *
 * Patches applied:
 *  1. process.platform         -> 'win32'
 *  2. os.platform()            -> 'win32'
 *  3. os.type()                -> 'Windows_NT'
 *  4. os.release()             -> '10.0.19041' (Windows 10 build 2004)
 *  5. os.homedir()             -> 'C:\\Users\\Administrator'
 *  6. os.userInfo()            -> Windows-style
 *  7. child_process.execSync   -> intercept 'uname' commands, return 'Windows_NT'
 *  8. fs.existsSync/readFileSync -> hide /etc/os-release, /etc/lsb-release,
 *                                   /etc/*-release, /proc/version, /proc/cpuinfo
 *  9. Removes Render/Railway env vars
 * 10. Adds Windows env vars (PROCESSOR_ARCHITECTURE, ProgramFiles, etc.)
 */

try {
  // ---------- 1. process.platform ----------
  Object.defineProperty(process, 'platform', {
    value: 'win32',
    writable: true,
    configurable: true,
    enumerable: true,
  });

  // ---------- 2-4. os module patches ----------
  const os = require('os');
  os.platform  = function () { return 'win32'; };
  os.type      = function () { return 'Windows_NT'; };
  os.release   = function () { return '10.0.19041'; };
  os.endianness = function () { return 'LE'; }; // x64 Windows is little-endian

  // ---------- 5. os.homedir() ----------
  const fakeHome = 'C:\\Users\\Administrator';
  os.homedir = function () { return fakeHome; };
  // Also patch process.env.HOME / USERPROFILE for any code reading these directly
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
    os.userInfo = function (opts) {
      return {
        uid: -1,        // Windows uses SIDs, not numeric uids
        gid: -1,
        username: 'Administrator',
        homedir: fakeHome,
        shell: null,    // Windows has no shell
      };
    };
  } catch (e) {}

  // ---------- 7. child_process.execSync ----------
  // Intercept `uname -s`, `uname -a`, `uname -r` etc. that bots use to
  // detect Linux/macOS.
  try {
    const cp = require('child_process');
    const origExecSync = cp.execSync;
    cp.execSync = function (cmd, opts) {
      if (typeof cmd === 'string' && /(^|\s)uname(\s|$)/i.test(cmd)) {
        // uname -s -> 'Windows_NT'; uname -r -> '10.0.19041'; uname -a -> Windows-like
        if (/-r\b/.test(cmd)) return Buffer.from('10.0.19041');
        if (/-a\b/.test(cmd)) return Buffer.from('Windows_NT cypherx 10.0.19041 x86_64 unknown');
        return Buffer.from('Windows_NT');
      }
      // Block 'cat /etc/os-release' style commands
      if (typeof cmd === 'string' && /\/etc\/(os|lsb|debian|centos|alpine|ubuntu|fedora|redhat|system)-?release/i.test(cmd)) {
        throw new Error('ENOENT');
      }
      return origExecSync.apply(this, arguments);
    };
    // Also patch execFileSync for uname
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

  // ---------- 8. fs patches for Linux-detection files ----------
  try {
    const fs = require('fs');
    const origExistsSync = fs.existsSync;
    const origReadFileSync = fs.readFileSync;

    // Files that uniquely exist on Linux and prove it's Linux
    const linuxOnlyFiles = [
      '/etc/os-release',
      '/etc/lsb-release',
      '/etc/debian_version',
      '/etc/alpine-release',
      '/etc/centos-release',
      '/etc/fedora-release',
      '/etc/redhat-release',
      '/etc/system-release',
      '/etc/issue',
      '/proc/version',
      '/proc/cpuinfo',
      '/proc/meminfo',
      '/proc/self/status',
    ];

    fs.existsSync = function (p) {
      if (typeof p === 'string') {
        for (const f of linuxOnlyFiles) {
          if (p === f || p.startsWith(f)) return false;
        }
      }
      return origExistsSync.apply(this, arguments);
    };

    fs.readFileSync = function (p, opts) {
      if (typeof p === 'string') {
        for (const f of linuxOnlyFiles) {
          if (p === f || p.startsWith(f)) {
            throw Object.assign(new Error(`ENOENT, no such file or directory '${p}'`), { code: 'ENOENT' });
          }
        }
      }
      return origReadFileSync.apply(this, arguments);
    };
  } catch (e) {}

  // ---------- 9. Remove Render/Railway env vars ----------
  const blockedVars = [
    'RENDER',
    'RENDER_SERVICE_ID',
    'RENDER_SERVICE_NAME',
    'RENDER_EXTERNAL_URL',
    'RENDER_DISCOVERY_SERVICE',
    'RAILWAY_SERVICE_ID',
    'RAILWAY_PROJECT_ID',
    'RAILWAY_ENVIRONMENT',
    'RAILWAY_SERVICE_STATIC_URL',
    'RAILWAY_VOLUME_NAME',
    'DYNO',                    // Heroku
    'ON_HEROKU',
    'FLY_ALLOC_ID',            // Fly.io
    'FLY_APP_NAME',
    'VERCEL',                  // Vercel
    'CODESANDBOX',             // CodeSandbox
    'GITPOD_WORKSPACE_ID',     // Gitpod
  ];
  for (const v of blockedVars) {
    delete process.env[v];
  }

  // ---------- 10. Confirm ----------
  console.log('[PLATFORM-PATCH] process.platform =', process.platform,
              '| os.platform() =', os.platform(),
              '| os.type() =', os.type(),
              '| os.release() =', os.release());
} catch (e) {
  console.error('[PLATFORM-PATCH] FAILED to apply patch:', e);
}

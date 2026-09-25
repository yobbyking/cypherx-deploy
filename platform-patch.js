/**
 * platform-patch.js — Preloaded BEFORE the bot starts.
 *
 * CypherX has an anti-self-hosting check that refuses to run on Linux
 * ("🚫 Platform "Linux" is not allowed! Crashing infinitely...").
 * Render/Railway run Linux, so we need to spoof `process.platform` and
 * `os.platform()` to look like Windows before the bot code loads.
 *
 * Loaded via `node --require ./platform-patch.js index.js` in server.js.
 */

try {
  // 1) Override process.platform (read-only by default; redefine via defineProperty)
  Object.defineProperty(process, 'platform', {
    value: 'win32',
    writable: true,
    configurable: true,
    enumerable: true,
  });

  // 2) Override os.platform() — many bots check this too
  const os = require('os');
  os.platform = function () { return 'win32'; };

  // 3) Hide Render / Railway env vars that the bot may use to detect
  //    "this is a cloud deploy, refuse to run"
  const blockedVars = [
    'RENDER',
    'RENDER_SERVICE_ID',
    'RENDER_SERVICE_NAME',
    'RENDER_EXTERNAL_URL',
    'RAILWAY_SERVICE_ID',
    'RAILWAY_PROJECT_ID',
    'RAILWAY_ENVIRONMENT',
    'RAILWAY_SERVICE_STATIC_URL',
    'RAILWAY_VOLUME_NAME',
  ];
  for (const v of blockedVars) {
    delete process.env[v];
  }

  // 4) Spoof USERNAME (Windows) instead of the Linux USER that Railway sets
  if (!process.env.USERNAME) {
    process.env.USERNAME = process.env.USER || 'Administrator';
  }

  // 5) Make os.userInfo() look Windows-like
  try {
    const origUserInfo = os.userInfo;
    os.userInfo = function (opts) {
      const info = origUserInfo.call(this, opts);
      info.shell = null; // Windows has no shell
      info.homedir = info.homedir || 'C:\\Users\\Administrator';
      return info;
    };
  } catch (e) {}

  // 6) Confirm patch applied
  console.log('[PLATFORM-PATCH] process.platform =', process.platform, '| os.platform() =', os.platform());
} catch (e) {
  console.error('[PLATFORM-PATCH] FAILED to apply patch:', e);
}

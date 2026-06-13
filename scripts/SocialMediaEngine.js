// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: pink; icon-glyph: camera;

// Social Media Engine — Core Script
// v0.6.5 - BUILD 2026-06-13
// Instagram follower tracking, change log, history graph, media download

// ─────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────

const APP_NAME       = "Social Media Engine"
const SCRIPT_VERSION = "0.6.8"
const RH_ID          = ""   // RoutineHub shortcut ID — set when published
const GITHUB_BASE    = "https://dastefster.github.io/social-media-engine"
const GITHUB_RAW     = "https://raw.githubusercontent.com/dastefster/social-media-engine/main"
const RH_API_BASE    = "https://routinehub.co/api/v1/shortcuts"

// ─────────────────────────────────────────
// DEV LOGGING SYSTEM
// ─────────────────────────────────────────

// DEV_LOG — session entries (in-memory)
const DEV_LOG = []
let DEV_LOG_PATH = null
const DEV_LOG_DEFAULT_MAX = 50

function devLog(tag, message, data = null) {
  const entry = {
    time: new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
    tag,
    message,
    data: data !== null ? JSON.stringify(data).slice(0, 300) : null
  }
  DEV_LOG.push(entry)
  console.log(`[${entry.time}] [${tag}] ${message}${entry.data ? ` | ${entry.data}` : ""}`)
}

function devLogError(tag, message, error) {
  devLog(tag, `⚠️ ${message}`, { error: error?.message || String(error) })
}

function flushDevLog() {
  if (!DEV_LOG_PATH || DEV_LOG.length === 0) return
  try {
    const config  = getConfig()
    const maxLogs = config.prefs.devLogMaxEntries ?? DEV_LOG_DEFAULT_MAX
    const existing = fmLocal.fileExists(DEV_LOG_PATH)
      ? JSON.parse(fmLocal.readString(DEV_LOG_PATH))
      : []
    const merged = [...existing, ...DEV_LOG].slice(-maxLogs)
    fmLocal.writeString(DEV_LOG_PATH, JSON.stringify(merged, null, 2))
  } catch(e) {
    console.log("DEV LOG flush error: " + e.message)
  }
}

function loadCachedDevLog() {
  if (!DEV_LOG_PATH) return []
  try {
    if (!fmLocal.fileExists(DEV_LOG_PATH)) return []
    return JSON.parse(fmLocal.readString(DEV_LOG_PATH)) ?? []
  } catch { return [] }
}

async function showDevLog() {
  flushDevLog()
  const cached = loadCachedDevLog()
  const all    = cached.length > 0 ? cached : DEV_LOG

  if (all.length === 0) {
    const a = new Alert()
    a.title   = "📋 Dev Log"
    a.message = "No log entries yet."
    a.addAction("OK")
    await a.presentAlert()
    return
  }

  const lines = all.map(e => {
    let line = `[${e.time}] ${e.tag}\n${e.message}`
    if (e.data) line += `\n→ ${e.data}`
    return line
  }).join("\n\n")

  await QuickLook.present(lines, false)
}
// ─────────────────────────────────────────
// FILE MANAGERS & PATHS
// ─────────────────────────────────────────

const fmLocal = FileManager.local()
const fmCloud = FileManager.iCloud()

const LOCAL_BASE  = fmLocal.joinPath(fmLocal.documentsDirectory(), "SocialMediaEngine")
const CONFIG_PATH = fmLocal.joinPath(LOCAL_BASE, "config.json")

// Wire up persistent dev log path
DEV_LOG_PATH = fmLocal.joinPath(LOCAL_BASE, "dev_log.json")

const CLOUD_BASE     = fmCloud.joinPath(fmCloud.documentsDirectory(), "SocialMediaEngine")
const FOLLOWERS_PATH = fmCloud.joinPath(CLOUD_BASE, "followers.json")
const HISTORY_PATH   = fmCloud.joinPath(CLOUD_BASE, "history.json")
const DIFF_LOG_PATH  = fmCloud.joinPath(CLOUD_BASE, "diff_log.json")
const GRAPH_PATH     = fmCloud.joinPath(CLOUD_BASE, "graph.html")

// ─────────────────────────────────────────
// DEFAULT CONFIG
// ─────────────────────────────────────────

const DEFAULT_CONFIG = {
  version:      SCRIPT_VERSION,
  routinehubId: RH_ID,
  firstRun:     true,

  auth: {
    sessionCookies:      "",
    csrfToken:           "",
    appId:               "",
    lsd:                 "",
    userId:              "",
    username:            "",
    lastAuthCheck:       "",
    followersQueryHash:  "",
    followersAPIUrl:     ""
  },

  platforms: {
    instagram: {
      enabled:  true,
      username: ""
    }
    // future platforms added here
  },

  tracking: {
    autoCheckOnLaunch: false,
    notifyOnChange:    true,
    lastChecked:       ""
  },

  download: {
    showSelectionForMultiPosts: true,
    multiPostView:              "List View",   // Grid View | List View | Ask Always
    saveTo:                     "Save to Photos",
    share:                      false,
    mediaDate:                  "Current Date",
    convertVP9:                 "Original (can only be saved to Files)",
    copyCaption:                "No",
    afterDownload:              "Show Main Menu"
  },

  updates: {
    autoUpdateCheck:  true,
    lastUpdateCheck:  "",
    lastSkippedAt:    "",
    shortcutVersion:  "",
    routinehubId:     ""
  },

  prefs: {
    developerMode:     false,
    forceFirstRun:     false,
    devLogMaxEntries:  50
  },

  returnSCName:   "Social Media Engine",

  cachedFileSizes: {
    followers:  0,
    history:    0,
    diffLog:    0,
    graph:      0,
    lastCached: ""
  },

  manageQueue: null,

  devMode: {    platforms: {
      instagram: {
        testURLs: {
          reel:        "https://www.instagram.com/reel/DYfZFcWxojp/?igsh=MTFya2pxazB5Z2diMg==",
          singleImage: "https://www.instagram.com/p/DXPKrops2SS/?igsh=MTg5YTVveWN4aHozMQ==",
          singleVideo: "https://www.instagram.com/reel/DXHySXqDJro/?igsh=MXNyeTAyMGU0MjA1NQ==",
          multiPost:   "https://www.instagram.com/p/DWPLEhhlnRr/?img_index=3&igsh=NHhkcjZiOW5ldmZp"
        }
      }
    }
  }
}

// ─────────────────────────────────────────
// SETUP & CONFIG HELPERS
// ─────────────────────────────────────────

function ensureSetup() {
  if (!fmLocal.fileExists(LOCAL_BASE)) fmLocal.createDirectory(LOCAL_BASE, true)
  if (!fmCloud.fileExists(CLOUD_BASE)) fmCloud.createDirectory(CLOUD_BASE, true)

  if (!fmLocal.fileExists(CONFIG_PATH)) {
    fmLocal.writeString(CONFIG_PATH, JSON.stringify(DEFAULT_CONFIG, null, 2))
  } else {
    const current = JSON.parse(fmLocal.readString(CONFIG_PATH))
    const merged  = deepMerge(DEFAULT_CONFIG, current)
    fmLocal.writeString(CONFIG_PATH, JSON.stringify(merged, null, 2))
  }
}

function getConfig() {
  return JSON.parse(fmLocal.readString(CONFIG_PATH))
}

function saveConfig(config) {
  fmLocal.writeString(CONFIG_PATH, JSON.stringify(config, null, 2))
}

function deepMerge(defaults, current) {
  const result = { ...defaults }
  for (const key of Object.keys(current)) {
    if (
      key in defaults &&
      typeof defaults[key] === "object" &&
      !Array.isArray(defaults[key]) &&
      current[key] !== null &&
      typeof current[key] === "object" &&
      !Array.isArray(current[key])
    ) {
      result[key] = deepMerge(defaults[key], current[key])
    } else {
      result[key] = current[key]
    }
  }
  return result
}

// Sync auth.username → platforms.instagram.username if latter is empty
function syncPlatformUsernames(config) {
  if (config.auth.username && !config.platforms.instagram.username) {
    config.platforms.instagram.username = config.auth.username
    saveConfig(config)
  }
}

function readCloudJSON(path) {
  if (!fmCloud.fileExists(path)) return null
  try { return JSON.parse(fmCloud.readString(path)) } catch { return null }
}

function writeCloudJSON(path, data, sizeKey = null) {
  const str = JSON.stringify(data, null, 2)
  fmCloud.writeString(path, str)
  if (sizeKey) {
    const config = getConfig()
    config.cachedFileSizes[sizeKey] = str.length
    config.cachedFileSizes.lastCached = nowISO()
    saveConfig(config)
  }
}

// ─────────────────────────────────────────
// INPUT PARSING  (same pattern as Schemer)
// ─────────────────────────────────────────

function parseIncomingInput() {
  // Check shortcutParameter first (from Shortcuts SC)
  // Fall back to queryParameters.text (from Safari URL scheme)
  const raw = args.shortcutParameter ?? args.queryParameters?.text ?? null
  devLog("INPUT", `Raw input type: ${typeof raw}`, { hasInput: raw !== null })
  if (!raw) return null
  if (typeof raw === "object") {
    devLog("INPUT", "Input is already object")
    return raw
  }
  // Try direct JSON parse first
  try {
    const parsed = JSON.parse(raw)
    devLog("INPUT", `Parsed JSON input`, { fn: parsed?.fn })
    return parsed
  } catch {
    // Try URL decoding first then parse
    try {
      const decoded = decodeURIComponent(raw)
      const parsed  = JSON.parse(decoded)
      devLog("INPUT", `Parsed URL-decoded JSON input`, { fn: parsed?.fn })
      return parsed
    } catch {
      devLog("INPUT", "Input is plain string, not JSON", { preview: String(raw).slice(0, 100) })
      return null
    }
  }
}

// ─────────────────────────────────────────
// UTILITIES
// ─────────────────────────────────────────

function checkbox(v) { return v ? "☑︎" : "☒" }

function selected(current, value) { return current === value ? " ☑︎" : "" }

function nowISO() { return new Date().toISOString() }

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return "0 B"
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1048576).toFixed(2)} MB`
}

// Relative date + time-since string for last check display
function formatLastChecked(iso) {
  if (!iso) return "Never"

  const then    = new Date(iso)
  const now     = new Date()
  const diffMs  = now - then
  const diffMin = Math.floor(diffMs / 60000)
  const diffHrs = Math.floor(diffMs / 3600000)
  const diffDays= Math.floor(diffMs / 86400000)

  // Format clock time as "h:mma" — e.g. "3:05am"
  const hrs  = then.getHours()
  const mins = then.getMinutes().toString().padStart(2, "0")
  const ampm = hrs >= 12 ? "pm" : "am"
  const h    = hrs % 12 || 12
  const clockStr = `${h}:${mins}${ampm}`

  // Relative label: Today / Yesterday / full date
  const thenDate = new Date(then.getFullYear(), then.getMonth(), then.getDate())
  const todayDate= new Date(now.getFullYear(),  now.getMonth(),  now.getDate())
  const dayDiff  = Math.round((todayDate - thenDate) / 86400000)

  let relLabel
  if (dayDiff === 0)      relLabel = `Today at ${clockStr}`
  else if (dayDiff === 1) relLabel = `Yesterday at ${clockStr}`
  else {
    const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"]
    relLabel = `${months[then.getMonth()]} ${then.getDate()}, ${then.getFullYear()} at ${clockStr}`
  }

  // Time-since string: "X day(s) X hr(s) Xmin ago" — omit zero units
  const sinceparts = []
  if (diffDays > 0)  sinceparts.push(`${diffDays} ${diffDays === 1 ? "day" : "days"}`)
  const remHrs = diffHrs % 24
  if (remHrs > 0)    sinceparts.push(`${remHrs} ${remHrs === 1 ? "hr" : "hrs"}`)
  const remMin = diffMin % 60
  if (remMin > 0 || sinceparts.length === 0) sinceparts.push(`${remMin}min`)

  return `${relLabel} (${sinceparts.join(" ")} ago)`
}

// Build main menu message block
function buildMainMenuMessage(config) {
  const lines = [`${APP_NAME}`, "", "Currently Logged-In Platforms:"]

  // Instagram
  const igUser = config.platforms?.instagram?.username || config.auth?.username || ""
  if (igUser) {
    lines.push(`  • Instagram (@${igUser})`)
  }

  // Future platforms appended here automatically

  if (lines[lines.length - 1] === "Currently Logged-In Platforms:") {
    lines.push("  • None")
  }

  lines.push("")
  lines.push(`Last Check: ${formatLastChecked(config.tracking.lastChecked)}`)

  return lines.join("\n")
}

function runShortcut(payload) {
  const config  = getConfig()
  const scName  = config.returnSCName ?? "Social Media Engine"
  const encoded = encodeURIComponent(JSON.stringify(payload))
  const url     = `shortcuts://run-shortcut?name=${encodeURIComponent(scName)}&input=text&text=${encoded}`
  Safari.open(url)
}

function dotGet(obj, path) {
  return path.split(".").reduce((o, k) => (o ?? {})[k], obj)
}

function dotSet(obj, path, value) {
  const keys = path.split(".")
  let cur = obj
  for (let i = 0; i < keys.length - 1; i++) cur = cur[keys[i]]
  cur[keys[keys.length - 1]] = value
}

// ─────────────────────────────────────────
// NOTIFICATIONS
// ─────────────────────────────────────────

async function notify(title, body = "") {
  const n   = new Notification()
  n.title   = title
  if (body) n.body = body
  n.sound   = null
  await n.schedule()
}

// ─────────────────────────────────────────
// UPDATE CHECKER
// ─────────────────────────────────────────

async function checkForUpdates(silent = true) {
  const config = getConfig()
  if (!config.routinehubId) return false

  if (silent && config.updates.lastSkippedAt) {
    const hoursSince = (Date.now() - new Date(config.updates.lastSkippedAt).getTime()) / 36e5
    if (hoursSince < 24) return false
  }

  try {
    const req  = new Request(`${RH_API_BASE}/${config.routinehubId}/versions/latest`)
    const data = await req.loadJSON()
    const rhVersion = data?.Version ?? null
    if (!rhVersion) return false

    config.updates.lastUpdateCheck = nowISO()
    saveConfig(config)

    if (rhVersion === config.updates.shortcutVersion) return false

    const detailReq  = new Request(`${RH_API_BASE}/${config.routinehubId}`)
    const detailData = await detailReq.loadJSON()
    const notes  = encodeURIComponent(data?.ReleaseNotes ?? "")
    const dlURL  = encodeURIComponent(detailData?.DownloadURL ?? "")
    const current = encodeURIComponent(config.updates.shortcutVersion || SCRIPT_VERSION)
    const updateURL = `${GITHUB_BASE}/html/update.html?version=${rhVersion}&notes=${notes}&dlURL=${dlURL}&appName=${encodeURIComponent(APP_NAME)}&current=${current}`
    Safari.open(updateURL)
    return true

  } catch {
    if (!silent) {
      const a = new Alert()
      a.title   = "Update Check Failed"
      a.message = "Could not reach RoutineHub. Check your connection and try again."
      a.addAction("OK")
      await a.presentAlert()
    }
    return false
  }
}

// ─────────────────────────────────────────
// INSTAGRAM LOGIN (WebView)
// ─────────────────────────────────────────

async function showInstagramLogin() {
  const logoutView = new WebView()
  await logoutView.loadURL("https://www.instagram.com/accounts/logout/")

  const loginView = new WebView()
  await loginView.loadURL("https://www.instagram.com/accounts/login/")
  await loginView.present(true)

  const tokenScript = `
    (function() {
      try {
        const html = document.documentElement.innerHTML;

        // ── csrf_token ──
        const csrf = (html.match(/"csrf_token":"([^"]+)"/) || [])[1] || "";

        // ── App ID — multiple known patterns ──
        const appId =
          (html.match(/"APP_ID":"([^"]+)"/)           || [])[1] ||
          (html.match(/"appId":"([^"]+)"/)             || [])[1] ||
          (html.match(/"X-IG-App-ID":"([^"]+)"/)       || [])[1] ||
          (html.match(/instagramWebDesktopFBAppId='([^']+)'/) || [])[1] || "";

        // ── LSD token ──
        const lsd =
          (html.match(/"LSD",\[\],{"token":"([^"]+)"/) || [])[1] ||
          (html.match(/"lsd_token":"([^"]+)"/)          || [])[1] || "";

        // ── User ID — multiple known patterns ──
        const userId =
          (html.match(/"ds_user_id":"([^"]+)"/)         || [])[1] ||
          (html.match(/"userId":"([^"]+)"/)              || [])[1] ||
          (html.match(/"user_id":"([^"]+)"/)             || [])[1] ||
          (html.match(/"id":"(\d{6,})"/)                 || [])[1] || "";

        // ── Username — multiple known patterns ──
        const uname =
          (html.match(/"username":"([^"]+)"/)            || [])[1] ||
          (html.match(/"viewer_username":"([^"]+)"/)      || [])[1] || "";

        // ── Cookie-based userId fallback ──
        const cookieUserId =
          (document.cookie.match(/(?:^|;\s*)ds_user_id=(\d+)/) || [])[1] || "";

        return JSON.stringify({
          csrf,
          appId,
          lsd,
          userId:   userId || cookieUserId,
          username: uname,
          _raw: {
            hasUserId:   !!(userId || cookieUserId),
            hasCsrf:     !!csrf,
            hasAppId:    !!appId,
            cookieStr:   document.cookie.slice(0, 300)
          }
        });
      } catch(e) { return JSON.stringify({ error: e.message }); }
    })();
  `
  const rawTokens = await loginView.evaluateJavaScript(tokenScript)
  let tokens = {}
  try { tokens = JSON.parse(rawTokens) } catch {}
  const cookies = await loginView.evaluateJavaScript(`document.cookie`) || ""

  // Extract userId from cookies string directly — reliable for FB login flow
  const cookieUserId = (cookies.match(/(?:^|;\s*)ds_user_id=(\d+)/) || [])[1] || ""
  if (!tokens.userId && cookieUserId) tokens.userId = cookieUserId

  // ── Dev mode: show exactly what was captured ──
  const devCfg = getConfig()
  if (devCfg.prefs.developerMode) {
    const dbg = new Alert()
    dbg.title   = "🔍 Token Debug"
    dbg.message =
      `csrf:     ${tokens.csrf     ? "✅" : "❌"} ${tokens.csrf?.slice(0,12) || ""}\n` +
      `appId:    ${tokens.appId    ? "✅" : "❌"} ${tokens.appId?.slice(0,12) || ""}\n` +
      `userId:   ${tokens.userId   ? "✅" : "❌"} ${tokens.userId || ""}\n` +
      `username: ${tokens.username ? "✅" : "❌"} ${tokens.username || ""}\n` +
      `lsd:      ${tokens.lsd      ? "✅" : "❌"}\n\n` +
      `cookies:  ${cookies ? cookies.slice(0,120) : "none"}`
    dbg.addAction("OK")
    await dbg.presentAlert()
  }

  if (!tokens.csrf && !cookies) {
    const a = new Alert()
    a.title   = "Login Issue"
    a.message = "Couldn't capture session data. Make sure you completed the login fully, then try again."
    a.addAction("Try Again")
    a.addCancelAction("Cancel")
    const r = await a.presentAlert()
    if (r === 0) return await showInstagramLogin()
    return false
  }

  const config = getConfig()
  config.auth.csrfToken                  = tokens.csrf     || ""
  config.auth.appId                      = tokens.appId    || ""
  config.auth.lsd                        = tokens.lsd      || ""
  config.auth.userId                     = tokens.userId   || ""
  config.auth.username                   = tokens.username || ""
  config.auth.sessionCookies             = cookies
  config.auth.lastAuthCheck              = nowISO()
  config.firstRun                        = false
  config.prefs.forceFirstRun             = false
  config.platforms.instagram.username    = tokens.username || ""
  saveConfig(config)

  await notify("Login Successful", `Logged in as @${tokens.username || "unknown"}`)
  return true
}

function isAuthenticated() {
  const c = getConfig()
  return !!(c.auth.csrfToken || c.auth.sessionCookies)
}

// ─────────────────────────────────────────
// FIRST RUN
// ─────────────────────────────────────────

async function showFirstRun() {
  Safari.open(`${GITHUB_BASE}/html/welcome.html`)
  await new Promise(r => Timer.schedule(1500, false, r))

  const a = new Alert()
  a.title   = `Welcome to ${APP_NAME}`
  a.message = "To get started, log into Instagram.\n\nYour credentials stay on this device only — never in iCloud."
  a.addAction("🔐 Log In to Instagram")
  a.addCancelAction("Later")

  const choice = await a.presentAlert()
  if (choice === -1) return false
  return await showInstagramLogin()
}

// ─────────────────────────────────────────
// DOWNLOAD INTENT HANDLER
// ─────────────────────────────────────────

async function handleDownloadIntent(url, platform = "instagram", forceAShell = false) {
  const label = platform.charAt(0).toUpperCase() + platform.slice(1)
  const a = new Alert()
  a.title   = "⬇️ Download Media"
  a.message = `${label} URL found:\n${url}`
  a.addAction("Download")
  a.addCancelAction("Main Menu")

  const choice = await a.presentAlert()
  if (choice === -1) return await showMainMenu()
  await showDownloadFlow(url, platform, forceAShell)
}

// ─────────────────────────────────────────
// GENERIC OPTION SUBMENU
// ─────────────────────────────────────────

// options: array of plain strings OR {icon, label} objects
// Saved config value is always the plain label string
// Display format: [icon] Label [☑︎ if selected]
async function showOptionSubmenu(title, options, dotPath) {
  const config  = getConfig()
  const current = dotGet(config, dotPath)

  const normalised = options.map(o =>
    typeof o === "string" ? { icon: "", label: o } : o
  )

  const a = new Alert()
  a.title = title

  for (const { icon, label } of normalised) {
    const sel    = current === label ? " ☑︎" : ""
    const prefix = icon ? `${icon} ` : ""
    a.addAction(`${prefix}${label}${sel}`)
  }
  a.addCancelAction("← Back")

  const choice = await a.presentSheet()
  if (choice === -1) return

  dotSet(config, dotPath, normalised[choice].label)
  saveConfig(config)
}

async function showSaveOptionsSubmenu() {
  const config = getConfig()
  const d      = config.download

  const a = new Alert()
  a.title   = "⬇️ Save Options"

  a.addAction(`Save to Photos${selected(d.saveTo, "Save to Photos")}`)
  a.addAction(`Save to Files${selected(d.saveTo, "Save to Files")}`)
  a.addAction(`Ask Always${selected(d.saveTo, "Ask Always")}`)
  a.addAction(`Share After Download ${checkbox(d.share)}`)
  a.addCancelAction("← Back")

  const choice = await a.presentSheet()
  if (choice === -1) return

  if (choice === 0) {
    config.download.saveTo = "Save to Photos"
    saveConfig(config)
    return await showSaveOptionsSubmenu()
  }
  if (choice === 1) {
    config.download.saveTo = "Save to Files"
    saveConfig(config)
    return await showSaveOptionsSubmenu()
  }
  if (choice === 2) {
    config.download.saveTo = "Ask Always"
    saveConfig(config)
    return await showSaveOptionsSubmenu()
  }
  if (choice === 3) {
    config.download.share = !d.share
    saveConfig(config)
    return await showSaveOptionsSubmenu()
  }
}

// ─────────────────────────────────────────
// DOWNLOADER SETTINGS SUBMENU
// ─────────────────────────────────────────

async function showDownloaderSettings() {
  const config = getConfig()
  const d      = config.download

  const a = new Alert()
  a.title = "⬇️ Download Options"

  a.addAction(`Show Selection for Multi Posts ${checkbox(d.showSelectionForMultiPosts)}`)
  if (d.showSelectionForMultiPosts) {
    a.addAction(`  ⤷ View Multi Post As ▸ ${d.multiPostView}`)
  }
  a.addAction(`  ⤷ Save Options ▸ ${d.saveTo}`)
  a.addAction(`Media Date ▸ ${d.mediaDate}`)
  a.addAction(`Save VP9 Videos As ▸ ${d.convertVP9}`)
  a.addAction(`Copy Caption ▸ ${d.copyCaption}`)
  a.addAction(`After Download(s) Finish ▸ ${d.afterDownload}`)
  a.addCancelAction("← Back")

  const choice = await a.presentSheet()
  let idx = 0

  if (choice === idx++) {
    config.download.showSelectionForMultiPosts = !d.showSelectionForMultiPosts
    saveConfig(config)
    return await showDownloaderSettings()
  }

  if (d.showSelectionForMultiPosts) {
    if (choice === idx++) {
      await showOptionSubmenu(
        "View multi-post items as...",
        [{icon:"📷",label:"Grid View"},{icon:"📋",label:"List View"},{icon:"❔",label:"Ask Always"}],
        "download.multiPostView"
      )
      return await showDownloaderSettings()
    }
  }

  if (choice === idx++) {
    await showSaveOptionsSubmenu()
    return await showDownloaderSettings()
  }

  if (choice === idx++) {
    await showOptionSubmenu(
      "Set downloaded media date to...",
      [{icon:"📆",label:"Date Posted"},{icon:"📅",label:"Current Date"},{icon:"❔",label:"Ask Always"}],
      "download.mediaDate"
    )
    return await showDownloaderSettings()
  }

  if (choice === idx++) {
    await showOptionSubmenu(
      "Save VP9 videos as...",
      [
        {icon:"📁",label:"Original (can only be saved to Files)"},
        {icon:"✨",label:"HEVC (High Quality)"},
        {icon:"⚡",label:"H.264 (Faster)"},
        {icon:"❔",label:"Ask Always"}
      ],
      "download.convertVP9"
    )
    return await showDownloaderSettings()
  }

  if (choice === idx++) {
    await showOptionSubmenu(
      "Copy post caption to clipboard...",
      [{icon:"👍",label:"Yes"},{icon:"👎",label:"No"},{icon:"❔",label:"Ask Always"}],
      "download.copyCaption"
    )
    return await showDownloaderSettings()
  }

  if (choice === idx++) {
    await showOptionSubmenu(
      "After download(s) finish...",
      [
        {icon:"",  label:"Show Main Menu"},
        {icon:"📷",label:"Open Post in Instagram"},
        {icon:"🖼️",label:"Open Photos"},
        {icon:"❔",label:"Ask Always"}
      ],
      "download.afterDownload"
    )
    return await showDownloaderSettings()
  }

  return
}

// ─────────────────────────────────────────
// RESET SUBMENUS
// ─────────────────────────────────────────

async function showResetMenu() {
  const config = getConfig()
  const sizes  = config.cachedFileSizes

  const accountSize = formatBytes(
    (sizes.followers || 0) + (sizes.history || 0) + (sizes.diffLog || 0)
  )
  const settingsSize = formatBytes(
    fmLocal.fileExists(CONFIG_PATH) ? fmLocal.readString(CONFIG_PATH).length : 0
  )
  const totalSize = formatBytes(
    (sizes.followers || 0) + (sizes.history || 0) +
    (sizes.diffLog   || 0) + (sizes.graph  || 0) +
    (fmLocal.fileExists(CONFIG_PATH) ? fmLocal.readString(CONFIG_PATH).length : 0)
  )

  const a = new Alert()
  a.title = "🗑 Reset Data"
  a.addDestructiveAction(`Reset Account Data (${accountSize})`)
  a.addDestructiveAction(`Reset Settings (${settingsSize})`)
  a.addDestructiveAction(`Reset All Data (${totalSize})`)
  a.addCancelAction("← Back")

  const choice = await a.presentAlert()

  if (choice === 0) {
    await confirmReset(
      "This will permanently clear your current followers list, followers history, change log, and login credentials.",
      async () => {
        for (const path of [FOLLOWERS_PATH, HISTORY_PATH, DIFF_LOG_PATH]) {
          if (fmCloud.fileExists(path)) fmCloud.remove(path)
        }
        const c = getConfig()
        c.auth                       = { ...DEFAULT_CONFIG.auth }
        c.platforms.instagram.username = ""
        c.cachedFileSizes            = { ...DEFAULT_CONFIG.cachedFileSizes }
        saveConfig(c)
        await notify("Account data reset")
      }
    )
    return
  }

  if (choice === 1) {
    await confirmReset(
      "This will restore all settings to their defaults. Your account data and followers history will not be affected.",
      async () => {
        const c     = getConfig()
        const auth  = { ...c.auth }
        const sizes = { ...c.cachedFileSizes }
        const fresh = deepMerge(DEFAULT_CONFIG, { auth, cachedFileSizes: sizes })
        saveConfig(fresh)
        await notify("Settings reset to defaults")
      }
    )
    return
  }

  if (choice === 2) {
    await confirmReset(
      "This will permanently clear ALL data — your followers list, history, change log, login credentials, and all settings. This cannot be undone.",
      async () => {
        if (fmLocal.fileExists(CONFIG_PATH)) fmLocal.remove(CONFIG_PATH)
        for (const path of [FOLLOWERS_PATH, HISTORY_PATH, DIFF_LOG_PATH, GRAPH_PATH]) {
          if (fmCloud.fileExists(path)) fmCloud.remove(path)
        }
        ensureSetup()
        await notify("All data reset — re-run to set up again")
        Script.complete()
      }
    )
    return
  }
}

async function confirmReset(message, onConfirm) {
  const a = new Alert()
  a.title   = "‼️ Warning"
  a.message = message
  a.addDestructiveAction("Reset")
  a.addCancelAction("Cancel")
  const choice = await a.presentAlert()
  if (choice === 0) await onConfirm()
}

async function injectMockGraphData() {
  const base   = 499
  const now    = new Date()
  const mock   = []

  // Generate 35 days of realistic-ish follower history
  let count = base - 47
  for (let i = 34; i >= 0; i--) {
    const d = new Date(now)
    d.setDate(d.getDate() - i)
    // Add some variance — mostly small daily changes
    const delta = Math.floor(Math.random() * 7) - 2
    count = Math.max(count + delta, 400)
    // 2-3 entries per day to simulate multiple checks
    mock.push({ timestamp: d.toISOString(), count })
  }
  // Last entry = actual current count
  mock.push({ timestamp: now.toISOString(), count: base })

  writeCloudJSON(HISTORY_PATH, mock, "history")
  devLog("GRAPH", `Injected ${mock.length} mock history entries`)

  const a = new Alert()
  a.title   = "✅ Mock Data Injected"
  a.message = `${mock.length} entries written to history.json spanning 35 days.\n\nOpen Follower History Graph to see the chart.`
  a.addAction("OK")
  await a.presentAlert()
}

// ─────────────────────────────────────────
// DEVELOPER OPTIONS
// ─────────────────────────────────────────

async function showDeveloperOptions() {
  const config   = getConfig()
  const platforms = config.devMode?.platforms ?? {}

  const a = new Alert()
  a.title   = "⚙ Developer Options"
  a.message = "Internal testing tools."

  a.addAction("🔁 Fake First Run")
  a.addAction("🔍 Inspect Saved Auth")
  a.addAction("📋 View Dev Log")
  a.addAction("🗑 Clear Dev Log")
  a.addAction(`📊 Max Log Entries: ${config.prefs.devLogMaxEntries ?? 50}`)
  a.addAction("🔑 Extract Followers Query Hash")
  a.addAction("🧪 Inject Mock Graph Data")
  a.addAction("🔄 Test Update Screen")
  a.addAction("🎬 Force VP9 Convert Test")

  const platformKeys = Object.keys(platforms).filter(p => {
    const username = config.platforms?.[p]?.username || config.auth?.username || ""
    return !!username
  })

  for (const platform of platformKeys) {
    const label = platform.charAt(0).toUpperCase() + platform.slice(1)
    a.addAction(`🧪 Test ${label} Download`)
  }

  a.addCancelAction("← Back")

  const choice = await a.presentSheet()
  if (choice === -1) return

  if (choice === 0) {
    const c = getConfig()
    c.prefs.forceFirstRun = true
    saveConfig(c)
    await notify("First run will trigger on next launch")
    return
  }

  if (choice === 1) {
    const c = getConfig()
    const a2 = new Alert()
    a2.title   = "🔍 Saved Auth"
    a2.message =
      `userId:   ${c.auth.userId   || "❌ EMPTY"}\n` +
      `username: ${c.auth.username || "❌ EMPTY"}\n` +
      `csrfToken:${c.auth.csrfToken ? "✅ set" : "❌ EMPTY"}\n` +
      `appId:    ${c.auth.appId    ? "✅ set" : "❌ EMPTY"}\n` +
      `cookies:  ${c.auth.sessionCookies ? c.auth.sessionCookies.slice(0,100) : "❌ EMPTY"}`
    a2.addAction("OK")
    await a2.presentAlert()
    return
  }

  if (choice === 2) {
    await showDevLog()
    return
  }

  if (choice === 3) {
    if (DEV_LOG_PATH && fmLocal.fileExists(DEV_LOG_PATH)) {
      fmLocal.remove(DEV_LOG_PATH)
    }
    DEV_LOG.length = 0
    await notify("🗑 Dev Log Cleared")
    return
  }

  if (choice === 4) {
    const c = getConfig()
    const current = c.prefs.devLogMaxEntries ?? 50
    const ta = new Alert()
    ta.title   = "📊 Max Log Entries"
    ta.message = `Current: ${current}\nChoose a new limit:`
    ta.addAction("25")
    ta.addAction("50")
    ta.addAction("100")
    ta.addAction("200")
    ta.addCancelAction("Cancel")
    const r = await ta.presentAlert()
    const vals = [25, 50, 100, 200]
    if (r !== -1) {
      c.prefs.devLogMaxEntries = vals[r]
      saveConfig(c)
      await notify(`📊 Max log entries set to ${vals[r]}`)
    }
    return
  }

  if (choice === 5) {
    await extractFollowersQueryHash()
    return
  }

  if (choice === 6) {
    await injectMockGraphData()
    return
  }

  if (choice === 7) {
    // Mock update screen test
    const current = encodeURIComponent(config.updates.shortcutVersion || SCRIPT_VERSION)
    const notes   = encodeURIComponent("• New carousel multi-select with thumbnails\n• Improved download settings\n• History graph improvements\n• Bug fixes and performance improvements")
    const mockURL = `${GITHUB_BASE}/html/update.html?version=1.1.0&notes=${notes}&dlURL=&appName=${encodeURIComponent(APP_NAME)}&current=${current}`
    devLog("DEV", `Opening mock update screen: ${mockURL}`)
    Safari.open(mockURL)
    return
  }

  if (choice === 8) {
    // Force aShellConvert test — fires with a real reel URL regardless of codec
    const testURL = config.devMode?.platforms?.instagram?.testURLs?.reel
      ?? "https://www.instagram.com/reel/DYfZFcWxojp/?igsh=MTFya2pxazB5Z2diMg=="
    devLog("DEV", `Forcing aShellConvert test with URL: ${testURL}`)
    await handleDownloadIntent(testURL, "instagram", true)
    return
  }

  const platformIndex = choice - 9
  if (platformIndex < platformKeys.length) {
    await showPlatformDownloadTest(platformKeys[platformIndex])
  }
}

async function showPlatformDownloadTest(platform) {
  const config   = getConfig()
  const testURLs = config.devMode?.platforms?.[platform]?.testURLs ?? {}
  const label    = platform.charAt(0).toUpperCase() + platform.slice(1)

  const keyLabels = {
    reel:        "Reel",
    singleImage: "Single Post — Image",
    singleVideo: "Single Post — Video",
    multiPost:   "Multi Post"
  }

  const a = new Alert()
  a.title = `🧪 Test ${label} Download`

  const keys = Object.keys(testURLs)
  for (const key of keys) {
    a.addAction(keyLabels[key] ?? key)
  }
  a.addCancelAction("← Back")

  const choice = await a.presentSheet()
  if (choice === -1) return

  // Inject directly into download intent — same path as real trigger
  await handleDownloadIntent(testURLs[keys[choice]], platform)
}

// ─────────────────────────────────────────
// ABOUT
// ─────────────────────────────────────────

async function showAbout() {
  const config = getConfig()
  const sizes  = config.cachedFileSizes

  const localSize  = fmLocal.fileExists(CONFIG_PATH)
    ? fmLocal.readString(CONFIG_PATH).length : 0
  const cloudTotal =
    (sizes.followers || 0) + (sizes.history || 0) +
    (sizes.diffLog   || 0) + (sizes.graph   || 0)
  const totalStorage = formatBytes(localSize + cloudTotal)

  // Build platform account lines
  const platformLines = []
  const igUser = config.platforms?.instagram?.username || config.auth?.username || ""
  if (igUser) platformLines.push(`  • Instagram (@${igUser})`)
  // Future platforms appended here

  const accountBlock = platformLines.length
    ? `Currently Saved Account(s):\n${platformLines.join("\n")}`
    : "No accounts logged in"

  const a = new Alert()
  a.title   = APP_NAME
  a.message =
    `Shortcut Version: ${config.updates.shortcutVersion || "Unknown"}\n` +
    `Script Version: ${SCRIPT_VERSION}\n` +
    `Total Storage: ${totalStorage}\n\n` +
    accountBlock

  a.addAction("OK")
  await a.presentAlert()
}

// ─────────────────────────────────────────
// MAIN SETTINGS MENU
// ─────────────────────────────────────────

async function showSettingsMenu() {
  const config = getConfig()
  const t      = config.tracking
  const u      = config.updates
  const p      = config.prefs

  const a = new Alert()
  a.title = "⚙️ Settings"

  a.addAction(`↺ Auto-Check Followers on Launch ${checkbox(t.autoCheckOnLaunch)}`)
  a.addAction(`🔔 Notify on Follower Change ${checkbox(t.notifyOnChange)}`)
  a.addAction(`↺ Auto Update Check ${checkbox(u.autoUpdateCheck)}`)
  a.addAction("⇪ Check for Updates Now")
  a.addAction("⬇️ Download Options")
  a.addAction("🔐 Re-Authenticate Instagram")
  a.addAction("🗑 Reset Data")
  a.addAction(`⌘ Developer Mode ${checkbox(p.developerMode)}`)

  if (p.developerMode) {
    a.addAction("⚙ Developer Options")
  }

  a.addAction(`ℹ︎ About ${APP_NAME}`)
  a.addCancelAction("← Back")

  const choice = await a.presentSheet()
  let idx = 0

  if (choice === idx++) {
    config.tracking.autoCheckOnLaunch = !t.autoCheckOnLaunch
    saveConfig(config)
    return await showSettingsMenu()
  }

  if (choice === idx++) {
    config.tracking.notifyOnChange = !t.notifyOnChange
    saveConfig(config)
    return await showSettingsMenu()
  }

  if (choice === idx++) {
    config.updates.autoUpdateCheck = !u.autoUpdateCheck
    saveConfig(config)
    return await showSettingsMenu()
  }

  if (choice === idx++) {
    await checkForUpdates(false)
    return await showSettingsMenu()
  }

  if (choice === idx++) {
    await showDownloaderSettings()
    return await showSettingsMenu()
  }

  if (choice === idx++) {
    await showInstagramLogin()
    return await showSettingsMenu()
  }

  if (choice === idx++) {
    await showResetMenu()
    return await showSettingsMenu()
  }

  if (choice === idx++) {
    config.prefs.developerMode = !p.developerMode
    saveConfig(config)
    return await showSettingsMenu()
  }

  if (p.developerMode) {
    if (choice === idx++) {
      await showDeveloperOptions()
      return await showSettingsMenu()
    }
  }

  if (choice === idx++) {
    await showAbout()
    return await showSettingsMenu()
  }

  return
}

// ─────────────────────────────────────────
// MAIN MENU
// ─────────────────────────────────────────

async function showMainMenu() {
  const config = getConfig()

  const a = new Alert()
  a.title   = APP_NAME
  a.message = buildMainMenuMessage(config)

  a.addAction("👥 Check Followers")
  a.addAction("📊 Follower History Graph")
  a.addAction("🔔 Change Log")
  a.addAction("⬇️ Download Media")
  a.addAction("⚙️ Settings")
  a.addCancelAction("⎋ Exit")

  const choice = await a.presentSheet()

  switch (choice) {
    case 0: await showFollowerCheck();  return await showMainMenu()
    case 1: await showHistoryGraph();   return await showMainMenu()
    case 2: await showChangeLog();      return await showMainMenu()
    case 3: await showDownloadMenu();   return await showMainMenu()
    case 4:
      await showSettingsMenu()
      return await showMainMenu()
    default:
      return
  }
}

// ─────────────────────────────────────────
// FEATURE STUBS
// ─────────────────────────────────────────

// ─────────────────────────────────────────
// FOLLOWER FETCH HELPERS
// ─────────────────────────────────────────

function buildIGHeaders(config) {
  return {
    "x-csrftoken":              config.auth.csrfToken,
    "x-ig-app-id":              config.auth.appId,
    "cookie":                   config.auth.sessionCookies,
    "x-requested-with":         "XMLHttpRequest",
    "x-ig-www-claim":           "0",
    "x-instagram-ajax":         "1",
    "origin":                   "https://www.instagram.com",
    "referer":                  `https://www.instagram.com/${config.auth.username}/followers/`,
    "accept":                   "*/*",
    "accept-language":          "en-US,en;q=0.9",
    "user-agent":               "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1"
  }
}

// Shared authenticated WebView — reused across all pages in one fetch session
let _igWebView = null

async function getAuthenticatedWebView(config) {
  if (_igWebView) return _igWebView
  devLog("WEBVIEW", "Creating authenticated WebView session")
  const wv = new WebView()
  await wv.loadURL(`https://www.instagram.com/${config.auth.username}/`)
  _igWebView = wv
  devLog("WEBVIEW", "WebView session ready")
  return wv
}

async function fetchFollowersPage(userId, config, after = "") {
  let query = `count=200&search_surface=follow_list_page`
  if (after) query += `&max_id=${encodeURIComponent(after)}`

  const url = `/api/v1/friendships/${userId}/followers/?${query}`
  devLog("FETCH", `Fetching via WebView JS`, { url, after: after || "start" })

  const wv = await getAuthenticatedWebView(config)

  const csrfToken = config.auth.csrfToken.replace(/'/g, "\'")
  const appId     = config.auth.appId.replace(/'/g, "\'")

  const fetchScript = `
    (function() {
      fetch('${url}', {
        method: 'GET',
        credentials: 'include',
        headers: {
          'x-csrftoken': '${csrfToken}',
          'x-ig-app-id': '${appId}',
          'x-requested-with': 'XMLHttpRequest',
          'accept': '*/*'
        }
      })
      .then(r => r.text())
      .then(t => completion(t))
      .catch(e => completion(JSON.stringify({error: e.message})))
    })()
  `

  let rawStr = ""
  try {
    rawStr = await wv.evaluateJavaScript(fetchScript, true)
    devLog("FETCH", `WebView fetch response (${rawStr?.length || 0} chars)`, { preview: rawStr?.slice(0, 200) })
  } catch(e) {
    devLogError("FETCH", "WebView evaluateJavaScript threw", e)
    throw e
  }

  const devCfg = getConfig()
  if (devCfg.prefs.developerMode) {
    const dbg = new Alert()
    dbg.title   = "🔍 API Response"
    dbg.message = (rawStr || "null/empty").slice(0, 500)
    dbg.addAction("OK")
    await dbg.presentAlert()
  }

  try {
    const parsed = JSON.parse(rawStr)
    devLog("FETCH", `Parsed OK`, { status: parsed.status, userCount: parsed.users?.length ?? 0 })
    return parsed
  } catch {
    devLog("FETCH", `JSON parse failed`, { raw: rawStr?.slice(0, 200) })
    return { status: "fail", message: rawStr?.slice(0, 200) }
  }
}

// ─────────────────────────────────────────
// QUERY HASH EXTRACTOR
// ─────────────────────────────────────────

async function extractFollowersQueryHash() {
  const config = getConfig()

  const a = new Alert()
  a.title   = "🔑 Extract API Endpoint"
  a.message = "This will load your followers page. When the followers list appears, scroll it a little, then tap Done.\n\nThe script will capture the live API endpoint Instagram uses."
  a.addAction("Open WebView")
  a.addCancelAction("Cancel")
  const r = await a.presentAlert()
  if (r === -1) return

  const wv = new WebView()

  // Inject XHR/fetch interceptor BEFORE page loads
  const interceptScript = `
    window.__sme_captured = [];
    const origOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function(method, url) {
      if (url && (
        url.includes('followers') ||
        url.includes('graphql') ||
        url.includes('friendships') ||
        url.includes('api/v1')
      )) {
        window.__sme_captured.push({ method, url });
      }
      return origOpen.apply(this, arguments);
    };
    const origFetch = window.fetch;
    window.fetch = function(url, opts) {
      const u = typeof url === 'string' ? url : url?.url || '';
      if (u && (
        u.includes('followers') ||
        u.includes('graphql') ||
        u.includes('friendships') ||
        u.includes('api/v1')
      )) {
        window.__sme_captured.push({ method: opts?.method || 'GET', url: u });
      }
      return origFetch.apply(this, arguments);
    };
    true;
  `

  await wv.loadURL(`https://www.instagram.com/${config.auth.username}/followers/`)

  // Inject interceptor after load
  await wv.evaluateJavaScript(interceptScript)
  await wv.present(false)

  // After user scrolls + dismisses, collect captured URLs
  const capturedRaw = await wv.evaluateJavaScript(`JSON.stringify(window.__sme_captured || [])`)
  let captured = []
  try { captured = JSON.parse(capturedRaw) } catch {}

  devLog("HASH", `Captured ${captured.length} API calls`, { urls: captured.map(c => c.url.slice(0,80)) })

  if (captured.length === 0) {
    const a2 = new Alert()
    a2.title   = "❌ No API Calls Captured"
    a2.message = "No follower API calls were intercepted.\n\nMake sure you scrolled the followers list before tapping Done."
    a2.addAction("OK")
    await a2.presentAlert()
    return
  }

  // Find the most relevant URL
  const followerURL = captured.find(c =>
    c.url.includes("followers") || c.url.includes("friendships")
  )?.url || captured[0].url

  devLog("HASH", `Best candidate URL: ${followerURL}`)

  // Try to extract query_hash from URL if present
  const hashMatch = followerURL.match(/query_hash=([a-f0-9]{32})/)
  if (hashMatch) {
    const hash = hashMatch[1]
    const c = getConfig()
    c.auth.followersQueryHash = hash
    c.auth.followersAPIUrl    = followerURL.split("?")[0]
    saveConfig(c)
    devLog("HASH", `Saved hash: ${hash}`)

    const a3 = new Alert()
    a3.title   = "✅ Hash Saved"
    a3.message = `Saved query hash:\n${hash}\n\nTry Check Followers now.`
    a3.addAction("OK")
    await a3.presentAlert()
    return
  }

  // No hash in URL — save the full base URL for direct use
  const c = getConfig()
  c.auth.followersAPIUrl    = followerURL.split("?")[0]
  c.auth.followersQueryHash = "intercepted"
  saveConfig(c)
  devLog("HASH", `Saved API URL: ${followerURL.slice(0,100)}`)

  const a4 = new Alert()
  a4.title   = "✅ Endpoint Captured"
  a4.message = `Captured live API endpoint:\n${followerURL.slice(0, 150)}\n\nTry Check Followers now.`
  a4.addAction("OK")
  await a4.presentAlert()
}

// ─────────────────────────────────────────
// HISTORY LOG HELPER
// ─────────────────────────────────────────

function updateHistory(followerCount) {
  const history = readCloudJSON(HISTORY_PATH) ?? []
  history.push({ timestamp: nowISO(), count: followerCount })
  writeCloudJSON(HISTORY_PATH, history, "history")
}

// ─────────────────────────────────────────
// DIFF LOG HELPER
// ─────────────────────────────────────────

function appendDiffLog(followed, unfollowed, timestamp) {
  const log = readCloudJSON(DIFF_LOG_PATH) ?? []
  if (followed.length > 0) {
    log.push({
      timestamp,
      type:     "followed",
      accounts: followed.map(f => ({ username: f.username, fullName: f.fullName }))
    })
  }
  if (unfollowed.length > 0) {
    log.push({
      timestamp,
      type:     "unfollowed",
      accounts: unfollowed.map(f => ({ username: f.username, fullName: f.fullName }))
    })
  }
  writeCloudJSON(DIFF_LOG_PATH, log, "diffLog")
}

// ─────────────────────────────────────────
// FOLLOWER CHECK — MAIN ENTRY
// ─────────────────────────────────────────

async function showFollowerCheck() {
  const config = getConfig()
  devLog("FOLLOWERS", "showFollowerCheck() called")

  if (!isAuthenticated()) {
    devLog("FOLLOWERS", "Not authenticated — aborting")
    const a = new Alert()
    a.title   = "Not Logged In"
    a.message = "Log into Instagram to check your followers."
    a.addAction("🔐 Log In")
    a.addCancelAction("Cancel")
    const r = await a.presentAlert()
    if (r === 0) await showInstagramLogin()
    return
  }

  const headers = buildIGHeaders(config)
  const userId  = config.auth.userId
  devLog("FOLLOWERS", `Auth OK — userId: ${userId}, username: ${config.auth.username}`)

  if (!userId) {
    devLog("FOLLOWERS", "userId missing from config — aborting")
    const a = new Alert()
    a.title   = "⚠️ Missing User ID"
    a.message = "Could not find your Instagram user ID. Try re-authenticating in Settings."
    a.addAction("⚙️ Go to Settings")
    a.addCancelAction("Cancel")
    const r = await a.presentAlert()
    if (r === 0) await showSettingsMenu()
    return
  }

  let allFetched = []
  let cursor     = ""
  let hasMore    = true

  await notify("👥 Fetching Followers", "Starting fetch…")

  while (hasMore) {
    try {
      const page = await fetchFollowersPage(userId, config, cursor)

      if (!page || page.status === "fail") {
        const a = new Alert()
        a.title   = "⚠️ Fetch Failed"
        a.message = "Instagram returned an error. Your session may have expired.\n\nTry re-authenticating in Settings."
        a.addAction("⚙️ Go to Settings")
        a.addCancelAction("Cancel")
        const r = await a.presentAlert()
        if (r === 0) await showSettingsMenu()
        return
      }

      if (page.status === "needsHash") {
        const a = new Alert()
        a.title   = "🔑 Setup Required"
        a.message = "A one-time setup step is needed to fetch followers.\n\nGo to Settings → Developer Options → Extract Followers Query Hash."
        a.addAction("⚙️ Go to Settings")
        a.addCancelAction("Cancel")
        const r = await a.presentAlert()
        if (r === 0) await showSettingsMenu()
        return
      }

      const users = page.users ?? []
      for (const u of users) {
        allFetched.push({
          username:  u.username        || "",
          fullName:  u.full_name       || "",
          profURL:   `https://www.instagram.com/${u.username}/`,
          pfpURL:    u.profile_pic_url || "",
          firstSeen: nowISO(),
          lastSeen:  nowISO()
        })
      }

      const fetched = allFetched.length
      cursor  = page.next_max_id ?? ""
      hasMore = !!cursor && users.length > 0

    } catch (e) {
      const a = new Alert()
      a.title   = "⚠️ Network Error"
      a.message = `Something went wrong:\n${e.message}`
      a.addAction("Retry")
      a.addCancelAction("Cancel")
      const r = await a.presentAlert()
      if (r !== 0) return
      // retry: loop continues
    }
  }

  // Reset WebView session after fetch completes
  _igWebView = null

  // Merge with existing DB to preserve firstSeen timestamps
  const existingDB  = readCloudJSON(FOLLOWERS_PATH) ?? []
  const existingMap = {}
  for (const f of existingDB) existingMap[f.username] = f

  const now   = nowISO()
  const newDB = allFetched.map(f => ({
    ...f,
    firstSeen: existingMap[f.username]?.firstSeen ?? now,
    lastSeen:  now
  }))

  // ── Baseline (first ever check) ──
  if (existingDB.length === 0) {
    writeCloudJSON(FOLLOWERS_PATH, newDB, "followers")
    updateHistory(newDB.length)
    const c = getConfig()
    c.tracking.lastChecked = now
    saveConfig(c)
    await notify(
      "🗃️ Baseline Saved!",
      `🔎 Tracking ${newDB.length} follower${newDB.length === 1 ? "" : "s"}.\nCheck back later to see who's followed/unfollowed you.`
    )
    return
  }

  // ── Diff ──
  const newSet      = new Set(newDB.map(f => f.username))
  const existingSet = new Set(existingDB.map(f => f.username))
  const followed    = newDB.filter(f => !existingSet.has(f.username))
  const unfollowed  = existingDB.filter(f => !newSet.has(f.username))

  // Save updated state
  writeCloudJSON(FOLLOWERS_PATH, newDB, "followers")
  updateHistory(newDB.length)
  appendDiffLog(followed, unfollowed, now)

  const c = getConfig()
  c.tracking.lastChecked = now
  saveConfig(c)

  // ── No changes ──
  if (followed.length === 0 && unfollowed.length === 0) {
    const a = new Alert()
    a.title   = "👥 No Changes"
    a.message = `Still at ${newDB.length} follower${newDB.length === 1 ? "" : "s"}.\nNo new follows or unfollows since last check.`
    a.addAction("OK")
    await a.presentAlert()
    return
  }

  await showDiffResults(followed, unfollowed, newDB.length)
}

// ─────────────────────────────────────────
// DIFF RESULTS DISPLAY
// ─────────────────────────────────────────

async function showDiffResults(followed, unfollowed, totalCount) {
  const fCount  = followed.length
  const uCount  = unfollowed.length
  const lines   = []
  if (fCount > 0) lines.push(`📈 ${fCount} new follower${fCount === 1 ? "" : "s"}`)
  if (uCount > 0) lines.push(`📉 ${uCount} unfollower${uCount === 1 ? "" : "s"}`)
  lines.push(`\nTotal: ${totalCount} follower${totalCount === 1 ? "" : "s"}`)

  const a = new Alert()
  a.title   = "👥 Followers Updated"
  a.message = lines.join("\n")
  a.addAction("☑️ Manage Accounts")
  a.addAction("👀 View Only")
  a.addCancelAction("Done")

  const choice = await a.presentAlert()
  if (choice === 0) await initAccountManagement(followed, unfollowed)
  else if (choice === 1) await showDiffViewOnly(followed, unfollowed)
}

async function showDiffViewOnly(followed, unfollowed) {
  const lines = []
  if (followed.length > 0) {
    lines.push("── New Followers ──")
    for (const f of followed) lines.push(`📈 ${f.username}${f.fullName ? ` (${f.fullName})` : ""}`)
  }
  if (unfollowed.length > 0) {
    if (lines.length > 0) lines.push("")
    lines.push("── Unfollowed You ──")
    for (const f of unfollowed) lines.push(`📉 ${f.username}${f.fullName ? ` (${f.fullName})` : ""}`)
  }
  const a = new Alert()
  a.title   = "👥 Changes"
  a.message = lines.join("\n")
  a.addAction("OK")
  await a.presentAlert()
}

// ─────────────────────────────────────────
// ACCOUNT MANAGEMENT — INIT
// ─────────────────────────────────────────

const PROF_PIC_CAP = 50

async function initAccountManagement(followed, unfollowed) {
  const total  = followed.length + unfollowed.length
  let usePics  = true

  if (total > PROF_PIC_CAP) {
    const a = new Alert()
    a.title   = "📸 Profile Pictures"
    a.message = `${total} account changes found.\n\nDownload profile pictures for the selection menu?`
    a.addAction("📸 Download Pics (slower)")
    a.addAction("⚡ Skip Pics (faster)")
    a.addCancelAction("Cancel")
    const r = await a.presentAlert()
    if (r === -1) return
    usePics = (r === 0)
  }

  const diffPayload = {
    fn:      "selectAccounts",
    version: SCRIPT_VERSION,
    usePics: usePics,
    accounts: { followed, unfollowed }
  }

  // Sync queue to local config before handing off to SC
  saveManageQueue(followed, unfollowed)
  runShortcut(diffPayload)
  Script.complete()
}

// ─────────────────────────────────────────
// ACCOUNT MANAGEMENT — QUEUE
// ─────────────────────────────────────────

function saveManageQueue(followed, unfollowed) {
  const flat = [
    ...followed.map(f   => ({ ...f, diffStatus: "followed" })),
    ...unfollowed.map(f => ({ ...f, diffStatus: "unfollowed" }))
  ]
  const config = getConfig()
  config.manageQueue = {
    accounts:   flat,
    savedAt:    nowISO(),
    totalCount: flat.length,
    remaining:  flat.length
  }
  saveConfig(config)
}

function clearManageQueue() {
  const config = getConfig()
  delete config.manageQueue
  saveConfig(config)
}

function getManageQueue() {
  return getConfig().manageQueue ?? null
}

function isQueueStale(queue) {
  if (!queue?.savedAt) return true
  return (Date.now() - new Date(queue.savedAt).getTime()) / 36e5 > 24
}

async function checkForPendingQueue() {
  const queue = getManageQueue()
  if (!queue) return false

  if (isQueueStale(queue)) {
    clearManageQueue()
    await notify("🗑 Queue Cleared", "Previous account management session expired.")
    return false
  }

  const remaining = queue.accounts?.length ?? 0
  const total     = queue.totalCount ?? remaining

  const a = new Alert()
  a.title   = "⚠️ Unfinished Session"
  a.message = `You were managing ${total} account${total === 1 ? "" : "s"} and have ${remaining} remaining.\n\nWould you like to continue?`
  a.addAction("▶ Continue")
  a.addDestructiveAction("🗑 Cancel & Clear")
  a.addCancelAction("Later")

  const choice = await a.presentAlert()
  if (choice === 0) {
    const followed   = queue.accounts.filter(a => a.diffStatus === "followed")
    const unfollowed = queue.accounts.filter(a => a.diffStatus === "unfollowed")
    await initAccountManagement(followed, unfollowed)
    return true
  }
  if (choice === 1) clearManageQueue()
  return false
}

// ─────────────────────────────────────────
// ACCOUNT MANAGEMENT — PROCESS
// ─────────────────────────────────────────

async function handleManageAccounts(accounts) {
  const total = accounts.length
  const a = new Alert()
  a.title   = `☑️ ${total} Account${total === 1 ? "" : "s"} Selected`
  a.message =
    `To manage selected accounts:\n\n` +
    `1️⃣  First profile will open in Instagram.\n` +
    `2️⃣  Follow or unfollow the user.\n` +
    `3️⃣  Tap the notification or swipe back to Scriptable to continue.\n\n` +
    `🔁 This repeats for each account selected.`
  a.addAction("▶ Continue")
  a.addCancelAction("Cancel")
  const choice = await a.presentAlert()
  if (choice === -1) { clearManageQueue(); return }
  await processNextManagedAccount(accounts)
}

async function handleManageAccount(accounts) {
  await processNextManagedAccount(accounts)
}

async function processNextManagedAccount(accounts) {
  if (!accounts || accounts.length === 0) {
    clearManageQueue()
    await notify("✅ All Accounts Managed!")
    await showMainMenu()
    return
  }

  const current    = accounts[0]
  const remaining  = accounts.slice(1)
  const queueTotal = getManageQueue()?.totalCount ?? accounts.length
  const doneCount  = queueTotal - accounts.length

  // Sync queue with remaining accounts atomically
  const config = getConfig()
  if (config.manageQueue) {
    config.manageQueue.accounts  = remaining.map(a => ({ ...a }))
    config.manageQueue.remaining = remaining.length
    saveConfig(config)
  }

  // Schedule persistent notification with next step payload
  const nextPayload = {
    fn:       "manageAccount",
    version:  SCRIPT_VERSION,
    accounts: remaining
  }
  const notif   = new Notification()
  notif.title   = `🎭 ${current.username} | ${doneCount + 1}/${queueTotal}`
  notif.body    = "👉 Tap here (or swipe back to Scriptable) to continue!"
  notif.sound   = "default"
  notif.openURL = `scriptable:///run?scriptName=${encodeURIComponent("SocialMediaEngine")}&input=${encodeURIComponent(JSON.stringify(nextPayload))}`
  await notif.schedule()

  // Open profile — iOS intercepts instagram.com URLs and opens in app
  Safari.open(current.profURL)
  Script.complete()
}


// ─────────────────────────────────────────
// HISTORY GRAPH
// ─────────────────────────────────────────

const GRAPH_HTML_TEMPLATE = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<title>Followers History</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@700;800&family=Inter:wght@300;400;500;600&display=swap" rel="stylesheet">
<script src="https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js"></script>
<style>
:root {
  --ig-purple:   #5555ce;
  --ig-violet:   #9737be;
  --ig-pink:     #e03567;
  --ig-orange:   #f77737;
  --ig-yellow:   #fdb955;
  --ig-grad:     linear-gradient(135deg,#5555ce 0%,#9737be 25%,#e03567 55%,#f77737 80%,#fdb955 100%);
  --ig-grad-text:linear-gradient(135deg,#8b6fd4 0%,#c45bb8 30%,#e03567 55%,#f77737 80%,#fdb955 100%);
  --accent:      #e03567;
  --accent-glow: rgba(224,53,103,0.3);
  --gain:        #30d158;
  --gain-dim:    rgba(48,209,88,0.15);
  --loss:        #ff453a;
  --loss-dim:    rgba(255,69,58,0.15);
  --bg:          #07070a;
  --bg-card:     #0e0e12;
  --bg-elevated: #14141a;
  --border:      rgba(255,255,255,0.06);
  --text:        #eeeef2;
  --text-muted:  #56566a;
  --text-sec:    #8d8da0;
}
@media (prefers-color-scheme: light) {
  :root {
    --bg:         #f4f4f8;
    --bg-card:    #ffffff;
    --bg-elevated:#ebebf0;
    --border:     rgba(0,0,0,0.07);
    --text:       #12121a;
    --text-muted: #a0a0b8;
    --text-sec:   #5c5c78;
  }
}
*,*::before,*::after{margin:0;padding:0;box-sizing:border-box;}
html{scroll-behavior:smooth;}
body{
  font-family:'Inter',sans-serif;
  background:var(--bg);
  color:var(--text);
  min-height:100vh;
  padding:0 0 env(safe-area-inset-bottom);
}

/* ── HEADER ── */
.header{
  padding:56px 22px 24px;
  position:relative;
}
.header-eyebrow{
  font-size:10px;font-weight:600;letter-spacing:0.2em;
  text-transform:uppercase;color:var(--accent);margin-bottom:8px;
}
.header-title{
  font-family:'DM Sans',sans-serif;
  font-size:clamp(26px,7vw,36px);
  font-weight:800;line-height:1.15;letter-spacing:-0.01em;
  margin-bottom:4px;
}
.gradient-text{
  background:var(--ig-grad-text);
  background-size:300% 300%;
  -webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;
  animation:gradShift 6s ease infinite;
}
@keyframes gradShift{0%{background-position:0% 50%}50%{background-position:100% 50%}100%{background-position:0% 50%}}
.header-sub{font-size:13px;color:var(--text-sec);margin-top:6px;}

/* ── STATS STRIP ── */
.stats-strip{
  display:grid;grid-template-columns:repeat(3,1fr);
  gap:10px;padding:0 22px 20px;
}
.stat-card{
  background:var(--bg-card);border:1px solid var(--border);
  border-radius:14px;padding:13px 12px;
}
.stat-label{font-size:10px;font-weight:500;color:var(--text-muted);letter-spacing:0.08em;text-transform:uppercase;margin-bottom:5px;}
.stat-value{font-family:'DM Sans',sans-serif;font-size:20px;font-weight:800;letter-spacing:-0.02em;line-height:1;}
.stat-value.up{color:var(--gain);}
.stat-value.down{color:var(--loss);}
.stat-value.neutral{
  background:var(--ig-grad-text);
  -webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;
}

/* ── RANGE TABS ── */
.range-tabs{
  display:flex;gap:8px;padding:0 22px 18px;
}
.tab{
  flex:1;padding:9px 4px;border-radius:10px;border:1px solid var(--border);
  background:var(--bg-card);font-size:12px;font-weight:600;color:var(--text-sec);
  cursor:pointer;text-align:center;transition:all 0.2s;
  -webkit-tap-highlight-color:transparent;
}
.tab.active{
  background:var(--ig-grad);border-color:transparent;
  color:#fff;box-shadow:0 4px 16px var(--accent-glow);
  background-size:200% 200%;animation:gradShift 4s ease infinite;
}

/* ── CHART CARD ── */
.chart-card{
  margin:0 22px 18px;background:var(--bg-card);
  border:1px solid var(--border);border-radius:18px;padding:18px 14px 14px;
}
.chart-legend{
  display:flex;gap:16px;margin-bottom:14px;flex-wrap:wrap;
}
.legend-item{display:flex;align-items:center;gap:6px;font-size:11px;color:var(--text-sec);}
.legend-dot{width:8px;height:8px;border-radius:50%;flex-shrink:0;}
.legend-line{width:20px;height:2px;flex-shrink:0;}
.legend-dash{
  width:20px;height:2px;flex-shrink:0;
  background:repeating-linear-gradient(90deg,var(--ig-orange) 0,var(--ig-orange) 4px,transparent 4px,transparent 8px);
}
.chart-wrap{position:relative;height:220px;}

/* ── EMPTY STATE ── */
.empty{
  margin:0 22px;background:var(--bg-card);border:1px solid var(--border);
  border-radius:18px;padding:40px 24px;text-align:center;
}
.empty-icon{font-size:36px;margin-bottom:12px;}
.empty-title{font-family:'DM Sans',sans-serif;font-size:17px;font-weight:700;margin-bottom:6px;}
.empty-body{font-size:13px;color:var(--text-sec);line-height:1.6;}

/* ── FOOTER ── */
.footer{padding:20px 22px 40px;text-align:center;font-size:11px;color:var(--text-muted);}
</style>
</head>
<body>

<div class="header">
  <div class="header-eyebrow">Instagram · @__USERNAME__</div>
  <h1 class="header-title"><span class="gradient-text">Followers History</span></h1>
  <div class="header-sub" id="subline">Loading...</div>
</div>

<div class="stats-strip">
  <div class="stat-card">
    <div class="stat-label">Current</div>
    <div class="stat-value neutral" id="stat-current">—</div>
  </div>
  <div class="stat-card">
    <div class="stat-label">Peak</div>
    <div class="stat-value neutral" id="stat-peak">—</div>
  </div>
  <div class="stat-card">
    <div class="stat-label">Net Change</div>
    <div class="stat-value" id="stat-net">—</div>
  </div>
</div>

<div class="range-tabs">
  <div class="tab active" onclick="setRange('week')">Week</div>
  <div class="tab" onclick="setRange('month')">Month</div>
  <div class="tab" onclick="setRange('all')">All Time</div>
</div>

<div class="chart-card" id="chart-card">
  <div class="chart-legend">
    <div class="legend-item">
      <div class="legend-dot" style="background:#e03567"></div>
      <span>Followers</span>
    </div>
    <div class="legend-item">
      <div class="legend-dash"></div>
      <span>7-day avg</span>
    </div>
    <div class="legend-item">
      <div class="legend-dot" style="background:#30d158;border-radius:2px;width:10px;height:10px;"></div>
      <span>Daily gain</span>
    </div>
    <div class="legend-item">
      <div class="legend-dot" style="background:#ff453a;border-radius:2px;width:10px;height:10px;"></div>
      <span>Daily loss</span>
    </div>
  </div>
  <div class="chart-wrap">
    <canvas id="chart"></canvas>
  </div>
</div>

<div class="footer" id="footer">Generated by Social Media Engine</div>

<script>
// ── INJECTED DATA ──
const RAW_HISTORY = __HISTORY_DATA__;
const USERNAME    = "__USERNAME__";

// ── AGGREGATE TO DAILY ──
function aggregateDaily(entries) {
  const byDay = {};
  for (const e of entries) {
    const d = new Date(e.timestamp);
    const key = \`\${d.getFullYear()}-\${String(d.getMonth()+1).padStart(2,'0')}-\${String(d.getDate()).padStart(2,'0')}\`;
    byDay[key] = e.count; // last value of the day wins
  }
  return Object.entries(byDay)
    .sort(([a],[b]) => a.localeCompare(b))
    .map(([date, count]) => ({ date, count }));
}

// ── RUNNING AVERAGE ──
function runningAvg(data, window = 7) {
  return data.map((_, i) => {
    const slice = data.slice(Math.max(0, i - window + 1), i + 1);
    return Math.round(slice.reduce((s, d) => s + d.count, 0) / slice.length);
  });
}

// ── FILTER BY RANGE ──
function filterRange(data, range) {
  if (range === 'all') return data;
  const days = range === 'week' ? 7 : 30;
  return data.slice(-days);
}

// ── FORMAT DATE ──
function fmtDate(dateStr) {
  const [y, m, d] = dateStr.split('-');
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return \`\${months[parseInt(m)-1]} \${parseInt(d)}\`;
}

// ── FORMAT NUMBER ──
function fmtNum(n) {
  return n >= 1000 ? \`\${(n/1000).toFixed(1)}k\` : String(n);
}

// ── MAIN ──
const allDaily = aggregateDaily(RAW_HISTORY);
let currentRange = 'week';
let chartInst = null;

function buildChart(range) {
  const data = filterRange(allDaily, range);

  if (data.length < 2) {
    document.getElementById('chart-card').style.display = 'none';
    const empty = document.createElement('div');
    empty.className = 'empty';
    empty.innerHTML = \`
      <div class="empty-icon">📊</div>
      <div class="empty-title">Not enough data yet</div>
      <div class="empty-body">Run "Check Followers" at least twice to start building your history graph.</div>
    \`;
    document.querySelector('.range-tabs').after(empty);
    return;
  }

  const labels  = data.map(d => fmtDate(d.date));
  const counts  = data.map(d => d.count);
  const avgs    = runningAvg(data);
  const deltas  = data.map((d, i) => i === 0 ? 0 : d.count - data[i-1].count);
  const barColors = deltas.map(v => v >= 0 ? 'rgba(48,209,88,0.75)' : 'rgba(255,69,58,0.75)');
  const barBorders= deltas.map(v => v >= 0 ? '#30d158' : '#ff453a');

  // Stats
  const current = counts[counts.length - 1];
  const peak    = Math.max(...counts);
  const net     = current - counts[0];
  document.getElementById('stat-current').textContent = fmtNum(current);
  document.getElementById('stat-peak').textContent    = fmtNum(peak);
  const netEl = document.getElementById('stat-net');
  netEl.textContent = (net >= 0 ? '+' : '') + net;
  netEl.className   = \`stat-value \${net > 0 ? 'up' : net < 0 ? 'down' : 'neutral'}\`;

  // Subline
  const span = data[0].date === data[data.length-1].date
    ? fmtDate(data[0].date)
    : \`\${fmtDate(data[0].date)} – \${fmtDate(data[data.length-1].date)}\`;
  document.getElementById('subline').textContent = span;

  // Destroy old chart
  if (chartInst) { chartInst.destroy(); chartInst = null; }

  const ctx = document.getElementById('chart').getContext('2d');

  // Gradient for line
  const grad = ctx.createLinearGradient(0, 0, ctx.canvas.width, 0);
  grad.addColorStop(0,   '#5555ce');
  grad.addColorStop(0.33,'#9737be');
  grad.addColorStop(0.6, '#e03567');
  grad.addColorStop(0.85,'#f77737');
  grad.addColorStop(1,   '#fdb955');

  chartInst = new Chart(ctx, {
    data: {
      labels,
      datasets: [
        {
          type: 'bar',
          label: 'Daily Change',
          data: deltas,
          backgroundColor: barColors,
          borderColor: barBorders,
          borderWidth: 1,
          borderRadius: 4,
          yAxisID: 'yDelta',
          order: 3
        },
        {
          type: 'line',
          label: 'Followers',
          data: counts,
          borderColor: grad,
          borderWidth: 2.5,
          pointBackgroundColor: grad,
          pointRadius: data.length > 14 ? 2 : 4,
          pointHoverRadius: 6,
          tension: 0.4,
          fill: false,
          yAxisID: 'yCount',
          order: 1
        },
        {
          type: 'line',
          label: '7-day avg',
          data: avgs,
          borderColor: '#f77737',
          borderWidth: 1.5,
          borderDash: [5, 4],
          pointRadius: 0,
          pointHoverRadius: 4,
          tension: 0.4,
          fill: false,
          yAxisID: 'yCount',
          order: 2
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#14141a',
          borderColor: 'rgba(224,53,103,0.3)',
          borderWidth: 1,
          titleColor: '#eeeef2',
          bodyColor: '#8d8da0',
          titleFont: { family: 'DM Sans', weight: '700', size: 13 },
          bodyFont: { family: 'Inter', size: 12 },
          padding: 12,
          callbacks: {
            title: items => items[0].label,
            label: item => {
              if (item.datasetIndex === 0) {
                const v = item.raw;
                return \` Daily: \${v >= 0 ? '+' : ''}\${v}\`;
              }
              if (item.datasetIndex === 1) return \` Followers: \${item.raw.toLocaleString()}\`;
              if (item.datasetIndex === 2) return \` 7-day avg: \${item.raw.toLocaleString()}\`;
            }
          }
        }
      },
      scales: {
        x: {
          grid: { color: 'rgba(255,255,255,0.04)' },
          ticks: {
            color: '#56566a', font: { family: 'Inter', size: 10 },
            maxRotation: 45, autoSkip: true, maxTicksLimit: 8
          },
          border: { color: 'rgba(255,255,255,0.06)' }
        },
        yCount: {
          position: 'left',
          grid: { color: 'rgba(255,255,255,0.04)' },
          ticks: {
            color: '#56566a', font: { family: 'Inter', size: 10 },
            callback: v => fmtNum(v)
          },
          border: { color: 'rgba(255,255,255,0.06)' }
        },
        yDelta: {
          position: 'right',
          grid: { drawOnChartArea: false },
          ticks: {
            color: '#56566a', font: { family: 'Inter', size: 10 },
            callback: v => (v >= 0 ? '+' : '') + v
          },
          border: { color: 'rgba(255,255,255,0.06)' }
        }
      }
    }
  });

  // Footer
  document.getElementById('footer').textContent =
    \`Updated \${new Date().toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})} · Social Media Engine\`;
}

function setRange(range) {
  currentRange = range;
  document.querySelectorAll('.tab').forEach(t => {
    t.classList.toggle('active', t.textContent.toLowerCase().startsWith(range === 'all' ? 'all' : range === 'week' ? 'w' : 'm'));
  });
  buildChart(range);
}

// Init
buildChart('week');
</script>
</body>
</html>
`

async function showHistoryGraph() {
  const config  = getConfig()
  const history = readCloudJSON(HISTORY_PATH) ?? []
  devLog("GRAPH", `Building graph with ${history.length} history entries`)

  if (history.length < 2) {
    const a = new Alert()
    a.title   = "📊 Followers History"
    a.message = "Not enough data yet. Run Check Followers at least twice to start building your graph."
    a.addAction("OK")
    await a.presentAlert()
    return
  }

  // Inject data into template
  const username    = config.auth.username || ""
  const historyJSON = JSON.stringify(history)

  let html = GRAPH_HTML_TEMPLATE
    .replace(/__HISTORY_DATA__/g, historyJSON)
    .replace(/__USERNAME__/g, username)

  // Write HTML to iCloud graph path
  fmCloud.writeString(GRAPH_PATH, html)

  // Update cached size
  const c = getConfig()
  c.cachedFileSizes.graph = html.length
  c.cachedFileSizes.lastCached = nowISO()
  saveConfig(c)

  devLog("GRAPH", `Graph written (${html.length} chars) — opening in Safari`)

  // Write to a local temp file and open via WebView (CDN access works in WebView)
  const tempPath = fmLocal.joinPath(LOCAL_BASE, "graph_temp.html")
  fmLocal.writeString(tempPath, html)
  const wv = new WebView()
  await wv.loadURL("file://" + tempPath)
  await wv.present(false)
}

// ─────────────────────────────────────────
// CHANGE LOG VIEWER
// ─────────────────────────────────────────

async function showChangeLog() {
  const log = readCloudJSON(DIFF_LOG_PATH) ?? []
  devLog("CHANGELOG", `Loading change log — ${log.length} entries`)

  if (log.length === 0) {
    const a = new Alert()
    a.title   = "🔔 Change Log"
    a.message = "No changes recorded yet. Run Check Followers a few times to start building your change log."
    a.addAction("OK")
    await a.presentAlert()
    return
  }

  // Sort newest first
  const sorted = [...log].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))

  // Build summary for the main log menu
  await showChangeLogList(sorted)
}

async function showChangeLogList(entries) {
  const a = new Alert()
  a.title   = "🔔 Change Log"
  a.message = `${entries.length} event${entries.length === 1 ? "" : "s"} recorded`

  // Show up to 15 most recent events as menu items
  const display = entries.slice(0, 15)
  for (const entry of display) {
    const d         = new Date(entry.timestamp)
    const dateStr   = d.toLocaleDateString("en-US", { month: "short", day: "numeric" })
    const timeStr   = d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })
    const icon      = entry.type === "followed" ? "📈" : "📉"
    const count     = entry.accounts?.length ?? 0
    const typeLabel = entry.type === "followed"
      ? `${count} new follower${count === 1 ? "" : "s"}`
      : `${count} unfollowed`
    a.addAction(`${icon} ${dateStr} at ${timeStr} · ${typeLabel}`)
  }

  if (entries.length > 15) {
    a.message += ` (showing 15 most recent)`
  }

  a.addDestructiveAction("🗑 Clear Change Log")
  a.addCancelAction("← Back")

  const choice = await a.presentSheet()

  if (choice === -1) return

  // Clear log
  if (choice === display.length) {
    await confirmClearChangeLog()
    return
  }

  // Tapped an entry — show detail
  await showChangeLogEntry(display[choice])
  return await showChangeLogList(entries)
}

async function showChangeLogEntry(entry) {
  const d       = new Date(entry.timestamp)
  const dateStr = d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" })
  const timeStr = d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })
  const icon    = entry.type === "followed" ? "📈" : "📉"
  const label   = entry.type === "followed" ? "New Followers" : "Unfollowed You"
  const accounts = entry.accounts ?? []

  // Build account list
  const accountLines = accounts.map(acc => {
    const name = acc.fullName ? ` (${acc.fullName})` : ""
    return `@${acc.username}${name}`
  }).join("\n")

  const a = new Alert()
  a.title   = `${icon} ${label}`
  a.message = `${dateStr} at ${timeStr}\n\n${accountLines}`

  // Add "Open Profile" option if only one account
  if (accounts.length === 1) {
    a.addAction(`↗ Open @${accounts[0].username}`)
    a.addCancelAction("← Back")
    const choice = await a.presentAlert()
    if (choice === 0) {
      Safari.open(`https://www.instagram.com/${accounts[0].username}/`)
    }
    return
  }

  // Multiple accounts — offer to open each
  for (const acc of accounts) {
    a.addAction(`↗ @${acc.username}`)
  }
  a.addCancelAction("← Back")

  const choice = await a.presentSheet()
  if (choice === -1) return
  Safari.open(`https://www.instagram.com/${accounts[choice].username}/`)
}

async function confirmClearChangeLog() {
  const a = new Alert()
  a.title   = "‼️ Warning"
  a.message = "This will permanently clear your entire change log. This cannot be undone."
  a.addDestructiveAction("Clear")
  a.addCancelAction("Cancel")
  const choice = await a.presentAlert()
  if (choice !== 0) return
  if (fmCloud.fileExists(DIFF_LOG_PATH)) fmCloud.remove(DIFF_LOG_PATH)
  const c = getConfig()
  c.cachedFileSizes.diffLog = 0
  saveConfig(c)
  await notify("🗑 Change Log Cleared")
}

async function showDownloadMenu() {
  const a = new Alert()
  a.title   = "⬇️ Download Media"
  a.message = "Copy an Instagram URL then tap Check Clipboard to continue."
  a.addAction("📋 Check Clipboard")
  a.addCancelAction("Cancel")
  const choice = await a.presentAlert()
  if (choice === -1) return

  const clip = Pasteboard.paste()
  devLog("DL", `Clipboard content`, { preview: clip?.slice(0, 100) })

  if (!clip) {
    const e = new Alert()
    e.title   = "❌ Nothing Found"
    e.message = "Clipboard is empty. Copy an Instagram URL and try again."
    e.addAction("Try Again")
    e.addCancelAction("Back")
    const r = await e.presentAlert()
    if (r === 0) return await showDownloadMenu()
    return
  }

  // Validate Instagram URL via RegEx
  const match = clip.match(/https?:\/\/(www\.)?instagram\.com\/(p|reel|reels|tv|stories\/[^/]+)\/[^\s?&]+/)
  if (!match) {
    const e = new Alert()
    e.title   = "❌ Invalid URL"
    e.message = "No valid Instagram URL detected on clipboard.\n\nMake sure you've copied a post, reel, or story link."
    e.addAction("Try Again")
    e.addCancelAction("Back")
    const r = await e.presentAlert()
    if (r === 0) return await showDownloadMenu()
    return
  }

  const url = match[0]
  devLog("DL", `Valid Instagram URL from clipboard`, { url })
  await handleDownloadIntent(url, "instagram")
}

async function handleDirectDownload(payload) {
  devLog("DL", `handleDirectDownload (image) called`, { url: payload.url?.slice(0, 80) })

  try {
    const req = new Request(payload.url)
    const img = await req.loadImage()

    if (!img) throw new Error("Could not load image from URL")

    if (payload.saveTo === "Save to Photos") {
      Photos.save(img)
      devLog("DL", "Saved image to Photos ✅")
      await notify("✅ Saved to Photos", `Photo by ${payload.user ? "@" + payload.user : "Instagram"} saved to your library.`)
    }

    if (payload.saveTo === "Save to Files") {
      const req2  = new Request(payload.url)
      const data  = await req2.load()
      // Use caption as filename if available, fall back to user_date
      const rawName = payload.caption
        ? payload.caption.slice(0, 50).replace(/[^a-zA-Z0-9 _-]/g, '').trim()
        : `${payload.user || "instagram"}_${payload.dates?.[0] || Date.now()}`
      const filename = `${rawName}.jpg`
      const filePath = fmCloud.joinPath(CLOUD_BASE, filename)
      fmCloud.write(filePath, data)
      devLog("DL", `Saved to Files: ${filename} ✅`)
    }

    const switchTo = payload.switchTo ?? "Show Main Menu"
    if (switchTo === "Open Photos") {
      Safari.open("photos-redirect://")
      Script.complete()
    } else if (switchTo === "Open Post in Instagram") {
      // Fire viewPost back to SC which re-runs script to show post in WebView
      runShortcut({ fn: "viewPost", version: SCRIPT_VERSION, postURL: payload.postURL })
      Script.complete()
    } else {
      await showMainMenu()
      Script.complete()
    }

  } catch(e) {
    devLogError("DL", "handleDirectDownload failed", e)
    const a = new Alert()
    a.title   = "⚠️ Download Failed"
    a.message = `${e.message}\n\nCheck dev log for details.`
    a.addAction("OK")
    await a.presentAlert()
  }
}

// ─────────────────────────────────────────
// DOWNLOAD FLOW — MEDIA URL RESOLUTION
// ─────────────────────────────────────────

const igCheckScript = `
(function() {
  try {
    let h = document.documentElement.innerHTML;

    // Auth check
    if (h.includes('"PolarisViewer",[],{"data":null')) return JSON.stringify({error:'login'});
    if (h.includes('"PolarisPostSecretReelRoot.entrypoint"')) return JSON.stringify({error:'secretreel'});

    // Find embedded media JSON
    let mm = h.match(/.*xdt_api__v1__(?:media__shortcode__web_info|feed__reels_media).*/)?.[0]
              ?.replace(/^<.+?>/,'').replace(/<.+?>$/,'');
    if (!mm) return JSON.stringify({error:'nomedia'});

    let localDate = d => new Date(d.getTime() - (d.getTimezoneOffset() * 60000))
                          .toISOString().replace(/\\....Z|:/g,'');

    let bestImage = (j) => {
      let can = j.image_versions2?.candidates || [];
      return can.reduce((b,c) => (c.width >= b[1] && c.height >= b[2])
        ? [c.url, c.width, c.height] : b, ['',0,0])[0];
    };

    let bestVideo = (v) => (v.candidates || v)
      .reduce((b,c) => (c.width >= b[1] && c.height >= b[2])
        ? [c.url, c.width, c.height] : b, ['',0,0])[0];

    let isVP9 = (manifest) => manifest && manifest.includes('codecs="vp09');

    let j = JSON.parse(mm).require[0][3][0].__bbox.require[0][3][1].__bbox.result.data;
    j = j.xdt_api__v1__media__shortcode__web_info ||
        j.xdt_api__v1__feed__reels_media__connection?.edges?.[0]?.node ||
        j.xdt_api__v1__feed__reels_media?.reels_media?.[0];

    let input = window.location.href.replace(/\\?.*/, '');
    let isReel = /\\/(reels?|tv)\\//.test(input);
    let isStory = input.includes('/stories/');

    let out = { urls:[], urls2:[], dates:[], count:0, vcount:0,
                needsConvert:false, caption:'', user:'' };

    if (!isStory) {
      // Post / Reel
      let p = j.items[0];
      out.user = p.user.username;
      let items = p.carousel_media || [p];

      items.forEach(a => {
        let u, u2;
        if (a.video_versions) {
          out.vcount++;
          u2 = bestVideo(a.video_versions);
          // Check DASH manifest for VP9
          if (a.video_dash_manifest) {
            if (isVP9(a.video_dash_manifest)) out.needsConvert = true;
          }
          u = u2;
        } else {
          u = u2 = bestImage(a);
        }
        out.urls.push(u);
        out.urls2.push(u2);
        let d = localDate(new Date(1000 * (p.taken_at + out.urls.length)));
        out.dates.push(d);
      });

      out.count = out.urls.length;
      out.caption = p.caption ? p.caption.text : '';

    } else {
      // Stories
      out.user = j.user?.username || '';
      (j.items || []).sort((a,b) => a.taken_at - b.taken_at).forEach(a => {
        let u, u2;
        if (a.media_type == 1) {
          u = u2 = bestImage(a);
        } else {
          out.vcount++;
          u2 = bestVideo(a.video_versions || []);
          if (a.video_dash_manifest && isVP9(a.video_dash_manifest)) out.needsConvert = true;
          u = u2;
        }
        out.urls.push(u);
        out.urls2.push(u2);
        out.dates.push(localDate(new Date(1000 * a.taken_at)));
      });
      out.count = out.urls.length;
    }

    return JSON.stringify(out);
  } catch(e) {
    return JSON.stringify({error: e.message});
  }
})();
`

async function resolveMediaURLs(postURL) {
  devLog("DL", `Loading post in WebView: ${postURL}`)

  const wv = new WebView()
  await wv.loadURL(postURL)

  // Give page time to fully render before injecting
  await new Promise(r => Timer.schedule(3, false, r))
  devLog("DL", "Page load complete — injecting igCheck")

  // igCheck uses return (synchronous) not completion() — no async flag
  let raw
  try {
    raw = await wv.evaluateJavaScript(igCheckScript, false)
    devLog("DL", `igCheck raw response`, { preview: String(raw)?.slice(0,200) })
  } catch(e) {
    devLogError("DL", "evaluateJavaScript threw", e)
    return { error: e.message }
  }

  if (!raw) return { error: "nomedia" }

  try {
    return JSON.parse(String(raw))
  } catch {
    return { error: "parse_failed", raw: String(raw).slice(0,200) }
  }
}

async function showDownloadFlow(url, platform, forceAShell = false) {
  try {
    const config = getConfig()
    const d      = config.download ?? {}
    devLog("DL", `showDownloadFlow called`, { url, platform })

  // ── Resolve media URLs ──
  const a1 = new Alert()
  a1.title   = "⬇️ Resolving Media..."
  a1.message = "Fetching media info from Instagram. This may take a moment."
  // Non-blocking notification instead of alert
  await notify("⬇️ Resolving Media", "Fetching media info...")

  const media = await resolveMediaURLs(url)
  devLog("DL", `Media resolved`, { count: media.count, vcount: media.vcount, error: media.error })

  // ── Error handling ──
  if (media.error) {
    const errMsgs = {
      login:      "You need to be logged into Instagram. Try re-authenticating in Settings.",
      secretreel: "This reel is not publicly accessible.",
      nomedia:    "Couldn't find media on this page. The post may have been deleted or is private.",
      parse_failed: "Failed to parse media data from Instagram."
    }
    const a = new Alert()
    a.title   = "⚠️ Download Failed"
    a.message = errMsgs[media.error] || `Error: ${media.error}`
    a.addAction("OK")
    await a.presentAlert()
    return
  }

  if (!media.urls || media.urls.length === 0) {
    const a = new Alert()
    a.title   = "⚠️ No Media Found"
    a.message = "No downloadable media was found at this URL."
    a.addAction("OK")
    await a.presentAlert()
    return
  }

  // ── Single vs multi-post selection ──
  let selectedURLs = media.urls
  let selectedURLs2 = media.urls2

  if (media.count > 1 && d.showSelectionForMultiPosts) {
    // Hand off to SC for multi-select UI
    const multiConvertTo = d.convertVP9
    const multiCmd = multiConvertTo === "H.264 (Faster)"
      ? `ffmpeg -i ~/Documents/ig_temp.mp4 -c:v h264 -tag:v avc1 -c:a copy -y ~/Documents/ig_out.mp4`
      : `ffmpeg -i ~/Documents/ig_temp.mp4 -c:v hevc -tag:v hvc1 -c:a copy -y ~/Documents/ig_out.mp4`
    const payload = {
      fn:           "selectMedia",
      version:      SCRIPT_VERSION,
      urls:         media.urls,
      dates:        media.dates,
      count:        media.count,
      vcount:       media.vcount,
      needsConvert: media.needsConvert,
      convertTo:    multiConvertTo,
      cmd:          multiCmd,
      user:         media.user,
      caption:      media.caption,
      postURL:      url.split('?')[0],
      saveTo:       d.saveTo,
      share:        d.share,
      switchTo:     d.afterDownload
    }
    devLog("DL", `Multi-post — handing off to SC for selection`, { count: media.count })
    runShortcut(payload)
    Script.complete()
    return
  }

  // ── VP9 conversion check ──
  let convertTo = d.convertVP9
  if (media.needsConvert && media.vcount > 0) {
    if (convertTo === "Ask Always") {
      const cv = new Alert()
      cv.title   = "⚠️ VP9 Video Detected"
      cv.message = "This video uses VP9 format which is not compatible with Photos.\n\nConvert to:"
      cv.addAction("HEVC (High Quality)")
      cv.addAction("H.264 (Faster)")
      cv.addAction("Original (save to Files only)")
      cv.addCancelAction("Cancel")
      const r = await cv.presentAlert()
      if (r === -1) return
      convertTo = ["HEVC (High Quality)", "H.264 (Faster)", "Original (can only be saved to Files)"][r]
    }
  }

  // ── Caption copy ──
  if (media.caption) {
    let copyCaption = d.copyCaption
    if (copyCaption === "Ask Always") {
      const cc = new Alert()
      cc.title   = "📋 Copy Caption?"
      cc.message = media.caption.slice(0, 200)
      cc.addAction("Copy")
      cc.addCancelAction("Skip")
      const r = await cc.presentAlert()
      if (r === 0) Pasteboard.copyString(media.caption)
    } else if (copyCaption === "Yes") {
      Pasteboard.copyString(media.caption)
    }
  }

  // ── Build SC download payload ──
  const needsConversion = media.needsConvert &&
    convertTo !== "Original (can only be saved to Files)"

  const baseDlPayload = {
    version:     SCRIPT_VERSION,
    url:         selectedURLs[0],
    dates:       media.dates,
    vcount:      media.vcount,
    user:        media.user,
    caption:     media.caption,
    convertTo:   convertTo,
    saveTo: d.saveTo,
    share:  d.share,
    switchTo:    d.afterDownload,
    postURL:     url.split('?')[0]
  }

  // Choose fn based on media type and conversion needs
  if (forceAShell || (media.needsConvert && convertTo !== "Original (can only be saved to Files)")) {
    // VP9 — needs a-Shell conversion, hand off to SC
    const dlPayload = {
      ...baseDlPayload,
      fn:  "aShellConvert",
      cmd: `ffmpeg -i ~/Documents/ig_temp.mp4 ${convertTo === "H.264 (Faster)" ? "-c:v h264 -tag:v avc1" : "-c:v hevc -tag:v hvc1"} -c:a copy -y ~/Documents/ig_out.mp4`
    }
    devLog("DL", `VP9 detected — sending to SC for a-Shell conversion`)
    runShortcut(dlPayload)
    Script.complete()
  } else if (media.vcount > 0) {
    // Video (non-VP9) — hand off to SC for native Shortcuts download
    const dlPayload = { ...baseDlPayload, fn: "directUrlDL" }
    devLog("DL", `Video detected — sending to SC for native download`)
    runShortcut(dlPayload)
    Script.complete()
  } else {
    // Image — handle entirely in script
    await handleDirectDownload(baseDlPayload)
  }
  } catch(e) {
    devLogError("DL", "showDownloadFlow crashed", e)
    const a = new Alert()
    a.title   = "⚠️ Download Error"
    a.message = `${e.message}\n\nCheck dev log for details.`
    a.addAction("OK")
    await a.presentAlert()
  }
}

// ─────────────────────────────────────────
// MAIN ENTRY POINT
// ─────────────────────────────────────────

async function main() {
  devLog("MAIN", `Script started — v${SCRIPT_VERSION}`)
  ensureSetup()

  const incoming = parseIncomingInput()
  let   config   = getConfig()

  // Sync auth.username → platforms.instagram.username if needed (fixes legacy installs)
  syncPlatformUsernames(config)
  config = getConfig()

  // ── Version sync — save SC name and RH ID, but don't block fn handlers ──
  const incomingVersion = incoming?.shortcutVersion ?? incoming?.version ?? null
  const incomingRHID    = incoming?.routinehubId ?? null
  const incomingSCName  = incoming?.returnSCName ?? "Social Media Engine"

  if (incomingSCName && incomingSCName !== config.returnSCName) {
    config.returnSCName = incomingSCName
    saveConfig(config)
    config = getConfig()
  }

  if (incomingRHID && !config.updates.routinehubId) {
    config.updates.routinehubId = incomingRHID
    saveConfig(config)
    config = getConfig()
    devLog("MAIN", `RoutineHub ID saved: ${incomingRHID}`)
  }

  // ── Handle incoming fn FIRST — version check never blocks a download intent ──
  if (incoming?.fn === "instaDL" && incoming.url) {
    if (!isAuthenticated()) {
      const a = new Alert()
      a.title   = "Not Logged In"
      a.message = "Log into Instagram before downloading."
      a.addAction("🔐 Log In")
      a.addCancelAction("Exit")
      const r = await a.presentAlert()
      if (r === -1) { Script.complete(); return }
      await showInstagramLogin()
    }
    await handleDownloadIntent(incoming.url, "instagram")
    Script.complete()
    return
  }

  if (incoming?.fn === "mainMenu" || !incoming?.fn) {
    // Version check runs here for mainMenu launches only
    if (incomingVersion) {
      devLog("MAIN", `Version check — incoming SC: ${incomingVersion}, stored: ${config.updates.shortcutVersion}`)
      if (incomingVersion !== config.updates.shortcutVersion) {
        devLog("MAIN", `SC version mismatch — triggering update check`)
        config.updates.shortcutVersion = incomingVersion
        saveConfig(config)
        await checkForUpdates(false)
      }
    }
    // Falls through to normal launch flow below
  }

  if (incoming?.fn === "skipUpdate") {
    devLog("MAIN", "Update skipped — setting 24hr cooldown")
    const c = getConfig()
    c.updates.lastSkippedAt = nowISO()
    saveConfig(c)
    await showMainMenu()
    Script.complete()
    return
  }

  if (incoming?.fn === "viewPost" && incoming.postURL) {
    devLog("MAIN", `viewPost — loading: ${incoming.postURL}`)
    const wv = new WebView()
    await wv.loadURL(incoming.postURL)
    await wv.present(false)
    Script.complete()
    return
  }

  if (incoming?.fn === "dlComplete") {
    await showMainMenu()
    Script.complete()
    return
  }

  if (incoming?.fn === "manageAccounts" && Array.isArray(incoming.accounts)) {
    await handleManageAccounts(incoming.accounts)
    Script.complete()
    return
  }

  if (incoming?.fn === "manageAccount" && Array.isArray(incoming.accounts)) {
    await handleManageAccount(incoming.accounts)
    Script.complete()
    return
  }

  // ── First run ──
  if (config.firstRun || config.prefs.forceFirstRun) {
    const success = await showFirstRun()
    if (!success) { Script.complete(); return }
  }

  // ── Auth check ──
  if (!isAuthenticated()) {
    const a = new Alert()
    a.title   = "Not Logged In"
    a.message = "Log into Instagram to use this shortcut."
    a.addAction("🔐 Log In Now")
    a.addCancelAction("Exit")
    const r = await a.presentAlert()
    if (r === -1) { Script.complete(); return }
    const ok = await showInstagramLogin()
    if (!ok) { Script.complete(); return }
  }

  // ── Auto update check ──
  if (config.updates.autoUpdateCheck) {
    await checkForUpdates(true)
  }

  // ── Check for pending account management queue ──
  const queueHandled = await checkForPendingQueue()
  if (queueHandled) return

  // ── Auto follower check on launch ──
  if (config.tracking.autoCheckOnLaunch && config.auth.username && config.auth.userId) {
    await showFollowerCheck()
  }

  await showMainMenu()
  flushDevLog()
  Script.complete()
}

await main()

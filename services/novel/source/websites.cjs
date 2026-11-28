// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { randomBytes, createHash } = require('node:crypto');
const { openStore } = require('../../store.cjs');
const { importFiles } = require('../library.cjs');
const { schedule } = require('../online.cjs');
const bookSite = require('./book-site.cjs');
const catalog = require('./website-catalog.cjs');

const settingsPath = root => path.join(root, 'data', 'config', 'novel-websites.json');
const sourceId = /^[a-f\d]{16}$/;
const watches = new Map();

function websiteUrl(raw) {
  let url;
  try { url = new URL(String(raw ?? '').trim()); }
  catch { throw Error('BOOK_SITE_INVALID_ORIGIN'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.href.length > 2048) {
    throw Error('BOOK_SITE_INVALID_ORIGIN');
  }
  return url.href;
}

function readSites(root) {
  try {
    const sites = JSON.parse(fs.readFileSync(settingsPath(root), 'utf8'));
    return Array.isArray(sites) ? sites.filter(site => sourceId.test(site?.id)) : [];
  } catch (error) {
    if (error.code !== 'ENOENT') return [];
    const { origin, alternate } = bookSite.readConfig(root);
    const sites = [...new Set([origin, alternate].filter(Boolean))].map(url => ({
      id: createHash('sha256').update(url).digest('hex').slice(0, 16), name: new URL(url).hostname, url, mode: 'system'
    }));
    return sites;
  }
}

function writeSites(root, sites) {
  const file = settingsPath(root);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = file + '.' + process.pid + '.tmp';
  fs.writeFileSync(temp, JSON.stringify(sites));
  fs.renameSync(temp, file);
}

function save(root, request) {
  const sites = readSites(root);
  const url = websiteUrl(request.url);
  const existing = sites.find(site => site.id === request.id);
  if (request.id && !existing) throw Error('NOVEL_WEBSITE_NOT_FOUND');
  const mode = ['direct', 'proxy'].includes(request.mode) ? request.mode : 'system';
  if (mode === 'proxy' && !bookSite.readConfig(root).proxy) throw Error('BOOK_SITE_INVALID_PROXY');
  const name = String(request.name || '').trim().slice(0, 60) || new URL(url).hostname;
  const id = existing && new URL(existing.url).origin === new URL(url).origin ? existing.id : randomBytes(8).toString('hex');
  const next = { id, name, url, mode };
  if (existing) sites[sites.indexOf(existing)] = next;
  else sites.push(next);
  writeSites(root, sites);
  return { sites, site: next };
}

function folders(root, id, route = '') {
  const base = path.join(root, 'cache', 'novel-websites', id);
  return { profile: path.join(base, 'browser' + route), incoming: path.join(base, 'downloads'),
    completed: path.join(base, 'imported') };
}

function browserPath() {
  const locations = [process.env.ProgramFiles, process.env['ProgramFiles(x86)'], process.env.LOCALAPPDATA].filter(Boolean);
  for (const vendor of ['Microsoft/Edge/Application/msedge.exe', 'Google/Chrome/Application/chrome.exe']) {
    for (const root of locations) {
      const file = path.join(root, vendor);
      if (fs.existsSync(file)) return file;
    }
  }
  throw Error('NOVEL_WEBSITE_BROWSER_MISSING');
}

function launchArgs(profile, url, proxy, mode) {
  const args = ['--user-data-dir=' + profile, '--no-first-run', '--no-default-browser-check', '--disable-sync'];
  if (mode === 'direct') args.push('--no-proxy-server');
  if (mode === 'proxy') args.push('--proxy-server=' + proxy);
  return [...args, '--new-window', url];
}

function initializeProfile(profile, incoming) {
  const prefs = path.join(profile, 'Default', 'Preferences');
  fs.mkdirSync(path.dirname(prefs), { recursive: true });
  fs.mkdirSync(incoming, { recursive: true });
  if (fs.existsSync(prefs)) return;
  fs.writeFileSync(prefs, JSON.stringify({
    download: { default_directory: incoming, directory_upgrade: true, prompt_for_download: false },
    plugins: { always_open_pdf_externally: true }
  }), { flag: 'wx' });
}

function watchState(root) {
  let state = watches.get(root);
  if (!state) {
    state = { seen: new Map(), completed: new Map(), failed: new Map(), importing: null, timer: null, scanning: false };
    watches.set(root, state);
  }
  return state;
}

const supported = /\.(?:epub|pdf)$/i;
const inProgress = /\.(?:crdownload|part|tmp)$/i;

function entries(folder) {
  try { return fs.readdirSync(folder, { withFileTypes: true }).filter(entry => entry.isFile()); }
  catch (error) { if (error.code === 'ENOENT') return []; throw error; }
}

async function scan(root, runtime) {
  const state = watchState(root);
  if (state.scanning || runtime?.stopped) return;
  state.scanning = true;
  try {
    for (const site of readSites(root)) {
      if (runtime?.stopped) break;
      const { incoming, completed } = folders(root, site.id);
      for (const entry of entries(incoming)) {
        if (!supported.test(entry.name) || runtime?.stopped) continue;
        const filename = path.join(incoming, entry.name);
        const stat = fs.lstatSync(filename,{throwIfNoEntry:false});
        if (!stat?.isFile() || !stat.size) continue;
        const key = stat.size + ':' + stat.mtimeMs;
        const previous = state.seen.get(filename);
        state.seen.set(filename, key);
        if (previous !== key || state.failed.get(filename)?.key === key) continue;
        let db;
        state.importing = site.id;
        try {
          db = openStore(root);
          const catalogue = catalog.catalogueFor(folders(root, site.id, routeFor(root, site)).profile);
          const result = await importFiles(root, db, [filename], { owned: true, catalogue });
          const book = result.imported[0] || result.skipped[0];
          if (!book) throw Error(result.failed[0]?.error || 'NOVEL_PARSE_FAILED');
          if (result.imported.length) schedule(root, runtime, [book.id]);
          fs.mkdirSync(completed, { recursive: true });
          const target = path.join(completed, randomBytes(6).toString('hex') + '-' + entry.name);
          fs.renameSync(filename, target);
          state.seen.delete(filename);
          state.failed.delete(filename);
          state.completed.set(site.id, { bookId: book.id, at: Date.now() });
        } catch (error) {
          state.failed.set(filename, { key, id: site.id, code: error.message });
        } finally {
          db?.close();
          state.importing = null;
        }
      }
    }
  } finally {
    state.scanning = false;
  }
}

function watch(root, runtime) {
  const state = watchState(root);
  if (!runtime || runtime.stopped || state.timer) return;
  state.timer = setInterval(() => {
    if (runtime.stopped) {
      clearInterval(state.timer);
      watches.delete(root);
      return;
    }
    void scan(root, runtime).catch(() => {});
  }, 1600);
  state.timer.unref();
}

function routeFor(root, site) {
  if (site.mode === 'direct') return '-direct';
  if (site.mode === 'proxy') return '-' + createHash('sha256').update(bookSite.readConfig(root).proxy).digest('hex').slice(0, 12);
  return '';
}

function browserOptions(root, id) {
  const site = readSites(root).find(item => item.id === id);
  if (!site) throw Error('NOVEL_WEBSITE_NOT_FOUND');
  const url = websiteUrl(site.url);
  const proxy = bookSite.readConfig(root).proxy;
  if (site.mode === 'proxy' && !proxy) throw Error('BOOK_SITE_INVALID_PROXY');
  // A running Chromium process reuses the profile's network flags. Route-specific profiles avoid stale proxy settings.
  const { profile, incoming } = folders(root, id, routeFor(root, site));
  const browser = browserPath();
  initializeProfile(profile, incoming);
  return { key: profile, binary: browser, args: launchArgs(profile, url, proxy, site.mode).slice(0, -2), url };
}

async function dispatch(request, { root, runtime, db }) {
  const { operation, id } = request;
  if (operation === 'save') return save(root, request);
  if (operation === 'remove') {
    writeSites(root, readSites(root).filter(site => site.id !== id));
    return { sites: readSites(root) };
  }
  if (operation === 'open' || ['browse', 'cover', 'download', 'authenticate', 'authStatus', 'logout'].includes(operation)) {
    const options = browserOptions(root, id);
    const site = readSites(root).find(item => item.id === id);
    const proxy = site?.mode === 'proxy' ? bookSite.readConfig(root).proxy : '';
    options.titleVariants = (query, books) => bookSite.titleVariants(query, { root, runtime, db }, proxy, books);
    if (['open', 'download', 'authenticate'].includes(operation)) watch(root, runtime);
    return catalog.handle(options, { ...request, operation: operation === 'open' ? 'openBrowser' : operation });
  }
  if (operation === 'status') {
    if (!readSites(root).some(site => site.id === id)) throw Error('NOVEL_WEBSITE_NOT_FOUND');
    const state = watchState(root);
    const list = entries(folders(root, id).incoming);
    const incoming = folders(root, id).incoming;
    const failed = list.filter(entry => state.failed.has(path.join(incoming, entry.name))).length;
    return { downloading: list.some(entry => inProgress.test(entry.name)), importing: state.importing === id,
      failed, last: state.completed.get(id) || null };
  }
  return { sites: resume(root, runtime) };
}

function resume(root, runtime) {
  const sites = readSites(root);
  if (sites.some(site => fs.existsSync(folders(root, site.id).incoming))) watch(root, runtime);
  return sites;
}

module.exports = { dispatch, scan, resume };

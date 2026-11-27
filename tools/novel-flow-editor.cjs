// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';

const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { detail, preview, shelf } = require('../services/novel/library.cjs');
const flowSettings = require('../services/novel/flow-settings.cjs');

const root = path.resolve(__dirname, '..');
const previewFiles = new Set([
  'theme.css', 'novel.css', 'novel-page.js', 'novel-i18n.js', 'novel-reader.js', 'novel-reader-controls.js',
  'novel-reader-turn.js', 'novel-reader-selection.js', 'novel-shelf.js', 'novel-flow-liquid.js', 'novel-online.js',
  'synopsis-view.js', 'game-reception.js', 'capsule-spring.js', 'app.css', 'detail.css', 'home-layout.css', 'e255-polish.css', 'reception.css'
]);
const editorFile = path.join(__dirname, 'novel-flow-editor.html');

function queryLibrary(callback) {
  const db = new DatabaseSync(path.join(root, 'data', 'megulit.sqlite'), { readOnly: true });
  try { return callback(db); }
  finally { db.close(); }
}

function startEditor({ port = 4179, settingsRoot = root } = {}) {
  const server = http.createServer(async (req, res) => {
    const host = '127.0.0.1:' + server.address().port;
    const send = (status, body, type = 'application/json') => {
      res.writeHead(status, { 'Content-Type': type + '; charset=utf-8', 'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff' });
      res.end(type === 'application/json' ? JSON.stringify(body) : body);
    };
    if (req.headers.host !== host) return send(403, { error: '请通过本机编辑器地址访问' });

    try {
      const url = new URL(req.url, 'http://' + host);
      if (req.method === 'GET') {
        if (url.pathname === '/' || url.pathname === '/preview') {
          return send(200, fs.readFileSync(editorFile, 'utf8'), 'text/html');
        }
        if (url.pathname === '/settings') {
          return send(200, { fields: flowSettings.fields, settings: flowSettings.read(settingsRoot) });
        }
        if (url.pathname === '/books') {
          const id = url.searchParams.get('id');
          const bookDetail = url.searchParams.has('preview') ? preview : detail;
          const data = queryLibrary(db => id ? bookDetail(db, root, id) : shelf(db, root));
          return send(200, id ? data : { ...data, flowSettings: flowSettings.read(settingsRoot) });
        }
        const file = url.pathname.slice('/web/'.length);
        if (url.pathname.startsWith('/web/') && previewFiles.has(file)) {
          const type = file.endsWith('.js') ? 'text/javascript' : 'text/css';
          return send(200, fs.readFileSync(path.join(root, 'web', file), 'utf8'), type);
        }
      }
      if (req.method === 'POST' && url.pathname === '/settings') {
        if (req.headers.origin !== 'http://' + host || req.headers['content-type'] !== 'application/json') {
          return send(403, { error: '请在编辑器里保存参数' });
        }
        let body = '';
        req.setEncoding('utf8');
        for await (const chunk of req) {
          body += chunk;
          if (body.length > 8192) { send(413, { error: '参数过长' }); return; }
        }
        let values;
        try { values = JSON.parse(body); }
        catch { return send(400, { error: '无法读取参数' }); }
        if (!values || typeof values !== 'object' || Array.isArray(values)) {
          return send(400, { error: '参数格式无效' });
        }
        return send(200, { settings: flowSettings.save(settingsRoot, values) });
      }
      return send(404, { error: '此操作仅在桌面文库中可用' });
    } catch (error) {
      console.error(error.message);
      return send(500, { error: '无法读取书库或保存参数，请查看编辑器的运行日志' });
    }
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => resolve(server));
  });
}

if (require.main === module) {
  startEditor({ port: Number(process.argv[2] ?? 4179) }).then(server => {
    console.log('http://127.0.0.1:' + server.address().port + '/');
  }).catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = { startEditor };

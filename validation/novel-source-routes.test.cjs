// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const https = require('node:https');
const { EventEmitter } = require('node:events');
const { Readable } = require('node:stream');
const test = require('node:test');
const { dispatch } = require('../services/novel/index.cjs');

test('自定义书源的直连、代理及备用地址与目录回退', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'novel-source-routes-'));
  t.after(() => fs.rmSync(root,{recursive:true,force:true}));
  const requests = [];
  const call = (action, fields) => dispatch({action,...fields},{root});
  let primaryWorksWithProxy = false;
  let backupWorks = true;
  t.mock.method(https,'request',(href,options,callback) => {
    const request = new EventEmitter();
    request.end = () => {
      const { hostname } = new URL(href);
      const proxy = options.agent.options.proxyEnv?.HTTPS_PROXY || '';
      requests.push({hostname,proxy});
      const mirrorWorks = hostname === 'mirror.example.org' && backupWorks;
      const primaryWorks = hostname === 'books.example.org' && proxy && primaryWorksWithProxy;
      let data = mirrorWorks || primaryWorks ? {success:true,books:[{id:1,href:'/book/1',title:'日本語',language:'japanese'}]} : null;
      if (hostname === 'openlibrary.org') data = {numFound:1,docs:[{key:'/works/OL123W',title:'日本語',language:['jpn']}]};
      const response = Readable.from([Buffer.from(data ? JSON.stringify(data) : '<html>Browser validation</html>')]);
      response.statusCode = 200;
      response.headers = {'content-type': data ? 'application/json' : 'text/html'};
      callback(response);
    };
    return request;
  });
  const proxy = 'http://127.0.0.1:8080';
  const save = connection => call('novel_source_config',{operation:'save',origin:'https://books.example.org',
    alternate:'https://mirror.example.org',proxy,connection});
  const browse = source => call('novel_discover',{source});
  await save('direct');
  const direct = await browse('book-site');
  assert.equal(direct.host,'https://mirror.example.org');
  assert.equal(direct.connection,'direct');
  assert(requests.every(request => !request.proxy));
  await save('proxy');
  requests.length = 0;
  primaryWorksWithProxy = true;
  assert.equal((await browse('book-site')).host,'https://books.example.org');
  assert(requests.every(request => request.proxy === proxy));
  await save('auto');
  primaryWorksWithProxy = false;
  backupWorks = false;
  const fallback = await browse('auto');
  assert.equal(fallback.provider,'openlibrary');
  assert.equal(fallback.catalog,true);
  assert.equal(fallback.books[0].title,'日本語');
  assert.equal((await browse('book-site')).error,'BOOK_SITE_WEB_REQUIRED');
});

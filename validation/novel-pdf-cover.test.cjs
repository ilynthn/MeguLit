// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const test = require('node:test');
const { deflateSync } = require('node:zlib');
const { startEdge } = require('./library-views-perf.cjs');
const { openStore } = require('../services/store.cjs');
const { dispatch } = require('../services/novel/index.cjs');

const edge = [process.env.MEGULIT_EDGE,
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'].some(file => file && fs.existsSync(file));
const web = path.resolve(__dirname,'../web');
const stream = (content, properties = '') =>
  '<< ' + properties + ' /Length ' + content.length + ' >>\nstream\n' + content + '\nendstream';
function samplePdf() {
  const width = 1800;
  const height = 2400;
  const blue = Buffer.alloc(width * height * 3, Buffer.from([0, 0, 255]));
  const image = stream(deflateSync(blue).toString('latin1'),
    '/Type /XObject /Subtype /Image /Width ' + width + ' /Height ' + height + ' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode');
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Count 2 /Kids [3 0 R 4 0 R] >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 250] /Contents 5 0 R >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 250] /Resources << /XObject << /Scan 7 0 R >> >> /Contents 6 0 R >>',
    stream('1 0 0 rg 0 0 200 250 re f'), stream('q 200 0 0 250 0 0 cm /Scan Do Q'), image
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [];
  objects.forEach((object, i) => { offsets.push(pdf.length); pdf += (i + 1) + ' 0 obj\n' + object + '\nendobj\n'; });
  const xref = pdf.length;
  return pdf + 'xref\n0 8\n0000000000 65535 f \n' + offsets.map(off => String(off).padStart(10,'0') + ' 00000 n \n').join('') +
    'trailer\n<< /Root 1 0 R /Size 8 >>\nstartxref\n' + xref + '\n%%EOF\n';
}

test('PDF 第一页封面、书架读取和连续翻页', {skip:!edge && 'Edge not installed',timeout:60000}, async () => {
  const root = fs.mkdtempSync(path.join(process.env.MEGULIT_WORK || os.tmpdir(),'megulit-pdf-cover-'));
  const db = openStore(root);
  let browser;
  let server;
  const call = (action, params) => dispatch({action,...params},{root,db});
  try {
    const file = path.join(root,'sample.pdf');
    fs.writeFileSync(file,samplePdf(),'latin1');
    const {imported:[{id}]} = await call('novel_import',{paths:[file]});
    assert.equal((await call('novel_detail',{id})).book.cover,'');
    server = http.createServer(async (req,res) => {
      try {
        if (req.url === '/') {
          res.setHeader('Content-Type','text/html; charset=utf-8');
          return res.end('<link rel="stylesheet" href="/novel.css"><div style="height:90vh" id="host"></div><script type="module" src="/fixture.mjs"></script>');
        }
        if (req.url === '/fixture.mjs') {
          res.setHeader('Content-Type','text/javascript; charset=utf-8');
          return res.end("import {createPdfCover,openPdfReader} from '/novel-pdf-reader.js';\n" +
            "const api=async (action,args)=>{const response=await fetch('/api',{method:'POST',body:JSON.stringify({action,...args})});" +
            "if(!response.ok)throw Error(await response.text());return response.json()};" +
            "const id=" + JSON.stringify(id) + ";window.cover=()=>createPdfCover(api,id);" +
            "window.reader=()=>openPdfReader(document.querySelector('#host'),{api,id,esc:String,hasCover:true,onExit:()=>{}});" +
            "window.pageColor=()=>{const c=document.querySelector('.nv-pdf-stage canvas:not([hidden])');" +
            "return c ? [...c.getContext('2d').getImageData(20,20,1,1).data].slice(0,3).join(',') : '';};" +
            "window.turn=key=>dispatchEvent(new KeyboardEvent('keydown',{key,cancelable:true}));");
        }
        if (req.url === '/api') {
          const chunks = [];
          for await (const data of req) chunks.push(data);
          const {action,...args} = JSON.parse(Buffer.concat(chunks));
          assert(['novel_pdf','novel_pdf_cover_save','novel_progress_save'].includes(action));
          res.setHeader('Content-Type','application/json');
          return res.end(JSON.stringify(await call(action,args)));
        }
        const local = path.join(web,req.url);
        assert(local.startsWith(web + path.sep));
        res.setHeader('Content-Type',local.endsWith('.mjs') || local.endsWith('.js') ? 'text/javascript' : local.endsWith('.css') ? 'text/css' : 'application/octet-stream');
        res.end(fs.readFileSync(local));
      } catch (error) { res.statusCode=500; res.end(error.message); }
    });
    await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
    browser = await startEdge(path.join(root,'edge'));
    await browser.send('Page.navigate',{url:'http://127.0.0.1:' + server.address().port});
    for (const deadline = Date.now() + 15000; Date.now() < deadline && !await browser.evaluate('typeof window.cover==="function"');) {
      await new Promise(resolve => setTimeout(resolve,100));
    }
    const result = await browser.evaluate('(async()=>{const cover=await window.cover();if(!cover)return null;const image=new Image();image.src=cover;await image.decode();' +
      'const canvas=document.createElement("canvas");const ctx=canvas.getContext("2d");ctx.drawImage(image,0,0);return {cover,pixel:[...ctx.getImageData(30,30,1,1).data]}})()');
    assert(result,'PDF produced a cover');
    assert(result.pixel[0] > 200 && result.pixel[2] < 30,'red first page was rendered, not the blue second page');
    assert.equal((await call('novel_shelf',{})).books[0].cover,result.cover);
    assert.equal((await call('novel_detail',{id})).book.cover,result.cover);
    const existing=await call('novel_pdf_cover_save',{id,data:Buffer.from('replace').toString('base64')});
    assert.equal(existing.cover,result.cover);
    const waitForColor = async color => {
      for (let attempt = 0; attempt < 60; attempt++) {
        if (await browser.evaluate('pageColor()') === color) return;
        await new Promise(resolve => setTimeout(resolve, 30));
      }
      assert.equal(await browser.evaluate('pageColor()'),color);
    };
    await browser.evaluate('window.pdfReader=reader();true');
    await waitForColor('255,0,0');
    await browser.evaluate('turn("ArrowRight")');
    await waitForColor('0,0,255');
    const burst = await browser.evaluate('(()=>{turn("ArrowLeft");const a=pageColor();turn("ArrowRight");const b=pageColor();turn("ArrowLeft");return [a,b,pageColor()]})()');
    assert.deepEqual(burst,['255,0,0','0,0,255','255,0,0'],'each turn displayed the previously rendered page immediately');
    await browser.evaluate('window.pdfReader.exit()');
  } finally {
    await browser?.stop();
    if (server) await new Promise(resolve => server.close(resolve));
    db.close();
    fs.rmSync(root,{recursive:true,force:true,maxRetries:10,retryDelay:150});
  }
});

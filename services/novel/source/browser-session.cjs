// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';

const { spawn } = require('node:child_process');

async function startBrowser(binary, args, { visible }) {
  const chrome = spawn(binary, [...args, '--remote-debugging-pipe', ...(visible ? [] : ['--headless=new']), 'about:blank'], {
    stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe'], windowsHide: !visible
  });
  const pending = new Map();
  let packet = '';
  let sequence = 0;
  let exited = false;
  const cancel = () => {
    exited = true;
    for (const { finish } of pending.values()) finish(Error('NOVEL_WEBSITE_BROWSER_CLOSED'));
  };
  chrome.once('error', cancel);
  chrome.once('exit', cancel);
  chrome.stdio[3].on('error', cancel);
  chrome.stdio[4].setEncoding('utf8');
  chrome.stdio[4].on('data', text => {
    packet += text;
    for (let index; (index = packet.indexOf('\0')) >= 0;) {
      const frame = packet.slice(0, index);
      packet = packet.slice(index + 1);
      const data = JSON.parse(frame);
      pending.get(data.id)?.finish(data.error ? Error(data.error.message) : null, data.result);
    }
  });

  function send(method, params = {}, sessionId) {
    if (exited) return Promise.reject(Error('NOVEL_WEBSITE_BROWSER_CLOSED'));
    const id = ++sequence;
    return new Promise((resolve, reject) => {
      const finish = (error, value) => {
        clearTimeout(timer);
        pending.delete(id);
        if (error) reject(error);
        else resolve(value);
      };
      const timer = setTimeout(() => finish(Error('NOVEL_WEBSITE_BROWSER_TIMEOUT')), 8500);
      pending.set(id, { finish });
      chrome.stdio[3].write(JSON.stringify({ id, method, params, sessionId }) + '\0', error => {
        if (error) finish(error);
      });
    });
  }
  async function close() {
    if (exited) return;
    const stopped = new Promise(resolve => chrome.once('exit', resolve));
    await send('Browser.close').catch(() => {});
    if (!exited) await stopped;
  }
  try {
    const { targetInfos } = await send('Target.getTargets');
    const page = targetInfos.find(item => item.type === 'page');
    const { targetId } = page || await send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
    const command = (method, params) => send(method, params, sessionId);
    const navigate = url => command('Page.navigate', { url });
    async function windowState(value) {
      const { windowId } = await send('Browser.getWindowForTarget', { targetId });
      await send('Browser.setWindowBounds', { windowId, bounds: { windowState: value } });
      if (value === 'normal') await send('Target.activateTarget', { targetId });
    }
    return {
      visible, navigate, close, exited: () => exited,
      show: () => windowState('normal'), hide: () => windowState('minimized'),
      async evaluate(expression) {
        const result = await command('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
        if (result.exceptionDetails) throw Error('NOVEL_WEBSITE_BROWSER_PAGE');
        return result.result?.value;
      },
      async clear(origin) {
        await command('Storage.clearDataForOrigin', { origin, storageTypes: 'all' });
        await command('Network.clearBrowserCookies');
      },
    };
  } catch (error) {
    await close().catch(() => {});
    throw error;
  }
}

module.exports = { startBrowser };

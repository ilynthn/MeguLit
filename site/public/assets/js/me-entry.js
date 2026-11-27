/* SPDX-License-Identifier: GPL-3.0-or-later */
/* The account button at the right end of the site's top bar (all pages that load this file).
   Signed out: 「登录」 → /me/. Signed in: the account's avatar, or its initial in a crimson ring → /me/.
   It only reads localStorage 'megulit-me-chip' ({n: name, a: avatar data URL}) that /me/ keeps up to date, so it sends no request and
   adds nothing to the first paint. */
(function () {
  var tools = document.querySelector('.top .tools');
  if (!tools || tools.querySelector('.me-chip')) return;
  var LABEL = { zh: '登录', ja: 'ログイン', en: 'Sign in' }, TITLE = { zh: '个人中心', ja: 'マイページ', en: 'My MeguLit' };
  var link = document.createElement('a');
  link.className = 'me-chip'; link.href = '/me/';
  function lang() { var l = ''; try { l = localStorage.getItem('megulit-lang') || ''; } catch (e) { /* private mode */ } if (!/^(zh|ja|en)$/.test(l)) l = /^ja/i.test(navigator.language) ? 'ja' : /^en/i.test(navigator.language) ? 'en' : 'zh'; return l; }
  function paint() {
    var chip = null; try { chip = JSON.parse(localStorage.getItem('megulit-me-chip') || 'null'); } catch (e) { chip = null; }
    var l = lang(); link.textContent = ''; link.removeAttribute('aria-label');
    if (chip && chip.n) {
      link.className = 'me-chip on'; link.setAttribute('aria-label', TITLE[l] + ' · ' + chip.n); link.title = TITLE[l];
      if (typeof chip.a === 'string' && /^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+\/=]+$/.test(chip.a)) { var img = document.createElement('img'); img.alt = ''; img.src = chip.a; link.appendChild(img); }
      else link.textContent = String(chip.n).trim().charAt(0).toUpperCase() || 'M';
    } else { link.className = 'me-chip'; link.textContent = LABEL[l]; link.title = TITLE[l]; }
  }
  paint(); tools.appendChild(link); tools.classList.add('has-chip');
  window.addEventListener('megulit:lang', paint); window.addEventListener('storage', paint);
})();

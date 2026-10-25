/* ============================================================
   icon-uploader.js  (NEXUS アイコン画像のアップロード / 作り直し版)

   流れ:  ① 画像を選ぶ
          ② プレビュー(ドラッグで位置・スライダー/ピンチで拡大。「こんな感じになります」を丸で表示)
          ③ 「完了」ボタンで、はじめて圧縮 → アップロード → 適用
          (キャンセルしたら何も変わらない)

   使い方:
     CBIcon.pick();                      // 画像選択ダイアログを開く(選んだらプレビュー画面へ)
     CBIcon.attach(buttonElement);       // ボタンを押したら pick() するだけ
     window.addEventListener('nexus:icon-changed', e => { e.detail.icon  // 'i:xxxxxxxxxxxxxxxx' });

   つなぎ込み(index.html 側の環境に合わせて、必要なら1回だけ呼ぶ):
     CBIcon.configure({
       getBase:  () => 'https://xxxx.onrender.com',   // バックエンドのURL(config.js の値)
       getToken: () => localStorage.getItem('token')  // ログイン中のJWT
     });
   ============================================================ */
(function () {
  'use strict';

  // ---------- 設定 ----------
  const STAGE = 256;                 // プレビュー枠(CSS px)
  const OUT = 128;                   // 書き出すサイズ(px)。サーバー側の想定と同じ
  const MAX_BYTES = 23000;           // サーバーの ICON_MAX_BYTES(24,000)より少し小さく
  const MAX_FILE_BYTES = 25 * 1024 * 1024;   // 選べる元画像の上限(25MB)
  const MAX_ZOOM = 4;                // 最小倍率の何倍まで拡大できるか

  const cfg = {
    getBase: () => {
      const CB = window.CB || {};
      return CB.apiBase || CB.API_BASE || window.API_BASE || (window.APP_CONFIG && window.APP_CONFIG.API_BASE) ||
             (window.CONFIG && (window.CONFIG.API_BASE || window.CONFIG.apiBase)) || '';
    },
    getToken: () => {
      const CB = window.CB || {};
      if (typeof CB.getToken === 'function') return CB.getToken();
      if (CB.token) return CB.token;
      try { return localStorage.getItem('token') || localStorage.getItem('cb_token') || ''; } catch (e) { return ''; }
    }
  };

  const toast = (m) => { const CB = window.CB; if (CB && CB.toast) CB.toast(m); else console.log(m); };

  // ---------- 小さな道具 ----------
  const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const toBlob = (canvas, type, q) => new Promise(res => canvas.toBlob(res, type, q));

  // 画像ファイルを ImageBitmap(なければ <img>)に。スマホ写真の向き(EXIF)は自動で直す
  async function loadImage(file) {
    if (window.createImageBitmap) {
      try { return await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch (e) { /* 下の方法へ */ }
    }
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.decoding = 'async';
      img.src = url;
      await img.decode();
      return img;
    } finally { setTimeout(() => URL.revokeObjectURL(url), 5000); }
  }
  const sizeOf = (img) => ({ w: img.width || img.naturalWidth, h: img.height || img.naturalHeight });

  // ---------- 圧縮(WebP → だめなら JPEG。24KB以下になるまで画質→サイズの順に下げる) ----------
  async function encodeIcon(draw) {
    const canvas = document.createElement('canvas');
    for (const size of [OUT, 96, 72]) {
      canvas.width = canvas.height = size;
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, size, size);
      draw(ctx, size);
      for (const type of ['image/webp', 'image/jpeg']) {
        for (const q of [0.88, 0.8, 0.7, 0.6, 0.5, 0.4, 0.3]) {
          const blob = await toBlob(canvas, type, q);
          if (!blob || blob.type !== type) break;           // この端末はその形式で書き出せない → 次の形式へ
          if (blob.size <= MAX_BYTES) return blob;
        }
      }
    }
    throw new Error('画像を小さくできませんでした。別の画像でお試しください');
  }

  // ---------- アップロード(適用は、これが成功したときだけ) ----------
  async function uploadIcon(blob) {
    const token = cfg.getToken();
    if (!token) throw new Error('ログインしてからお試しください');
    let res;
    try {
      res = await fetch(cfg.getBase() + '/api/img/upload?kind=icon', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': blob.type },
        body: blob
      });
    } catch (e) { throw new Error('通信に失敗しました。電波の良いところでもう一度お試しください'); }
    let data = {};
    try { data = await res.json(); } catch (e) { /* 空でもOK */ }
    if (!res.ok || data.error) throw new Error(data.error || 'アップロードに失敗しました');
    return data;      // { ok, id, icon:'i:xxxx', size }
  }

  // ---------- 画面 ----------
  let open = false;

  function openEditor(img) {
    if (open) return;
    open = true;
    const { w, h } = sizeOf(img);
    const minScale = Math.max(STAGE / w, STAGE / h);
    const maxScale = minScale * MAX_ZOOM;
    const st = { s: minScale, cx: w / 2, cy: h / 2, busy: false };

    const overlay = el('div', 'icu-overlay');
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', 'アイコンの画像を調整');
    const card = el('div', 'icu-card');
    card.innerHTML =
      '<div class="icu-title">アイコンを決める</div>' +
      '<div class="icu-stagewrap"><canvas class="icu-stage" width="' + STAGE + '" height="' + STAGE + '"></canvas></div>' +
      '<div class="icu-hint">ドラッグで位置、スライダー(2本指)で大きさを調整</div>' +
      '<label class="icu-zoomrow"><span>小</span><input class="icu-zoom" type="range" min="0" max="1000" value="0" aria-label="拡大"><span>大</span></label>' +
      '<div class="icu-prevrow"><div class="icu-prevlabel">こんな感じになります</div>' +
        '<canvas class="icu-pv icu-pv-lg" width="96" height="96"></canvas>' +
        '<canvas class="icu-pv icu-pv-sm" width="40" height="40"></canvas></div>' +
      '<div class="icu-err" role="alert" hidden></div>' +
      '<div class="icu-btns">' +
        '<button type="button" class="icu-btn icu-cancel">キャンセル</button>' +
        '<button type="button" class="icu-btn icu-other">別の画像</button>' +
        '<button type="button" class="icu-btn icu-done">完了</button></div>';
    overlay.appendChild(card);
    document.body.appendChild(overlay);
    document.documentElement.classList.add('icu-lock');

    const stage = card.querySelector('.icu-stage');
    const sctx = stage.getContext('2d');
    const zoom = card.querySelector('.icu-zoom');
    const pvLg = card.querySelector('.icu-pv-lg'), pvSm = card.querySelector('.icu-pv-sm');
    const errBox = card.querySelector('.icu-err');
    const btnDone = card.querySelector('.icu-done'), btnCancel = card.querySelector('.icu-cancel'), btnOther = card.querySelector('.icu-other');

    // 画像を、正方形の枠(size×size)いっぱいに描く
    function drawImage(ctx, size) {
      const k = size / STAGE;
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, (STAGE / 2 - st.cx * st.s) * k, (STAGE / 2 - st.cy * st.s) * k, w * st.s * k, h * st.s * k);
    }
    function fix() {      // 枠から画像がはみ出さないように
      st.s = clamp(st.s, minScale, maxScale);
      const hx = STAGE / 2 / st.s, hy = STAGE / 2 / st.s;
      st.cx = clamp(st.cx, hx, w - hx);
      st.cy = clamp(st.cy, hy, h - hy);
    }
    function render() {
      fix();
      sctx.clearRect(0, 0, STAGE, STAGE);
      drawImage(sctx, STAGE);
      // 丸の外側を暗くして、アイコンに使われる範囲を見せる
      sctx.save();
      sctx.fillStyle = 'rgba(0,0,0,.55)';
      sctx.beginPath();
      sctx.rect(0, 0, STAGE, STAGE);
      sctx.arc(STAGE / 2, STAGE / 2, STAGE / 2 - 2, 0, Math.PI * 2, true);
      sctx.fill('evenodd');
      sctx.lineWidth = 2; sctx.strokeStyle = 'rgba(255,255,255,.85)';
      sctx.beginPath(); sctx.arc(STAGE / 2, STAGE / 2, STAGE / 2 - 2, 0, Math.PI * 2); sctx.stroke();
      sctx.restore();
      for (const c of [pvLg, pvSm]) { const x = c.getContext('2d'); x.clearRect(0, 0, c.width, c.height); drawImage(x, c.width); }
      zoom.value = String(Math.round((st.s - minScale) / (maxScale - minScale || 1) * 1000));
    }

    // ドラッグ / ピンチ
    const pts = new Map();
    let pinch = 0;
    stage.addEventListener('pointerdown', (e) => { stage.setPointerCapture(e.pointerId); pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); pinch = 0; });
    stage.addEventListener('pointermove', (e) => {
      const p = pts.get(e.pointerId); if (!p) return;
      const rect = stage.getBoundingClientRect(), r = STAGE / rect.width;
      if (pts.size === 1) {
        st.cx -= (e.clientX - p.x) * r / st.s;
        st.cy -= (e.clientY - p.y) * r / st.s;
        p.x = e.clientX; p.y = e.clientY;
      } else if (pts.size === 2) {
        p.x = e.clientX; p.y = e.clientY;
        const [a, b] = [...pts.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (pinch) st.s *= d / pinch;
        pinch = d;
      }
      render();
    });
    const up = (e) => { pts.delete(e.pointerId); pinch = 0; };
    stage.addEventListener('pointerup', up); stage.addEventListener('pointercancel', up);
    stage.addEventListener('wheel', (e) => { e.preventDefault(); st.s *= Math.exp(-e.deltaY * 0.0015); render(); }, { passive: false });
    zoom.addEventListener('input', () => { st.s = minScale + (maxScale - minScale) * (Number(zoom.value) / 1000); render(); });

    // 閉じる
    function close() {
      open = false;
      document.removeEventListener('keydown', onKey, true);
      document.documentElement.classList.remove('icu-lock');
      overlay.remove();
      if (img.close) try { img.close(); } catch (e) { /* ImageBitmap の解放 */ }
    }
    function onKey(e) { if (e.key === 'Escape' && !st.busy) { e.stopPropagation(); close(); } }
    document.addEventListener('keydown', onKey, true);
    btnCancel.addEventListener('click', () => { if (!st.busy) close(); });
    overlay.addEventListener('pointerdown', (e) => { if (e.target === overlay && !st.busy) close(); });
    btnOther.addEventListener('click', () => { if (st.busy) return; close(); pick(); });

    // 完了 → ここで初めて圧縮・アップロード・適用
    btnDone.addEventListener('click', async () => {
      if (st.busy) return;
      st.busy = true;
      errBox.hidden = true;
      btnDone.disabled = btnCancel.disabled = btnOther.disabled = true;
      btnDone.textContent = '保存中…';
      try {
        fix();
        const blob = await encodeIcon((ctx, size) => drawImage(ctx, size));
        const data = await uploadIcon(blob);
        window.dispatchEvent(new CustomEvent('nexus:icon-changed', { detail: { icon: data.icon, size: data.size } }));
        const CB = window.CB; if (CB && typeof CB.onIconChanged === 'function') { try { CB.onIconChanged(data.icon); } catch (e) { /* 呼び出し側のエラーは無視 */ } }
        toast('✅ アイコンを変更しました');
        st.busy = false;
        close();
      } catch (e) {
        st.busy = false;
        errBox.textContent = '⚠ ' + (e && e.message ? e.message : 'うまくいきませんでした');
        errBox.hidden = false;
        btnDone.disabled = btnCancel.disabled = btnOther.disabled = false;
        btnDone.textContent = '完了';
      }
    });

    render();
    btnDone.focus();
  }

  // ---------- ① 画像を選ぶ ----------
  function pick() {
    if (open) return;
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.style.display = 'none';
    document.body.appendChild(input);
    input.addEventListener('change', async () => {
      const file = input.files && input.files[0];
      input.remove();
      if (!file) return;
      if (!/^image\//.test(file.type) && !/\.(jpe?g|png|webp|gif|bmp|heic|heif|avif)$/i.test(file.name)) { toast('画像ファイルを選んでください'); return; }
      if (file.size > MAX_FILE_BYTES) { toast('画像が大きすぎます(25MBまで)'); return; }
      try {
        const img = await loadImage(file);
        const { w, h } = sizeOf(img);
        if (!w || !h) throw new Error('empty');
        openEditor(img);
      } catch (e) { toast('この画像は読み込めませんでした(HEICなどは、JPEG/PNGにしてからお試しください)'); }
    });
    input.click();
  }

  function attach(btn) { if (btn) btn.addEventListener('click', pick); }
  function configure(o) { if (o && o.getBase) cfg.getBase = o.getBase; if (o && o.getToken) cfg.getToken = o.getToken; }

  window.CBIcon = { pick, attach, configure };
})();

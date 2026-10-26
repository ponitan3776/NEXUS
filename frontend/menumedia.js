/* =====================================================================
   🎞 メニューの画像/動画 (menumedia.js)  v3.9
   frontend/icons/ に、下のどれかを GitHub に push するだけ。置いていなければ何も起きない(今までの表示のまま)。
     動画: menu.mp4(おすすめ。H.264・音なし) / menu.webm       ← 優先
     画像: menu.jpg / menu.png / menu.webp                    ← 動画が無いとき(動画が読み込めないときの代わりにもなる)
   サイズ: 1278×718(幅・高さとも偶数なので H.264 でOK)。それ以外でも、枠(16:9)に合わせて中央でトリミングされる。
   DB・サーバーは通さない(GitHub Pages から直接読み込む)ので、サイズの制限はサーバーの都合では無い。
   目安: 動画は 数MB〜10MB 以内(読み込みが速く、スマホの通信量も少ない)。GitHub は 1ファイル100MBまで。
   ・音なしで自動再生・ループ。画面が見えていない間(ゲーム中・別タブ)は自動で止まる
   ・「動きを減らす」設定の端末と、データ節約モードのときは、動画を再生せず画像(あれば)だけ出す
   ===================================================================== */
(function(){
  'use strict';
  const BASE = 'icons/';
  const VIDEOS = ['menu.mp4', 'menu.webm'];
  const IMAGES = ['menu.jpg', 'menu.png', 'menu.webp'];
  const box = document.getElementById('heroMedia'), card = document.getElementById('titleCard');
  if(!box || !card) return;

  const reduce = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const saveData = !!(navigator.connection && navigator.connection.saveData);
  const show = (el)=>{ box.replaceChildren(el); box.hidden = false; card.classList.add('has-media'); };

  function tryImage(i){
    if(i >= IMAGES.length) return;                                   // どれも無い → 何もしない(今までの表示)
    const im = new Image();
    im.alt = ''; im.decoding = 'async';
    im.onload = ()=> show(im);
    im.onerror = ()=> tryImage(i + 1);
    im.src = BASE + IMAGES[i];
  }

  function tryVideo(i){
    if(i >= VIDEOS.length){ tryImage(0); return; }                   // 動画が無い/読めない → 画像へ
    const v = document.createElement('video');
    v.muted = true; v.defaultMuted = true; v.loop = true; v.playsInline = true; v.autoplay = false;
    v.setAttribute('playsinline', ''); v.setAttribute('webkit-playsinline', ''); v.setAttribute('aria-hidden', 'true');
    v.disablePictureInPicture = true; v.preload = 'auto';
    v.addEventListener('error', ()=> tryVideo(i + 1), { once: true });
    v.addEventListener('loadeddata', ()=>{
      show(v);
      // 画面に見えているときだけ再生(ゲーム中・別タブ・スクロールで隠れたときは止める)
      const play = ()=>{ const p = v.play(); if(p && p.catch) p.catch(()=>{}); };
      let visible = true;
      const sync = ()=>{ if(visible && !document.hidden) play(); else v.pause(); };
      if('IntersectionObserver' in window) new IntersectionObserver((es)=>{ visible = es[0].isIntersecting; sync(); }, { threshold: .05 }).observe(box);
      document.addEventListener('visibilitychange', sync);
      sync();
    }, { once: true });
    v.src = BASE + VIDEOS[i];
    v.load();
  }

  if(reduce || saveData) tryImage(0);                                // 動きを減らす/データ節約 → 動画は使わない
  else tryVideo(0);
})();

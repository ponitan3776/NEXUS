/* =====================================================================
   🎞 メニューの画像/動画 (menumedia.js)  v3.9
   frontend/icons/ に、下のどれかを GitHub に push するだけ。置いていなければ何も起きない(今までの表示のまま)。
     動画: menu.mp4(おすすめ。H.264+AAC) / menu.webm              ← 優先
     画像: menu.jpg / menu.png / menu.webp                      ← 動画が無いとき(動画が読み込めないときの代わりにもなる)
   サイズ: 1280×720 の横動画(16:9。幅・高さとも偶数なので H.264 でOK)。それ以外でも、枠(16:9)に合わせて中央でトリミング。
   DB・サーバーは通さない(GitHub Pages から直接読み込む)。目安: 動画は 数MB〜10MB 以内。GitHub は 1ファイル100MBまで。

   🔊 音について(ブラウザの決まりで、最初は音なしで始まる)
   ・ページを最初にタップ/キー操作した瞬間に、自動で音が出る(「🔊」ボタンで、いつでも消せる。消した設定は覚えておく)
   ・音が出ている間は、BGMを止めて、かぶらないようにする(動画が止まる=ゲームを始める・別タブ、でBGMが続きから戻る)
   ・BGMを OFF にしている人は、動画の音も出さない。音量は、BGMの音量スライダーに合わせる
   ・動画に音声トラックが無いときは、BGMは止めず、🔊ボタンも出さない
   ・画面が見えていない間(ゲーム中・別タブ)は自動で止まる。「動きを減らす」設定・データ節約モードの端末では、動画は再生せず画像(あれば)だけ
   ===================================================================== */
(function(){
  'use strict';
  const BASE = 'icons/';
  const VIDEOS = ['menu.mp4', 'menu.webm'];
  const IMAGES = ['menu.jpg', 'menu.png', 'menu.webp'];
  const PREF = 'nexus-menu-sound';
  const box = document.getElementById('heroMedia'), card = document.getElementById('titleCard');
  if(!box || !card) return;

  const reduce = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const saveData = !!(navigator.connection && navigator.connection.saveData);
  const getPref = ()=>{ try{ return localStorage.getItem(PREF) !== '0'; }catch(e){ return true; } };
  const setPref = (on)=>{ try{ localStorage.setItem(PREF, on ? '1' : '0'); }catch(e){} };
  const audioApi = ()=> window.CBMenuAudio || null;
  const show = (el)=>{ box.replaceChildren(el); box.hidden = false; card.classList.add('has-media'); };

  function tryImage(i){
    if(i >= IMAGES.length) return;                                   // どれも無い → 何もしない(今までの表示)
    const im = new Image();
    im.alt = ''; im.decoding = 'async';
    im.onload = ()=> show(im);
    im.onerror = ()=> tryImage(i + 1);
    im.src = BASE + IMAGES[i];
  }

  function setupVideo(v){
    show(v);
    const btn = document.createElement('button');
    btn.type = 'button'; btn.className = 'hero-sound'; box.append(btn);

    let wantSound = getPref();            // ボタンで消していなければ ON
    let unlocked = !!(navigator.userActivation && navigator.userActivation.hasBeenActive);   // 一度でも操作済みなら、すぐ音を出せる
    let visible = true, noAudio = false, checkTimer = 0;
    const musicOn = ()=> { const a = audioApi(); return a ? a.enabled() : true; };

    function refreshBtn(){
      btn.hidden = noAudio;
      const on = wantSound && musicOn();
      btn.textContent = on ? (unlocked ? '🔊' : '🔇') : '🔇';
      btn.setAttribute('aria-label', on ? '音を消す' : '音を出す');
      btn.title = on ? (unlocked ? '音を消す' : 'タップで音が出ます') : '音を出す';
    }
    function apply(){
      const a = audioApi(), vis = visible && !document.hidden;
      if(!vis){ v.pause(); if(a) a.duck(false); clearTimeout(checkTimer); return; }
      const sound = wantSound && musicOn() && unlocked && !noAudio;
      v.muted = !sound;
      if(sound) v.volume = a ? a.volume() : 0.6;
      const p = v.play();
      if(p && p.catch) p.catch(()=>{                                 // 音つき再生をブラウザに止められたら、音なしで続ける
        if(!v.muted){ v.muted = true; unlocked = false; v.play().catch(()=>{}); if(a) a.duck(false); refreshBtn(); }
      });
      if(a) a.duck(sound && !v.paused);                              // 音が出ている間だけ、BGMを止める
      if(sound && !checkTimer){                                      // 音声トラックが無い動画か、少し再生してから確かめる
        checkTimer = setTimeout(()=>{
          checkTimer = 0;
          const none = (typeof v.mozHasAudio === 'boolean' && !v.mozHasAudio) ||
                       ('webkitAudioDecodedByteCount' in v && !v.muted && !v.paused && v.currentTime > 0.8 && v.webkitAudioDecodedByteCount === 0);
          if(none){ noAudio = true; if(a) a.duck(false); v.muted = true; refreshBtn(); }
        }, 1500);
      }
      refreshBtn();
    }

    btn.addEventListener('click', (e)=>{ e.stopPropagation(); unlocked = true; wantSound = !(wantSound && musicOn()) ; setPref(wantSound); apply(); });
    const onGesture = ()=>{ if(unlocked) return; unlocked = true; apply(); };
    ['pointerdown', 'keydown', 'touchend'].forEach(ev=> document.addEventListener(ev, onGesture, { capture: true }));
    document.addEventListener('visibilitychange', apply);
    if(audioApi()) audioApi().changed = ()=>{ if(!v.muted) v.volume = audioApi().volume(); apply(); };    // BGMの音量・ON/OFFの変更に合わせる
    if('IntersectionObserver' in window) new IntersectionObserver((es)=>{ visible = es[0].isIntersecting; apply(); }, { threshold: .05 }).observe(box);
    apply();
  }

  function tryVideo(i){
    if(i >= VIDEOS.length){ tryImage(0); return; }                   // 動画が無い/読めない → 画像へ
    const v = document.createElement('video');
    v.muted = true; v.defaultMuted = true; v.loop = true; v.playsInline = true; v.autoplay = false;
    v.setAttribute('playsinline', ''); v.setAttribute('webkit-playsinline', ''); v.setAttribute('aria-hidden', 'true');
    v.disablePictureInPicture = true; v.preload = 'auto';
    v.addEventListener('error', ()=> tryVideo(i + 1), { once: true });
    v.addEventListener('loadeddata', ()=> setupVideo(v), { once: true });
    v.src = BASE + VIDEOS[i];
    v.load();
  }

  if(reduce || saveData) tryImage(0);                                // 動きを減らす/データ節約 → 動画は使わない
  else tryVideo(0);
})();

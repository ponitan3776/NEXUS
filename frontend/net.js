/* =====================================================================
   🌐 通信の土台 (v3.5.1) — script.js より先に読み込む
   サーバー(Render)への fetch だけを、次のように強くする(それ以外のURLには何もしない):
   ① 先読み: 接続(DNS・TLS)を先に済ませておく
   ② 起こす: 眠っているサーバーを、ページを開いた瞬間に起こしておく(ロード画面の間に済む)
   ③ 再試行: 読み込み(GET)が通信エラー・502/503/504になったら、少し待って最大3回まで自動でやり直す
   ④ まとめる: 同じ読み込み(GET)が同時に何本も走るとき、1本にまとめて結果を共有する
   ⑤ 時間切れ: 返事が60秒来なければ、止めてエラーにする(画面が永遠に「読み込み中」にならない)
   ※ 書き込み(POST など)は、二重に実行されないよう、自動の再試行はしない
   ===================================================================== */
(function(){
  'use strict';
  const BASE = String((window.NEXUS_CONFIG && window.NEXUS_CONFIG.API_BASE_URL) || 'https://pinkyburst.onrender.com').replace(/\/+$/, '');
  const orig = window.fetch.bind(window);
  const TIMEOUT_MS = 60000;
  const RETRY_STATUS = { 502:1, 503:1, 504:1 };

  // ① 先読み
  try{ const l = document.createElement('link'); l.rel = 'preconnect'; l.href = BASE; l.crossOrigin = 'anonymous'; document.head.appendChild(l); }catch(e){}
  // ② 起こす(結果は使わない)
  try{ orig(BASE + '/healthz', { cache:'no-store' }).catch(()=>{}); }catch(e){}

  const sleep = (ms)=> new Promise(r=> setTimeout(r, ms));

  async function once(input, init){
    const ctrl = new AbortController();
    const timer = setTimeout(()=> ctrl.abort(), TIMEOUT_MS);
    try{ return await orig(input, Object.assign({}, init, { signal: ctrl.signal })); }
    finally{ clearTimeout(timer); }
  }

  async function attempt(input, init, canRetry){
    const max = canRetry ? 3 : 1;
    let lastErr;
    for(let i = 1; i <= max; i++){
      try{
        const res = await once(input, init);
        if(RETRY_STATUS[res.status] && i < max){ await sleep(600 * i); continue; }
        return res;
      }catch(err){
        lastErr = err;
        if(i < max) await sleep(600 * i);
      }
    }
    throw lastErr;
  }

  const inflight = new Map();
  window.fetch = function(input, init){
    const url = typeof input === 'string' ? input : (input && input.url) || '';
    if(url.indexOf(BASE + '/') !== 0) return orig(input, init);        // サーバー以外は、そのまま
    if(init && init.signal) return orig(input, init);                    // 呼び出し側が自分で止め方を決めているときは、そのまま
    const method = String((init && init.method) || (typeof input !== 'string' && input.method) || 'GET').toUpperCase();
    if(method !== 'GET') return attempt(input, init || {}, false);
    if(typeof input !== 'string') return attempt(input, init || {}, true);
    const h = (init && init.headers) || {};
    const key = url + '|' + (h.Authorization || h.authorization || '');
    let p = inflight.get(key);
    if(!p){ p = attempt(input, init || {}, true).finally(()=> inflight.delete(key)); inflight.set(key, p); }
    return p.then(r=> r.clone());                                         // 何人が使っても読めるように、複製を渡す
  };
})();

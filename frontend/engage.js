/* =====================================================================
   🎁 ゲスト向けの「アカウントを作りたくなる」工夫 + 毎日ログインボーナス (v3.6)
   ・ゲスト: ロビーの常設バー / 時々出る小さなお知らせ(1日6回まで・4分以上あける・プレイ中は出さない) /
             アカウント画面のメリット一覧 / ゲストでためた🍬の引き継ぎ / ミニゲーム結果のお誘い
   ・ログイン中: 毎日ログインボーナスのポップアップ(1年中) / 新規登録ウェルカムギフトの開封
   ・サーバー: backend/engage.py (/api/bonus/daily, /api/guest/perks)
   ===================================================================== */
(function(){
  'use strict';
  const CB = ()=> window.CB || {};
  const LS = {
    get(k, d){ try{ const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); }catch(e){ return d; } },
    set(k, v){ try{ localStorage.setItem(k, JSON.stringify(v)); }catch(e){} }
  };
  const K_CANDY = 'candyblast-guest-candy', K_NUDGE = 'candyblast-nudge-v1';
  const CARRY_MAX = 150, NUDGE_GAP_MS = 4*60*1000, NUDGE_FAST_GAP_MS = 70*1000, NUDGE_MAX_PER_DAY = 6;
  const todayKey = ()=>{ const d = new Date(); return `${d.getFullYear()}-${d.getMonth()+1}-${d.getDate()}`; };
  const fmt = (n)=> (CB().fmt ? CB().fmt(n) : String(n));

  // サーバーの /api/guest/perks が取れたら差し替える(文章をサーバーで一元管理)。取れなくても、この初期値で動く
  let PERKS = [
    { icon:'🎁', title:'ウェルカムギフト', text:'作った瞬間に🪙3,000・🍬100・バトルパスXPがもらえる' },
    { icon:'📆', title:'毎日ログインボーナス', text:'毎日もらえて、続けるほど豪華(7・14・30日…で特別ボーナス)' },
    { icon:'🎃', title:'ハロウィンイベントに参加', text:'キャンディ集め・ガチャ・ロード・図鑑・畑・スタンプラリーが全部遊べる' },
    { icon:'🏆', title:'ランキングに載る', text:'ミニゲームの記録が全国ランキングに載る。名前も残る' },
    { icon:'☁️', title:'データが消えない', text:'コイン・スキン・記録がサーバーに保存。機種変更しても引き継げる' },
    { icon:'👥', title:'フレンド・チャット・対決', text:'みんなとチャットしたり、フレンド対決ができる' },
    { icon:'🏷', title:'称号・ギフト・投票', text:'称号を集めたり、運営からのプレゼントを受け取れる' }
  ];
  let daily = null;            // ログイン中の「毎日ログインボーナス」の状況
  let popShown = false;

  const isGuest = ()=> !(CB().isLoggedIn && CB().isLoggedIn());
  const lobbyVisible = ()=>{ const t = document.getElementById('titleScreen'); return !!t && !t.classList.contains('hidden'); };
  const modalOpen = ()=>{ const o = document.getElementById('modalOverlay'); return !!(o && o.classList.contains('show')); };
  const busy = ()=> document.body.classList.contains('mg-open') || modalOpen() || document.hidden || !!document.getElementById('cbBonusPop');
  const openRegister = ()=>{ if(CB().openRegister) CB().openRegister(); };

  // ---------- ゲストでためた🍬(アカウントを作ったら引き継げる) ----------
  function guestCandy(){ return Math.max(0, Math.min(CARRY_MAX, Number(LS.get(K_CANDY, 0)) || 0)); }
  function guestPlayed(info){
    if(!isGuest() || !(CB().eventActive && CB().eventActive())) return;
    const score = Math.max(0, Number(info && info.score) || 0);
    const add = 6 + Math.min(30, Math.floor(score/1200)) + ((info && String(info.mode || '').startsWith('mini-')) ? 4 : 0);
    const before = guestCandy(), now = Math.min(CARRY_MAX, before + add);
    LS.set(K_CANDY, now);
    if(now > before && CB().toast) CB().toast(`🍬 +${now - before}(ゲストのかりキャンディ ${now}) — アカウントを作ると引き継げます`);
    setTimeout(()=> nudge('game'), 2200);
  }
  function guestCandyLine(){
    const n = guestCandy();
    return n > 0 ? `<div class="hw2-guestcandy">ゲストでためた 🍬 <b>${n}</b> は、アカウントを作ると<b>そのまま引き継げます</b>(最大${CARRY_MAX})</div>` : '';
  }

  // ---------- メリット一覧(アカウント画面・お知らせで使う) ----------
  function perksHtml(){
    return `<div class="eg-perks"><div class="eg-ph">✨ アカウントを作ると、こんなにいいこと！</div>
      ${PERKS.map(p=>`<div class="eg-perk"><span class="pk-i">${p.icon}</span><div><b>${p.title}</b><small>${p.text}</small></div></div>`).join('')}
      ${guestCandyLine()}</div>`;
  }
  function decorateAccount(root){
    if(!isGuest() || !root || root.querySelector('.eg-perks')) return;
    const tabs = root.querySelector('.tab-row'); if(!tabs) return;
    tabs.insertAdjacentHTML('beforebegin', perksHtml());
    const reg = root.querySelector('[data-tab="register"]'); if(reg && !reg.querySelector('.eg-gift')) reg.insertAdjacentHTML('beforeend', ' <span class="eg-gift">🎁</span>');
  }

  // ---------- ゲスト向けの小さなお知らせ ----------
  function nudgeState(){
    const s = LS.get(K_NUDGE, null);
    if(!s || s.date !== todayKey()) return { date: todayKey(), count: 0, last: s && s.last || 0, idx: s && s.idx || 0 };
    return s;
  }
  function nudge(reason){
    if(!isGuest() || document.getElementById('cbNudge') || busy()) return;
    if(reason !== 'game' && reason !== 'ghost' && !lobbyVisible()) return;
    const st = nudgeState(), now = Date.now();
    if(st.count >= NUDGE_MAX_PER_DAY) return;
    if(now - st.last < ((reason === 'timer') ? NUDGE_GAP_MS : NUDGE_FAST_GAP_MS)) return;
    const p = PERKS[st.idx % PERKS.length];
    st.count++; st.last = now; st.idx++; LS.set(K_NUDGE, st);
    const el = document.createElement('div'); el.id = 'cbNudge'; el.className = 'eg-nudge';
    el.innerHTML = `<div class="ng-ic">${p.icon}</div><div class="ng-tx"><b>アカウントを作ると…${p.title}</b><small>${p.text}</small></div>
      <div class="ng-bt"><button type="button" class="ng-go">作る</button><button type="button" class="ng-x" aria-label="とじる">×</button></div>`;
    document.body.appendChild(el);
    const close = ()=>{ el.classList.add('out'); setTimeout(()=> el.remove(), 350); };
    el.querySelector('.ng-go').addEventListener('click', ()=>{ close(); openRegister(); });
    el.querySelector('.ng-x').addEventListener('click', close);
    setTimeout(close, 12000);
  }

  // ---------- ロビーの常設バー(ゲスト=お誘い / ログイン中=ログインボーナス) ----------
  function updateBar(){
    const bar = document.getElementById('lobbyBonusBtn'); if(!bar) return;
    if(isGuest()){
      bar.className = 'lobby-bonus guest'; bar.hidden = false;
      bar.innerHTML = `<span class="lb-ic">🎁</span><span class="lb-tx"><b>アカウントを作ると 🪙3,000 + 🍬100 もらえる！</b><small>毎日ログインボーナス・ハロウィン全部入り</small></span><span class="lb-go">›</span>`;
    } else if(daily){
      const ready = !daily.claimedToday;
      bar.className = 'lobby-bonus ' + (ready ? 'ready' : 'done'); bar.hidden = false;
      bar.innerHTML = ready
        ? `<span class="lb-ic">📆</span><span class="lb-tx"><b>今日のログインボーナスを受け取ろう！</b><small>連続 ${daily.streak} 日 → 今日で ${daily.nextStreak} 日目</small></span><span class="lb-go">受け取る ›</span>`
        : `<span class="lb-ic">✅</span><span class="lb-tx"><b>連続ログイン ${daily.streak} 日</b><small>今日のボーナスは受け取り済み。明日も来てね！</small></span><span class="lb-go">›</span>`;
    } else bar.hidden = true;
  }

  // ---------- 毎日ログインボーナス(ポップアップ) ----------
  async function loadDaily(){
    try{ daily = await CB().api('/api/bonus/daily'); }catch(e){ daily = null; }
    updateBar();
  }
  function rewardLine(r){ return `🪙${fmt(r.coins || 0)}${r.bpxp ? `<br>🎫+${fmt(r.bpxp)}` : ''}`; }
  function showBonus(){
    if(!daily || document.getElementById('cbBonusPop')) return;
    popShown = true;
    const d = daily, cur = d.day;
    const days = d.rewards.map((r,i)=>{
      const n = i+1, done = d.claimedToday ? n <= cur : n < cur, now = !d.claimedToday && n === cur;
      return `<div class="bp-day ${done ? 'done' : ''} ${now ? 'cur' : ''} ${n === d.cycle ? 'last' : ''}"><div class="bp-n">${n}日目</div><div class="bp-r">${rewardLine(r)}</div>${done ? '<i>✓</i>' : ''}</div>`;
    }).join('');
    const sb = Object.entries(d.streakBonus || {}).map(([k,v])=>`${k}日連続: 🪙${fmt(v.coins || 0)}${v.bpxp ? ` 🎫${fmt(v.bpxp)}` : ''}`).join(' ／ ');
    const el = document.createElement('div'); el.id = 'cbBonusPop'; el.className = 'eg-pop';
    el.innerHTML = `<div class="bp-card"><button class="bp-x" type="button" aria-label="とじる">×</button>
      <div class="bp-h">📆 ログインボーナス</div>
      <div class="bp-sub" id="bpSub">連続ログイン <b>${d.streak}</b> 日 ${d.claimedToday ? '' : `→ 今日で <b>${d.nextStreak}</b> 日目`}</div>
      <div class="bp-days">${days}</div>
      <div class="bp-sb">🎯 連続ボーナス: ${sb}</div>
      <div class="bp-msg" id="bpMsg"></div>
      <button class="primary-btn" id="bpClaim" type="button" ${d.claimedToday ? 'disabled' : ''}>${d.claimedToday ? '✓ 今日は受け取り済み' : '🎁 今日のボーナスを受け取る'}</button></div>`;
    document.body.appendChild(el);
    const close = ()=>{ el.classList.add('out'); setTimeout(()=> el.remove(), 300); };
    el.querySelector('.bp-x').addEventListener('click', close);
    el.addEventListener('pointerdown', (e)=>{ if(e.target === el) close(); });
    const btn = el.querySelector('#bpClaim');
    btn.addEventListener('click', async ()=>{
      btn.disabled = true;
      try{
        const r = await CB().api('/api/bonus/daily/claim', 'POST');
        if(CB().setCoins) CB().setCoins(r.coins);
        if(CB().sound) CB().sound('win');
        daily = { ...daily, claimedToday:true, streak:r.streak, day:r.day, nextStreak:r.streak };
        el.querySelector('#bpMsg').innerHTML = `🎉 🪙${fmt(r.reward.coins || 0)}${r.reward.bpxp ? ` ・ 🎫+${fmt(r.reward.bpxp)}` : ''} をゲット！${r.bonusHit ? '<br>🌟 連続ログインの特別ボーナス付き！' : ''}`;
        btn.textContent = '✓ 受け取りました'; updateBar();
        const sub = el.querySelector('#bpSub'); if(sub) sub.innerHTML = `連続ログイン <b>${r.streak}</b> 日 ✓`;
        setTimeout(close, 2600);
      }catch(err){ el.querySelector('#bpMsg').textContent = err.message; btn.disabled = false; }
    });
  }

  // ---------- 新規登録したとき(script.js が cb:registered を出す) ----------
  window.addEventListener('cb:registered', async ()=>{
    daily = null; updateBar();
    const n = guestCandy();
    if(n > 0 && CB().eventActive && CB().eventActive()){
      try{
        const r = await CB().api('/api/event/halloween/guest-carryover', 'POST', { candies: n });
        if(r && r.gained > 0 && CB().toast) CB().toast(`🍬 ゲストでためたキャンディ ${r.gained} 個を引き継ぎました！`);
      }catch(e){}
    }
    LS.set(K_CANDY, 0);
    setTimeout(()=>{ if(window.GiftFx) window.GiftFx.check('manual'); }, 1400);     // 🎁 ウェルカムギフトを開封
    setTimeout(loadDaily, 2000);
  });

  // ---------- まとめて見張る(2秒ごと。軽い処理だけ) ----------
  let wasIn = null, forcePop = false, lastTimerNudge = Date.now() - NUDGE_GAP_MS + 30000;
  function tick(){
    const inNow = !isGuest();
    if(inNow !== wasIn){
      const wasPrev = wasIn; wasIn = inNow;
      if(inNow){ popShown = false; forcePop = (wasPrev === false); loadDaily(); }
      else {
        daily = null; updateBar();
        CB().api && CB().api('/api/guest/perks').then(d=>{ if(d && Array.isArray(d.perks) && d.perks.length) PERKS = d.perks; }).catch(()=>{});
      }
    }
    if(inNow){
      if(daily && !daily.claimedToday && !popShown && (lobbyVisible() || forcePop) && !busy()){ forcePop = false; showBonus(); }
    } else if(lobbyVisible() && !busy() && Date.now() - lastTimerNudge > NUDGE_GAP_MS){
      lastTimerNudge = Date.now(); nudge('timer');
    }
  }
  setInterval(tick, 2000);
  setTimeout(()=>{ updateBar(); }, 1200);
  document.addEventListener('click', (e)=>{
    const bar = e.target.closest && e.target.closest('#lobbyBonusBtn');
    if(!bar) return;
    if(isGuest()) openRegister(); else if(daily) showBonus();
  });
  // 日付が変わっても(アプリを開きっぱなしでも)ボーナスを出せるように、画面に戻ったとき状況を取り直す
  document.addEventListener('visibilitychange', ()=>{ if(!document.hidden && !isGuest()){ popShown = false; loadDaily(); } });

  window.CBEngage = { guestPlayed, guestCandyLine, perksHtml, decorateAccount, nudge, showBonus,
    signupLine(){ return isGuest() ? `<button class="mg-linkbtn eg-cta" id="mgSignup" type="button">🎁 アカウントを作ると、記録がランキングに載って 🪙3,000 ももらえる！</button>` : ''; } };
})();

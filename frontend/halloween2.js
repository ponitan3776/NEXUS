/* =====================================================================
   🎃 ハロウィン パート2 (v3.6) — 新しいタブの画面 / さまようおばけ / ボーナスバー
   ・script.js の ハロウィンウィンドウ から呼ばれる(window.HW2)。サーバーAPIは /api/event/halloween/*
   ・各タブ: 🚪ドア(トリック・オア・トリート+おみくじ) 🌱畑 📖図鑑 🎪スタンプ 🌍みんなで
   ===================================================================== */
(function(){
  'use strict';
  const TABS = ['tot', 'patch', 'dex', 'stamps', 'community'];
  const RARITY = { common:['ふつう', '#9fb0c8'], rare:['レア', '#5c9dff'], epic:['エピック', '#c25bff'], legendary:['伝説', '#ffc02e'] };
  const KIND_EMO = { candies:'🍬', coins:'🪙', ticket:'🎟', trick:'🤡', dex:'📖', jackpot:'🎰' };
  const fmtTime = (sec)=>{
    sec = Math.max(0, Math.ceil(sec));
    const h = Math.floor(sec/3600), m = Math.floor((sec%3600)/60), s = sec%60;
    return h ? `${h}時間${String(m).padStart(2,'0')}分` : (m ? `${m}分${String(s).padStart(2,'0')}秒` : `${s}秒`);
  };
  const rewardsText = (ctx, list)=> list.map(r=> ctx.rewardText(r)).join(' + ');
  let patchTimer = 0;

  // ---------- ホームの上に出すもの(ボーナスタイム / ハロウィンまでのカウントダウン / おすすめ) ----------
  function boostBar(s){
    if(!s.boost || !s.boost.label) return '';
    return `<div class="hw2-boost"><span class="b-ic">⚡</span><b>${s.boost.label}</b></div>`;
  }
  function homeTop(s, ctx){
    const d = s.daysToHalloween;
    const count = d > 0 ? `🎃 ハロウィンまで あと <b>${d}</b> 日` : (d === 0 ? '🎃 <b>今日はハロウィン当日！</b> キャンディ3倍！' : '🎃 ハロウィンは終わったけど、まだまだ遊べるよ');
    const todo = [];
    const b = s.badges || {};
    if(b.home) todo.push(['home', '🎁 ログインボーナス']);
    if(b.tot) todo.push(['tot', '🚪 ドア / おみくじ']);
    if(b.patch) todo.push(['patch', '🌱 畑']);
    if(b.missions) todo.push(['missions', '📋 ミッション報酬']);
    if(b.road) todo.push(['road', '🛤 ロード報酬']);
    if(b.dex) todo.push(['dex', '📖 図鑑報酬']);
    if(b.stamps) todo.push(['stamps', '🎪 スタンプ報酬']);
    return `<div class="hw2-count">${count}</div>
      ${todo.length ? `<div class="hw2-todo"><div class="t-h">📌 今日のおすすめ</div>${todo.map(([k,l])=>`<button type="button" class="t-chip" data-hwgo="${k}">${l}<i>!</i></button>`).join('')}</div>` : `<div class="hw2-todo done"><div class="t-h">✅ 今日のやることは全部おわり！</div></div>`}`;
  }

  // ---------- 🚪 ドア + おみくじ ----------
  function fortuneHtml(s){
    const f = s.fortune;
    if(f){
      return `<div class="hw2-card ft">
        <div class="hw2-ct">🔮 きょうのおみくじ</div>
        <div class="ft-rank r-${f.rank}">${f.rank}</div>
        <div class="ft-text">${f.text}</div>
        <div class="ft-lucky"><span>🍀 ラッキーアイテム <b>${f.item}</b></span><span>🎨 ラッキーカラー <b>${f.color}</b></span><span>🔢 ラッキーナンバー <b>${f.number}</b></span></div>
        <div class="ft-got">🍬 +${f.candies} もらった！ また明日引けるよ</div></div>`;
    }
    return `<div class="hw2-card ft"><div class="hw2-ct">🔮 きょうのおみくじ <span class="hw2-tag">1日1回・無料</span></div>
      <div class="sub">引くとキャンディがもらえます。大吉なら🍬80！</div>
      <button class="primary-btn" id="hw2Fortune" type="button">🔮 おみくじを引く</button></div>`;
  }
  function totHtml(s, ctx){
    const t = s.tot, left = Math.max(0, t.max - t.used), free = t.freeLeft > 0;
    const can = ctx.active() && left > 0 && (free || s.candies >= t.cost);
    const doors = [0,1,2].map(i=>`<button type="button" class="hw2-door" data-door="${i}" ${can ? '' : 'disabled'}><span class="d-face">🚪</span><span class="d-n">${i+1}</span></button>`).join('');
    return `${fortuneHtml(s)}
      <div class="hw2-card tot">
        <div class="hw2-ct">🚪 トリック・オア・トリート <span class="hw2-tag">${free ? '今日の1回目は無料' : `🍬${t.cost}で開けられる`}</span></div>
        <div class="sub">3つのドアから1つえらぼう。お菓子？ いたずら？ ときどき…おばけが遊びに来ます。</div>
        <div class="hw2-doors" id="hw2Doors">${doors}</div>
        <div class="hw2-door-msg" id="hw2DoorMsg">${can ? 'どのドアを開ける？' : (left <= 0 ? '今日はおしまい。また明日！' : (ctx.active() ? `キャンディが足りません(🍬${t.cost}必要)` : '開催期間外です'))}</div>
        <div class="sub" style="text-align:center;">今日あと ${left} 回(1日 ${t.max} 回まで)</div>
        <details class="hw2-det"><summary>出るもの一覧を見る</summary><ul>${t.table.map(x=>`<li>${x.title}</li>`).join('')}</ul></details>
      </div>
      <div class="hw2-card ghost"><div class="hw2-ct">👻 さまようおばけ <span class="hw2-tag">今日あと ${s.ghost.left} 匹</span></div>
        <div class="sub">ロビー画面に、ときどきおばけが飛んできます。タップでつかまえるとキャンディがもらえる！金色のおばけは大当たり(🍬45)。</div></div>`;
  }
  function bindTot(root, s, ctx){
    const f = root.querySelector('#hw2Fortune');
    if(f) f.addEventListener('click', async ()=>{
      f.disabled = true;
      try{ const d = await ctx.api('fortune', 'POST'); ctx.applyWallet(d); ctx.sound('win'); await ctx.refresh(`🔮 ${d.fortune.rank}！ 🍬+${d.fortune.candies}`); }
      catch(err){ alert(err.message); f.disabled = false; }
    });
    root.querySelectorAll('.hw2-door').forEach(btn=> btn.addEventListener('click', async ()=>{
      const door = +btn.dataset.door, msg = root.querySelector('#hw2DoorMsg');
      root.querySelectorAll('.hw2-door').forEach(b=> b.disabled = true);
      btn.classList.add('opening'); ctx.sound('whoosh');
      try{
        const d = await ctx.api('tot/open', 'POST', { door });
        ctx.applyWallet(d);
        const doors = root.querySelectorAll('.hw2-door');
        d.doors.forEach((x,i)=>{ doors[i].classList.add(i === door ? 'chosen' : 'other'); doors[i].querySelector('.d-face').textContent = KIND_EMO[x.kind] || '🎁'; });
        const r = d.result, parts = [];
        if(r.give.candies) parts.push(`🍬+${r.give.candies}`);
        if(r.give.coins) parts.push(`🪙+${r.give.coins.toLocaleString()}`);
        if(r.give.tickets) parts.push(`🎟×${r.give.tickets}`);
        if(r.dex) parts.push(r.dex.new ? `📖 ${r.dex.emoji}${r.dex.name} を図鑑に登録！` : `📖 ${r.dex.emoji}${r.dex.name}(もう友だち→🍬+${r.dex.candies})`);
        msg.innerHTML = `<b>${r.title}</b><br>${parts.join('　')}`;
        msg.classList.add('hit');
        ctx.sound(r.kind === 'jackpot' || r.kind === 'ticket' ? 'win' : (r.kind === 'trick' ? 'bad' : 'coin'));
        ctx.silentRefresh();
        const again = document.createElement('button'); again.type = 'button'; again.className = 'claim-btn'; again.textContent = 'もう1回ひらく / 画面を更新'; again.style.marginTop = '10px';
        again.addEventListener('click', ()=> ctx.rerender());
        msg.after(again);
      }catch(err){ alert(err.message); ctx.rerender(); }
    }));
  }

  // ---------- 🌱 かぼちゃ畑 ----------
  function patchHtml(s, ctx){
    const now = ctx.nowSec(), P = s.patch;
    const ripe = P.plots.filter(p=> !p.empty && now >= p.readyAt).length;
    const plots = P.plots.map(p=>{
      if(p.empty) return `<div class="hw2-plot empty"><div class="p-ic">🟫</div><div class="p-nm">あいている畑</div><button class="claim-btn" data-plant="${p.idx}" type="button">🌱 植える</button></div>`;
      const k = P.kinds.find(x=>x.id === p.kind) || P.kinds[0], total = k.sec, left = p.readyAt - now, pct = Math.max(0, Math.min(100, (1 - left/total)*100));
      return left <= 0
        ? `<div class="hw2-plot ripe"><div class="p-ic big">${p.emoji}</div><div class="p-nm">${p.name}</div><div class="p-st">🎉 しゅうかくOK！ 🍬${p.candies}</div><button class="primary-btn" data-harvest="${p.idx}" type="button">収穫する</button></div>`
        : `<div class="hw2-plot grow" data-ready="${p.readyAt}" data-total="${total}"><div class="p-ic">${pct < 40 ? '🌱' : '🌿'}</div><div class="p-nm">${p.name}</div><div class="p-bar"><i style="width:${pct}%"></i></div><div class="p-st" data-left>あと ${fmtTime(left)}</div></div>`;
    }).join('');
    return `<div class="hw2-card"><div class="hw2-ct">🌱 かぼちゃ畑 <span class="hw2-tag">時間がたつと実る</span></div>
      <div class="sub">植えておけば、アプリを閉じていても育ちます。あとで収穫してキャンディをゲット！</div>
      <button class="primary-btn" id="hw2HarvestAll" type="button" ${ripe ? '' : 'disabled'} style="margin:8px 0;">🧺 まとめて収穫${ripe ? `(${ripe}個)` : ''}</button>
      <div class="hw2-plots" id="hw2Plots">${plots}</div></div>
      <div class="hw2-card"><div class="hw2-ct">🎃 かぼちゃの種類</div>
      <div class="hw2-kinds">${P.kinds.map(k=>`<div class="k"><span class="k-e">${k.emoji}</span><b>${k.name}</b><span>${fmtTime(k.sec)}</span><span>🍬${k.candies}</span></div>`).join('')}</div>
      <div class="sub">長く育てるほど、お得。寝る前にゴールデンを植えるのがおすすめ！</div></div>`;
  }
  function bindPatch(root, s, ctx){
    const run = async (path, body, okMsg)=>{
      try{ const d = await ctx.api(path, 'POST', body); ctx.applyWallet(d); ctx.sound('coin'); await ctx.refresh(okMsg ? okMsg(d) : ''); }
      catch(err){ alert(err.message); }
    };
    root.querySelectorAll('[data-plant]').forEach(b=> b.addEventListener('click', ()=>{
      const idx = +b.dataset.plant, box = b.closest('.hw2-plot');
      box.innerHTML = `<div class="p-nm">なにを植える？</div>` + s.patch.kinds.map(k=>`<button class="claim-btn kind" data-kind="${k.id}" type="button">${k.emoji}${k.name}<small>${fmtTime(k.sec)} → 🍬${k.candies}</small></button>`).join('');
      box.querySelectorAll('[data-kind]').forEach(kb=> kb.addEventListener('click', ()=> run('patch/plant', { plot: idx, kind: kb.dataset.kind }, ()=> '🌱 植えました！ 育つのを待とう')));
    }));
    root.querySelectorAll('[data-harvest]').forEach(b=> b.addEventListener('click', ()=> run('patch/harvest', { plot: +b.dataset.harvest }, d=> `🧺 収穫！ 🍬+${d.gained}`)));
    const all = root.querySelector('#hw2HarvestAll');
    if(all) all.addEventListener('click', ()=> run('patch/harvest', { all: true }, d=> `🧺 ${d.harvested}個 収穫！ 🍬+${d.gained}`));
    clearInterval(patchTimer);
    patchTimer = setInterval(()=>{
      const wrap = document.getElementById('hw2Plots');
      if(!wrap){ clearInterval(patchTimer); return; }
      let need = false;
      wrap.querySelectorAll('.hw2-plot.grow').forEach(el=>{
        const left = +el.dataset.ready - ctx.nowSec(), total = +el.dataset.total;
        if(left <= 0){ need = true; return; }
        el.querySelector('[data-left]').textContent = `あと ${fmtTime(left)}`;
        el.querySelector('.p-bar i').style.width = Math.max(0, Math.min(100, (1 - left/total)*100)) + '%';
      });
      if(need){ clearInterval(patchTimer); ctx.rerender(); }
    }, 1000);
  }

  // ---------- 📖 図鑑 ----------
  function dexHtml(s, ctx){
    const D = s.dex, own = new Set(D.owned);
    const cards = s.dexList.map(c=>{
      const has = own.has(c.id), r = RARITY[c.rarity];
      return `<div class="hw2-dex ${has ? 'has' : 'no'}" style="--rc:${r[1]}"><div class="dx-e">${has ? c.emoji : '❔'}</div><div class="dx-n">${has ? c.name : '？？？'}</div><div class="dx-r">${r[0]}</div></div>`;
    }).join('');
    const ready = D.steps.filter(x=> x.reached && !x.claimed).length;
    const steps = D.steps.map(x=>`<div class="hw2-step ${x.claimed ? 'claimed' : (x.reached ? 'ready' : '')}"><div class="st-n">${x.need}<small>種</small></div><div class="st-r">${ctx.rewardText(x.reward)}</div>
      <div class="st-a">${x.claimed ? '<span class="hw-done">済</span>' : (x.reached ? `<button class="claim-btn" data-dexclaim="${x.need}" type="button">受け取る</button>` : `<span class="hw-lock">あと${x.need - D.owned.length}</span>`)}</div></div>`).join('');
    return `<div class="hw2-card"><div class="hw2-ct">📖 おばけ図鑑 <span class="hw2-tag">${D.owned.length} / ${D.total}</span></div>
      <div class="quest-bar-bg"><div class="quest-bar-fill" style="width:${Math.round(D.owned.length/D.total*100)}%"></div></div>
      <div class="sub" style="margin-top:6px;">ゲームを遊ぶと、ときどきおばけが図鑑に仲間入り！ トリック・オア・トリートからは、レアなおばけも。</div></div>
      <div class="hw2-dexgrid">${cards}</div>
      <div class="hw2-card"><div class="hw2-ct">🎁 図鑑のごほうび</div><button class="primary-btn" id="hw2DexAll" type="button" ${ready ? '' : 'disabled'}>まとめて受け取る${ready ? `(${ready}件)` : ''}</button>${steps}</div>`;
  }
  function bindDex(root, s, ctx){
    const run = async (body)=>{
      try{ const d = await ctx.api('dex/claim', 'POST', body); ctx.applyWallet(d); ctx.sound('win'); await ctx.refresh(`🎁 図鑑のごほうび: ${rewardsText(ctx, d.rewards)}`); }
      catch(err){ alert(err.message); }
    };
    root.querySelectorAll('[data-dexclaim]').forEach(b=> b.addEventListener('click', ()=> run({ need: +b.dataset.dexclaim })));
    const all = root.querySelector('#hw2DexAll'); if(all) all.addEventListener('click', ()=> run({ all: true }));
  }

  // ---------- 🎪 スタンプラリー ----------
  function stampsHtml(s, ctx){
    const S = s.stamps, got = new Set(S.got), games = (window.CBMini && window.CBMini.games) || [];
    const byId = Object.fromEntries(games.map(g=>[g.id, g]));
    const cells = S.games.map(id=>{
      const g = byId[id] || { emoji:'🎮', name:id }, has = got.has(id);
      return `<div class="hw2-stamp ${has ? 'has' : ''}"><div class="sp-e">${g.emoji}</div><div class="sp-n">${g.name}</div><div class="sp-s">${has ? '✔' : ''}</div></div>`;
    }).join('');
    const ready = S.steps.filter(x=> x.reached && !x.claimed).length;
    const steps = S.steps.map(x=>`<div class="hw2-step ${x.claimed ? 'claimed' : (x.reached ? 'ready' : '')} ${x.key === 'all' ? 'final' : ''}"><div class="st-n">${x.key === 'all' ? '全' : x.need}<small>${x.key === 'all' ? '部' : '個'}</small></div><div class="st-r">${ctx.rewardText(x.reward)}${x.reward.skinId ? ctx.swatches(x.reward.skinId, 5) : ''}</div>
      <div class="st-a">${x.claimed ? '<span class="hw-done">済</span>' : (x.reached ? `<button class="claim-btn" data-stclaim="${x.key}" type="button">受け取る</button>` : `<span class="hw-lock">あと${x.need - S.got.length}</span>`)}</div></div>`).join('');
    return `<div class="hw2-card"><div class="hw2-ct">🎪 ミニゲーム・スタンプラリー <span class="hw2-tag">${S.got.length} / ${S.games.length}</span></div>
      <div class="quest-bar-bg"><div class="quest-bar-fill" style="width:${Math.round(S.got.length/S.games.length*100)}%"></div></div>
      <div class="sub" style="margin:6px 0 8px;">ミニゲームを1種類遊ぶごとにスタンプが1つ。全部集めると限定スキンがもらえます！</div>
      <button class="primary-btn" id="hw2GoMini" type="button">🕹 ミニゲームへ行く</button></div>
      <div class="hw2-stampgrid">${cells}</div>
      <div class="hw2-card"><div class="hw2-ct">🎁 スタンプのごほうび</div><button class="primary-btn" id="hw2StAll" type="button" ${ready ? '' : 'disabled'}>まとめて受け取る${ready ? `(${ready}件)` : ''}</button>${steps}</div>`;
  }
  function bindStamps(root, s, ctx){
    const run = async (body)=>{
      try{ const d = await ctx.api('stamps/claim', 'POST', body); ctx.applyWallet(d); ctx.sound('win'); await ctx.refresh(`🎁 スタンプのごほうび: ${rewardsText(ctx, d.rewards)}`); }
      catch(err){ alert(err.message); }
    };
    root.querySelectorAll('[data-stclaim]').forEach(b=> b.addEventListener('click', ()=> run({ key: b.dataset.stclaim })));
    const all = root.querySelector('#hw2StAll'); if(all) all.addEventListener('click', ()=> run({ all: true }));
    const go = root.querySelector('#hw2GoMini'); if(go) go.addEventListener('click', ()=>{ ctx.closeModal(); if(window.CB && window.CB.hideTitle) window.CB.hideTitle(); if(window.CBMini) window.CBMini.open(); });
  }

  // ---------- 🌍 みんなでキャンディ大作戦 ----------
  function communityHtml(){ return `<div id="hw2Comm"><div class="empty-hint">読み込み中...</div></div>`; }
  async function bindCommunity(root, s, ctx){
    const box = root.querySelector('#hw2Comm'); if(!box) return;
    try{
      const d = await ctx.api('community');
      const next = d.goals.find(g=> !g.reached), prev = d.goals.filter(g=> g.reached).slice(-1)[0];
      const from = prev ? prev.need : 0, pct = next ? Math.max(2, Math.min(100, Math.round((d.total - from)/(next.need - from)*100))) : 100;
      const ready = d.goals.filter(g=> g.reached && !g.claimed).length;
      box.innerHTML = `<div class="hw2-card comm"><div class="hw2-ct">🌍 みんなでキャンディ大作戦</div>
        <div class="comm-total">みんなで集めた累計 <b>🍬 ${ctx.fmt(d.total)}</b></div>
        <div class="quest-bar-bg"><div class="quest-bar-fill" style="width:${pct}%"></div></div>
        <div class="sub" style="margin-top:6px;">${next ? `次の目標 🍬${ctx.fmt(next.need)} まで あと ${ctx.fmt(next.need - d.total)}` : '🎉 全部の目標を達成！ みんなありがとう！'}<br>目標に届くたびに、<b>参加している全員</b>にごほうびが届きます(数字は少し遅れて更新されます)。</div>
        <button class="primary-btn" id="hw2CommAll" type="button" ${ready ? '' : 'disabled'} style="margin-top:8px;">🎁 まとめて受け取る${ready ? `(${ready}件)` : ''}</button></div>
        ${d.goals.map(g=>`<div class="hw2-step ${g.claimed ? 'claimed' : (g.reached ? 'ready' : '')}"><div class="st-n sm">🍬${ctx.fmt(g.need)}</div><div class="st-r">${rewardsText(ctx, g.rewards)}</div><div class="st-a">${g.claimed ? '<span class="hw-done">済</span>' : (g.reached ? '<span class="hw2-tag ok">達成！</span>' : '<span class="hw-lock">🔒</span>')}</div></div>`).join('')}`;
      const all = box.querySelector('#hw2CommAll');
      if(all) all.addEventListener('click', async ()=>{
        try{ const r = await ctx.api('community/claim', 'POST'); ctx.applyWallet(r); ctx.sound('win'); await ctx.refresh(`🎁 みんなのごほうび: ${rewardsText(ctx, r.rewards)}`); }
        catch(err){ alert(err.message); }
      });
    }catch(err){ box.innerHTML = `<div class="empty-hint">${err.message}</div>`; }
  }

  // ---------- ゲストにハロウィンを見せるとき(ログインしていない人用) ----------
  function guestHtml(){
    return `<h2 class="hw-h2">🎃 ハロウィン・ナイトフェス</h2>
      <div class="hw2-guest">
        <div class="g-big">🔒 ゲストのままだと、イベントには参加できません</div>
        <div class="sub">アカウントを作ると、こんなに楽しめます！</div>
        <ul>
          <li>🎁 <b>ウェルカムギフト</b>(🪙3,000・🍬100・バトルパスXP)</li>
          <li>📆 毎日ログインボーナス(キャンディ・コイン)</li>
          <li>🍬 キャンディ集め → 🎰ガチャ・🛤ロード(60段)・🛒交換所</li>
          <li>📖 おばけ図鑑 24種 / 🎪 スタンプラリー / 🌱 かぼちゃ畑 / 🚪 トリック・オア・トリート</li>
          <li>🌍 みんなでキャンディ大作戦 / 🏆 ランキング</li>
        </ul>
        ${window.CBEngage ? window.CBEngage.guestCandyLine() : ''}
        <button class="primary-btn" id="hw2Signup" type="button">✨ アカウントを作る(無料・1分)</button>
      </div>`;
  }

  // ---------- さまようおばけ(ロビーに、ときどき飛んでくる) ----------
  const ghost = { el: null, timer: 0 };
  function ghostAllowed(){
    const CB = window.CB; if(!CB || !CB.eventActive || !CB.eventActive()) return false;
    const title = document.getElementById('titleScreen');
    if(!title || title.classList.contains('hidden')) return false;
    if(document.body.classList.contains('mg-open') || document.hidden) return false;
    const ov = document.getElementById('modalOverlay'); if(ov && ov.classList.contains('show')) return false;
    return true;
  }
  function spawnGhost(){
    if(ghost.el || !ghostAllowed()) return;
    const gold = Math.random() < .1, el = document.createElement('button');
    el.type = 'button'; el.className = 'hw2-ghost' + (gold ? ' gold' : ''); el.textContent = gold ? '🌟' : '👻'; el.setAttribute('aria-label', 'さまようおばけ');
    el.style.top = (18 + Math.random()*50) + 'vh'; el.style.animationDuration = (9 + Math.random()*4) + 's';
    el.addEventListener('animationend', ()=>{ el.remove(); ghost.el = null; });
    el.addEventListener('pointerdown', async (e)=>{
      e.preventDefault(); el.classList.add('caught'); setTimeout(()=>{ el.remove(); ghost.el = null; }, 350);
      const CB = window.CB;
      if(!CB.isLoggedIn()){
        CB.toast('👻 つかまえた！…けど、アカウントがないとキャンディにならない…'); CB.sound('bad');
        if(window.CBEngage) window.CBEngage.nudge('ghost'); return;
      }
      try{
        const d = await CB.api('/api/event/halloween/ghost/catch', 'POST');
        CB.sound(d.gold ? 'win' : 'coin'); CB.toast(`${d.gold ? '🌟 金色のおばけ！' : '👻 つかまえた！'} 🍬 +${d.gained}(今日あと${d.left}匹)`);
      }catch(err){ CB.toast('👻 ' + (err.message || 'にげられた…')); }
    });
    document.body.appendChild(el); ghost.el = el;
  }
  function scheduleGhost(first){
    clearTimeout(ghost.timer);
    ghost.timer = setTimeout(()=>{ spawnGhost(); scheduleGhost(false); }, (first ? 20 : 55 + Math.random()*60) * 1000);
  }
  scheduleGhost(true);

  window.HW2 = {
    has: (tab)=> TABS.includes(tab),
    boostBar, homeTop, guestHtml,
    render(tab, s, ctx){
      if(tab === 'tot') return totHtml(s, ctx);
      if(tab === 'patch') return patchHtml(s, ctx);
      if(tab === 'dex') return dexHtml(s, ctx);
      if(tab === 'stamps') return stampsHtml(s, ctx);
      if(tab === 'community') return communityHtml();
      return '';
    },
    bind(tab, root, s, ctx){
      if(tab !== 'patch') clearInterval(patchTimer);
      if(tab === 'tot') bindTot(root, s, ctx);
      else if(tab === 'patch') bindPatch(root, s, ctx);
      else if(tab === 'dex') bindDex(root, s, ctx);
      else if(tab === 'stamps') bindStamps(root, s, ctx);
      else if(tab === 'community') bindCommunity(root, s, ctx);
    },
    bindGuest(root){
      const b = root.querySelector('#hw2Signup');
      if(b) b.addEventListener('click', ()=>{ if(window.CB && window.CB.openRegister) window.CB.openRegister(); });
    }
  };
})();

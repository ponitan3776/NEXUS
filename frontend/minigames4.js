/* =====================================================================
   🕹 ミニゲーム追加 v4.0(ハロウィン パート3 拡張)— 5本
   コウモリよけ / ともしびメモリー / ガイコツ・ビート / かぼちゃふくらまし / もじならべ

   足し方は minigames3.js と同じ:
     ① backend/minigames.py の GAMES に範囲を足す  ② ここの NEW4 に { id, emoji, name, desc, unit, better, genre, start } を足す
     ③ スタンプラリー用に backend/halloween.py の C.MINI_GAME_IDS にも足す
   終わったら api.finish({ rating:0〜100, score, better, valid:true, text })
   ===================================================================== */
(function(){
  'use strict';
  if(!window.CBMini || !window.CBMini.register) return;      // minigames.js が先に読み込まれている必要がある
  const CB = ()=> window.CB || {};
  const $ = (tag, cls, html)=>{ const e = document.createElement(tag); if(cls) e.className = cls; if(html != null) e.innerHTML = html; return e; };
  const snd = (n, a)=>{ try{ CB().sound && CB().sound(n, a); }catch(e){} };
  const vib = (p)=>{ try{ CB().vibrate && CB().vibrate(p); }catch(e){} };
  const clamp = (v, a, b)=> Math.min(b, Math.max(a, v));
  const rnd = (n)=> Math.floor(Math.random() * n);
  const shuffle = (a)=>{ a = a.slice(); for(let i = a.length - 1; i > 0; i--){ const j = rnd(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const press = (el, fn)=> el.addEventListener('pointerdown', (e)=>{ e.preventDefault(); fn(e); });

  /* ---------- 1) コウモリよけ ---------- */
  function gameBatDodge(stage, api){
    const W = 340, H = 300, LANES = 3, LW = W / LANES, LIVES = 3;
    const wrap = $('div', 'm3-wrap'), info = $('div', 'g-score', ''), field = $('div', 'm4-field');
    field.style.height = H + 'px';
    for(let i = 1; i < LANES; i++){ const l = $('i', 'm4-laneline'); l.style.left = (i * LW) + 'px'; field.append(l); }
    const me = $('div', 'm4-me', '🎃'); field.append(me);
    wrap.append(info, field, $('div', 'g-hint', '画面の左をタップで左へ、右をタップで右へ(キーボードの ← → もOK)。コウモリを3回ぶつかるまでに、何匹よけられる？'));
    stage.append(wrap);
    let lane = 1, lives = LIVES, score = 0, bats = [], over = false, raf = 0, last = performance.now(), t0 = last, spawn = 0.6;
    const setMe = ()=>{ me.style.left = (lane * LW + LW / 2) + 'px'; };
    const hud = ()=>{ info.textContent = `🦇 よけた ${score} 匹   ${'❤️'.repeat(lives)}${'🖤'.repeat(LIVES - lives)}`; };
    function move(d){ if(over) return; lane = clamp(lane + d, 0, LANES - 1); setMe(); snd('tick'); }
    function frame(t){
      if(over) return;
      const dt = Math.min(0.05, (t - last) / 1000); last = t;
      const el = (t - t0) / 1000, speed = 150 + el * 8;
      spawn -= dt;
      if(spawn <= 0){
        const ln = rnd(LANES), b = $('div', 'm4-bat', '🦇');
        b.style.left = (ln * LW + LW / 2) + 'px'; field.append(b);
        bats.push({ el: b, lane: ln, y: -30, k: 0.85 + Math.random() * 0.4 });
        spawn = Math.max(0.26, 0.85 - el * 0.011) * (0.7 + Math.random() * 0.6);
      }
      const keep = [];
      for(const b of bats){
        b.y += speed * dt * b.k; b.el.style.top = b.y + 'px';
        if(b.lane === lane && b.y > H - 64 && b.y < H - 14){
          b.el.remove(); lives--; hud(); snd('bad'); vib(60); field.classList.add('hurt'); setTimeout(()=> field.classList.remove('hurt'), 180);
          if(lives <= 0){ end(); return; }
        }else if(b.y > H + 10){ b.el.remove(); score++; hud(); if(score % 5 === 0) snd('point'); }
        else keep.push(b);
      }
      bats = keep; raf = requestAnimationFrame(frame);
    }
    function end(){
      if(over) return; over = true; cancelAnimationFrame(raf); snd('win');
      setTimeout(()=> api.finish({ rating: clamp(Math.round(score * 2.2), 0, 100), score, better: 'high', valid: true, text: `コウモリを ${score} 匹 よけた！` }), 500);
    }
    press(field, (e)=>{ const r = field.getBoundingClientRect(); move(e.clientX < r.left + r.width / 2 ? -1 : 1); });
    const key = (e)=>{ if(e.key === 'ArrowLeft'){ e.preventDefault(); move(-1); } else if(e.key === 'ArrowRight'){ e.preventDefault(); move(1); } };
    document.addEventListener('keydown', key);
    setMe(); hud(); raf = requestAnimationFrame(frame);
    return ()=>{ over = true; cancelAnimationFrame(raf); document.removeEventListener('keydown', key); };
  }

  /* ---------- 2) ともしびメモリー ---------- */
  function gameGlowMem(stage, api){
    const wrap = $('div', 'm3-wrap'), info = $('div', 'g-score', ''), grid = $('div', 'm3-grid'), msg = $('div', 'm3-msg', '');
    wrap.append(info, grid, msg, $('div', 'g-hint', '光ったともしびの場所を覚えて、全部タップ！ ラウンドが進むほど増えていきます。まちがえたら終わり。'));
    stage.append(wrap);
    let level = 1, size = 0, cells = [], targets = new Set(), picked = new Set(), phase = 'show', over = false; const timers = [];
    const later = (fn, ms)=>{ const t = setTimeout(fn, ms); timers.push(t); return t; };
    const hud = ()=>{ info.textContent = `🕯 ラウンド ${level}`; };
    function build(sz){
      size = sz; grid.innerHTML = ''; grid.style.gridTemplateColumns = `repeat(${sz}, 1fr)`; cells = [];
      for(let i = 0; i < sz * sz; i++){ const c = $('button', 'm3-cell', '🕯'); c.type = 'button'; c.style.opacity = '.35'; press(c, ()=> tap(i)); grid.append(c); cells.push(c); }
    }
    function reset(){ cells.forEach(c=>{ c.classList.remove('ok', 'ng', 'm4-lit'); c.style.opacity = '.35'; }); }
    function round(){
      const sz = level < 5 ? 3 : 4; if(sz !== size) build(sz); reset(); hud();
      const count = Math.min(sz * sz - 2, 2 + Math.floor((level + 1) / 2));
      targets = new Set(shuffle([...Array(sz * sz).keys()]).slice(0, count)); picked = new Set(); phase = 'show'; msg.textContent = '👀 覚えて…';
      later(()=>{ targets.forEach(i=>{ cells[i].classList.add('m4-lit'); cells[i].style.opacity = '1'; }); snd('note', 520); }, 500);
      later(()=>{ reset(); phase = 'input'; msg.textContent = `👆 ${count} か所、タップ！`; }, 500 + 700 + count * 220);
    }
    function tap(i){
      if(over || phase !== 'input' || picked.has(i)) return;
      if(targets.has(i)){
        picked.add(i); cells[i].classList.add('m4-lit', 'ok'); cells[i].style.opacity = '1'; snd('pop');
        if(picked.size === targets.size){ phase = 'wait'; msg.textContent = '✨ せいかい！'; snd('point'); level++; later(round, 800); }
      }else{
        phase = 'wait'; cells[i].classList.add('ng'); cells[i].style.opacity = '1'; snd('bad'); vib(60);
        targets.forEach(t=>{ if(!picked.has(t)){ cells[t].classList.add('m4-lit'); cells[t].style.opacity = '1'; } });
        msg.textContent = '💥 まちがい…'; over = true; const done = level - 1;
        later(()=> api.finish({ rating: clamp(done * 7, 0, 100), score: done, better: 'high', valid: true, text: `${done} ラウンド 成功` }), 1200);
      }
    }
    round();
    return ()=>{ over = true; timers.forEach(clearTimeout); };
  }

  /* ---------- 3) ガイコツ・ビート ---------- */
  function gameRhythm(stage, api){
    const LANES = 4, W = 340, H = 300, HIT = 262, SPEED = 250, GOOD = 0.2, PERFECT = 0.085, KEYS = ['d', 'f', 'j', 'k'];
    const wrap = $('div', 'm3-wrap'), info = $('div', 'g-score', ''), field = $('div', 'm4-field m4-rhythm'), msg = $('div', 'm3-msg', 'ガイコツが降ってきたら、ラインでタップ！');
    field.style.height = H + 'px'; field.style.width = W + 'px';
    const line = $('i', 'm4-hitline'); line.style.top = HIT + 'px'; field.append(line);
    const pads = $('div', 'm4-pads'), padEls = [];
    for(let i = 0; i < LANES; i++){ const p = $('button', 'm4-pad', `<span>${['🦴', '💀', '🦴', '💀'][i]}</span><small>${KEYS[i].toUpperCase()}</small>`); p.type = 'button'; pads.append(p); padEls.push(p); }
    wrap.append(info, field, pads, msg); stage.append(wrap);
    const notes = []; let tt = 1.4;
    for(let k = 0; k < 64; k++){ notes.push({ t: tt, lane: rnd(LANES), done: false, el: null }); if(k > 14 && Math.random() < 0.22) notes.push({ t: tt, lane: (notes[notes.length - 1].lane + 1 + rnd(LANES - 1)) % LANES, done: false, el: null }); tt += 0.42 + Math.random() * 0.1; }
    const endAt = tt + 0.8;
    let score = 0, combo = 0, best = 0, perfect = 0, over = false, raf = 0; const t0 = performance.now();
    const hud = ()=>{ info.textContent = `💀 ${score} 点   コンボ ${combo}`; };
    function judge(lane){
      if(over) return; const now = (performance.now() - t0) / 1000;
      padEls[lane].classList.add('hit'); setTimeout(()=> padEls[lane].classList.remove('hit'), 90);
      let target = null;
      for(const n of notes){ if(!n.done && n.lane === lane && Math.abs(n.t - now) <= GOOD && (!target || n.t < target.t)) target = n; }
      if(!target) return;
      const d = Math.abs(target.t - now); target.done = true; if(target.el){ target.el.remove(); target.el = null; }
      combo++; best = Math.max(best, combo);
      const pts = (d <= PERFECT ? 3 : 2) + (combo >= 10 ? 1 : 0); if(d <= PERFECT) perfect++;
      score += pts; msg.textContent = d <= PERFECT ? `🎉 パーフェクト！ +${pts}` : `いいね +${pts}`; snd(d <= PERFECT ? 'point' : 'pop'); hud();
    }
    function frame(){
      if(over) return; const now = (performance.now() - t0) / 1000;
      for(const n of notes){
        if(n.done) continue;
        const y = HIT - (n.t - now) * SPEED;
        if(!n.el && y > -40){ n.el = $('div', 'm4-note', '💀'); n.el.style.left = (n.lane * (W / LANES) + W / LANES / 2) + 'px'; field.append(n.el); }
        if(n.el) n.el.style.top = y + 'px';
        if(now - n.t > GOOD){ n.done = true; if(n.el){ n.el.remove(); n.el = null; } if(combo > 0){ msg.textContent = '…ミス'; snd('bad'); } combo = 0; hud(); }
      }
      if(now > endAt){ end(); return; }
      raf = requestAnimationFrame(frame);
    }
    function end(){
      if(over) return; over = true; cancelAnimationFrame(raf); snd('win');
      setTimeout(()=> api.finish({ rating: clamp(Math.round(score / 2), 0, 100), score, better: 'high', valid: true, text: `${score} 点(パーフェクト ${perfect} 回 / 最大コンボ ${best})` }), 500);
    }
    padEls.forEach((p, i)=> press(p, ()=> judge(i)));
    press(field, (e)=>{ const r = field.getBoundingClientRect(); judge(clamp(Math.floor((e.clientX - r.left) / r.width * LANES), 0, LANES - 1)); });
    const key = (e)=>{ if(e.repeat) return; const i = KEYS.indexOf((e.key || '').toLowerCase()); if(i >= 0){ e.preventDefault(); judge(i); } };
    document.addEventListener('keydown', key);
    hud(); raf = requestAnimationFrame(frame);
    return ()=>{ over = true; cancelAnimationFrame(raf); document.removeEventListener('keydown', key); };
  }

  /* ---------- 4) かぼちゃふくらまし(チキンレース) ---------- */
  function gamePuff(stage, api){
    const ROUNDS = 5;
    const wrap = $('div', 'm3-wrap'), info = $('div', 'g-score', ''), box = $('div', 'm4-pumpbox'), pump = $('div', 'm4-pump', '🎃'), now = $('div', 'm3-msg', '');
    box.append(pump);
    const row = $('div', 'm3-two'), puff = $('button', 'm3-side treat', '<span>💨</span><small>ふくらます</small>'), bank = $('button', 'm3-side', '<span>💰</span><small>ためる</small>');
    puff.type = bank.type = 'button'; row.append(puff, bank);
    wrap.append(info, box, now, row, $('div', 'g-hint', 'ふくらませるほど1回ごとの点が増えるけど、いつ破裂するかは分からない！ 「ためる」で点数をキープ。破裂したらその回の点は0。5回戦の合計点で勝負。')); stage.append(wrap);
    let round = 1, taps = 0, burst = 0, pts = 0, total = 0, locked = false, over = false; const timers = [];
    const later = (fn, ms)=>{ const t = setTimeout(fn, ms); timers.push(t); return t; };
    const hud = ()=>{ info.textContent = `🎃 ${round} / ${ROUNDS} 回戦   合計 ${total} 点`; };
    function fresh(){ taps = 0; pts = 0; burst = 7 + rnd(18); locked = false; pump.textContent = '🎃'; pump.style.transform = 'scale(.6)'; now.textContent = 'ふくらませて、いいところで「ためる」！'; hud(); }
    function nextRound(){
      if(round >= ROUNDS){ over = true; snd('win'); api.finish({ rating: clamp(Math.round(total / 3.2), 0, 100), score: total, better: 'high', valid: true, text: `合計 ${total} 点` }); return; }
      round++; fresh();
    }
    press(puff, ()=>{
      if(over || locked) return; taps++;
      if(taps >= burst){ locked = true; pump.textContent = '💥'; pump.style.transform = 'scale(1.5)'; now.textContent = `💥 破裂！ ${pts} 点がパー…`; snd('bad'); vib([40, 30, 40]); later(nextRound, 1100); return; }
      pts += taps; pump.style.transform = `scale(${(0.6 + taps * 0.045).toFixed(3)})`; now.textContent = `この回: ${pts} 点(次は +${taps + 1})`; snd('tick');
    });
    press(bank, ()=>{
      if(over || locked) return; if(pts <= 0){ now.textContent = 'まず、ふくらませてね'; return; }
      locked = true; total += pts; now.textContent = `💰 ${pts} 点ゲット！`; snd('point'); later(nextRound, 800);
    });
    fresh();
    return ()=>{ over = true; timers.forEach(clearTimeout); };
  }

  /* ---------- 5) もじならべ ---------- */
  const WORDS = ['かぼちゃ', 'おばけ', 'まじょ', 'ゆうれい', 'こうもり', 'ほうき', 'ろうそく', 'がいこつ', 'ぞんび', 'おかし', 'はかば', 'くろねこ', 'ひとだま', 'やかた', 'まもの', 'のろい', 'ようかい', 'まほう', 'ゆきおんな', 'ふくろう', 'くものす', 'ちみもうりょう', 'どくろ', 'かめん', 'ばんぱいあ', 'おおかみ', 'こうもりがさ', 'かぼちゃのたね'];
  function gameWord(stage, api){
    const TIME = 45;
    const wrap = $('div', 'm3-wrap'), info = $('div', 'g-score', ''), bar = $('div', 'm2-timebar', '<i></i>'), slots = $('div', 'm4-slots'), tiles = $('div', 'm4-tiles'), msg = $('div', 'm3-msg', '');
    const skip = $('button', 'mg-btn ghost', 'パス'); skip.type = 'button';
    wrap.append(info, bar, slots, tiles, msg, skip, $('div', 'g-hint', 'ばらばらの文字を、正しい順番にタップ！ ことばは全部ハロウィンのもの。45秒で何個つくれる？')); stage.append(wrap);
    let score = 0, deck = shuffle(WORDS), di = 0, word = [], pos = 0, over = false, t0 = performance.now(), iv = 0;
    const left = ()=> Math.max(0, TIME - (performance.now() - t0) / 1000);
    const hud = ()=>{ const l = left(); info.textContent = `🔤 ${score} 語   ⏱ ${l.toFixed(0)}`; bar.firstChild.style.width = (l / TIME * 100) + '%'; };
    function next(){
      if(di >= deck.length){ deck = shuffle(WORDS); di = 0; }
      word = [...deck[di++]]; pos = 0; slots.innerHTML = ''; tiles.innerHTML = ''; msg.textContent = '';
      word.forEach(()=> slots.append($('span', 'm4-slot', '')));
      let order; do{ order = shuffle(word.map((_, i)=> i)); }while(word.length > 1 && order.every((v, i)=> word[v] === word[i]));
      order.forEach(i=>{ const b = $('button', 'm4-tile', word[i]); b.type = 'button'; press(b, ()=> tap(b, word[i])); tiles.append(b); });
    }
    function tap(b, ch){
      if(over || b.disabled) return;
      if(ch === word[pos]){
        b.disabled = true; b.classList.add('used'); slots.children[pos].textContent = ch; slots.children[pos].classList.add('on'); pos++; snd('tick');
        if(pos >= word.length){ score++; snd('point'); msg.textContent = '✨ せいかい！'; hud(); setTimeout(()=>{ if(!over) next(); }, 350); }
      }else{ b.classList.add('shake'); setTimeout(()=> b.classList.remove('shake'), 300); snd('bad'); vib(30); }
    }
    function end(){
      if(over) return; over = true; clearInterval(iv); snd('win');
      setTimeout(()=> api.finish({ rating: clamp(score * 10, 0, 100), score, better: 'high', valid: true, text: `${score} 語 つくった` }), 400);
    }
    press(skip, ()=>{ if(!over) next(); });
    iv = setInterval(()=>{ hud(); if(left() <= 0) end(); }, 100);
    next(); hud();
    return ()=>{ over = true; clearInterval(iv); };
  }

  /* ---------- 登録 ---------- */
  const NEW4 = [
    { id:'batdodge', emoji:'🦇', name:'コウモリよけ',       desc:'3本のレーンで、降ってくるコウモリをよけろ！',   unit:'匹',     better:'high', genre:'action', start:gameBatDodge },
    { id:'glowmem',  emoji:'🕯', name:'ともしびメモリー',   desc:'光った場所を覚えて、全部タップ',               unit:'ラウンド', better:'high', genre:'brain',  start:gameGlowMem },
    { id:'rhythm',   emoji:'💀', name:'ガイコツ・ビート',   desc:'降ってくるガイコツを、リズムに合わせてタップ',  unit:'点',     better:'high', genre:'reflex', start:gameRhythm },
    { id:'puffpump', emoji:'🎃', name:'かぼちゃふくらまし', desc:'破裂する前に「ためる」！ チキンレース',        unit:'点',     better:'high', genre:'brain',  start:gamePuff },
    { id:'wordscr',  emoji:'🔤', name:'もじならべ',         desc:'ばらばらの文字を並べて、ハロウィンのことばに',  unit:'語',     better:'high', genre:'puzzle', start:gameWord }
  ];
  NEW4.forEach(g=> window.CBMini.register({ ...g, isNew: true }));
})();

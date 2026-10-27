/* =====================================================================
   🕹 ミニゲーム追加 v3.9(ハロウィン パート3)— 8本
   おばけ10秒れんだ / ぴったりストップ / ぴったり5秒 / ちがうのはどれ？
   おばけ仕分け / ハイ＆ロー / おばけじゃんけん / かぼちゃ数え

   足し方は README の「ミニゲーム追加の手順」と同じ:
     ① backend/minigames.py の GAMES に範囲を足す  ② ここの NEW3 に { id, emoji, name, desc, unit, better, genre, start } を足す
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
  const pick = (arr)=> arr[rnd(arr.length)];
  const shuffle = (a)=>{ a = a.slice(); for(let i = a.length - 1; i > 0; i--){ const j = rnd(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const press = (el, fn)=> el.addEventListener('pointerdown', (e)=>{ e.preventDefault(); fn(e); });

  /* ---------- 1) おばけ10秒れんだ ---------- */
  function gameTapSpeed(stage, api){
    const TIME = 10;
    const wrap = $('div', 'm3-wrap'), info = $('div', 'g-score', '👻 0 回'), bar = $('div', 'm2-timebar', '<i></i>');
    const btn = $('button', 'm3-bigtap', '<span>👻</span><small>タップではじめる！</small>'); btn.type = 'button';
    wrap.append(info, bar, btn); stage.append(wrap);
    let n = 0, started = false, t0 = 0, iv = 0, over = false;
    const left = ()=> started ? Math.max(0, TIME - (performance.now() - t0) / 1000) : TIME;
    const hud = ()=>{ const l = left(); info.textContent = `👻 ${n} 回  ⏱ ${l.toFixed(1)}`; bar.firstChild.style.width = (l / TIME * 100) + '%'; };
    function end(){
      if(over) return; over = true; clearInterval(iv); snd('win');
      setTimeout(()=> api.finish({ rating: clamp(Math.round(n / 70 * 100), 0, 100), score: n, better: 'high', valid: true, text: `10秒で ${n} 回！(1秒に ${(n / 10).toFixed(1)} 回)` }), 400);
    }
    press(btn, ()=>{
      if(over) return;
      if(started && performance.now() - t0 >= TIME * 1000){ end(); return; }
      if(!started){ started = true; t0 = performance.now(); iv = setInterval(()=>{ hud(); if(left() <= 0) end(); }, 50); btn.querySelector('small').textContent = 'れんだ！！'; }
      n++; btn.classList.add('hit'); setTimeout(()=> btn.classList.remove('hit'), 60);
      if(n % 5 === 0) snd('tick'); hud();
    });
    btn.addEventListener('keydown', (e)=>{ if((e.key === ' ' || e.key === 'Enter') && !e.repeat){ e.preventDefault(); btn.dispatchEvent(new Event('pointerdown')); } });   // パソコンのキー連打(スペース/Enter)も数える
    hud();
    return ()=>{ over = true; clearInterval(iv); };
  }

  /* ---------- 2) ぴったりストップ ---------- */
  function gameTiming(stage, api){
    const ROUNDS = 5;
    const wrap = $('div', 'm3-wrap'), info = $('div', 'g-score', ''), track = $('div', 'm3-track', '<i class="m3-zone"></i><b class="m3-mark"></b>');
    const msg = $('div', 'm3-msg', 'マークが真ん中に来たら、ストップ！'), btn = $('button', 'primary-btn m3-stop', '🛑 ストップ！'); btn.type = 'button';
    wrap.append(info, track, msg, btn); stage.append(wrap);
    const mark = track.querySelector('.m3-mark');
    let round = 1, total = 0, speed = 0.9, t0 = performance.now(), raf = 0, stopped = false, over = false;
    const pos = (t)=>{ const p = ((t - t0) / 1000 * speed) % 2; return p <= 1 ? p : 2 - p; };
    const hud = ()=>{ info.textContent = `🎯 ${round} / ${ROUNDS} 回目   合計 ${total} 点`; };
    function frame(t){ if(over) return; mark.style.left = (pos(t) * 100) + '%'; raf = requestAnimationFrame(frame); }
    function stop(){
      if(over || stopped) return; stopped = true;
      const p = pos(performance.now()), pts = clamp(Math.round(100 - Math.abs(p - 0.5) * 400), 0, 100);
      total += pts; cancelAnimationFrame(raf); mark.style.left = (p * 100) + '%';
      msg.textContent = pts >= 95 ? `🎉 パーフェクト！ +${pts}` : pts >= 70 ? `👏 いいね！ +${pts}` : `+${pts}`; snd(pts >= 70 ? 'pop' : 'bad'); vib(pts >= 95 ? [20, 30, 20] : 15); hud();
      setTimeout(()=>{
        if(over) return;
        if(round >= ROUNDS){ over = true; snd('win'); api.finish({ rating: clamp(Math.round(total / 5), 0, 100), score: total, better: 'high', valid: true, text: `合計 ${total} 点 / 500点` }); return; }
        round++; speed *= 1.18; stopped = false; t0 = performance.now(); msg.textContent = 'つぎは、もっと速いよ！'; hud(); raf = requestAnimationFrame(frame);
      }, 800);
    }
    press(btn, stop); press(track, stop);
    hud(); raf = requestAnimationFrame(frame);
    return ()=>{ over = true; cancelAnimationFrame(raf); };
  }

  /* ---------- 3) ぴったり5秒 ---------- */
  function gameHold(stage, api){
    const TRIES = 3, TARGET = 5000;
    const wrap = $('div', 'm3-wrap'), info = $('div', 'g-score', ''), disp = $('div', 'm3-clock', '0.00'), msg = $('div', 'm3-msg', '');
    const btn = $('button', 'm3-bigtap hold', '<span>⏳</span><small>押しているあいだ、数えよう</small>'); btn.type = 'button';
    const hint = $('div', 'g-hint', '押している間だけ時間が進みます。最初の1秒だけ数字が見えて、そのあと隠れます。ちょうど 5.00 秒で離そう！');
    wrap.append(info, disp, btn, msg, hint); stage.append(wrap);
    let tryNo = 1, errs = [], down = 0, raf = 0, over = false, locked = false;
    const hud = ()=>{ info.textContent = `⏳ ${tryNo} / ${TRIES} 回目` + (errs.length ? `   ズレ ${errs.map(e=> e + 'ms').join(' / ')}` : ''); };
    function tick(){
      if(!down) return;
      const el = performance.now() - down;
      disp.textContent = el < 1000 ? (el / 1000).toFixed(2) : '?.??';
      if(el >= 10000){ release(); return; }
      raf = requestAnimationFrame(tick);
    }
    function start(){ if(over || locked || down) return; down = performance.now(); btn.classList.add('hit'); snd('tick'); raf = requestAnimationFrame(tick); }
    function release(){
      if(!down) return;
      const held = Math.min(10000, performance.now() - down); down = 0; cancelAnimationFrame(raf); btn.classList.remove('hit');
      const err = Math.min(5000, Math.round(Math.abs(held - TARGET)));
      errs.push(err); disp.textContent = (held / 1000).toFixed(2); locked = true; hud();
      msg.textContent = err <= 50 ? `🎉 ほぼピッタリ！ ズレ ${err}ms` : `ズレ ${err}ms(${held < TARGET ? '早い' : '遅い'})`; snd(err <= 150 ? 'pop' : 'bad');
      setTimeout(()=>{
        if(over) return;
        if(errs.length >= TRIES){
          over = true; const avg = Math.round(errs.reduce((a, b)=> a + b, 0) / errs.length); snd('win');
          api.finish({ rating: clamp(Math.round(100 - avg / 10), 0, 100), score: avg, better: 'low', valid: true, text: `3回の平均ズレ ${avg}ms` }); return;
        }
        tryNo++; locked = false; disp.textContent = '0.00'; msg.textContent = ''; hud();
      }, 1100);
    }
    press(btn, start);
    ['pointerup', 'pointercancel', 'pointerleave'].forEach(ev=> btn.addEventListener(ev, release));
    hud();
    return ()=>{ over = true; cancelAnimationFrame(raf); };
  }

  /* ---------- 4) ちがうのはどれ？ ---------- */
  const PAIRS = [['🎃', '🍊'], ['👻', '☁️'], ['🍬', '🍭'], ['🕷', '🐜'], ['💀', '☠️'], ['🌙', '🌛'], ['⭐', '🌟'], ['🍎', '🍅'], ['😀', '😃'], ['🐱', '🐈'], ['🔵', '🟦'], ['🟠', '🟧']];
  function gameOdd(stage, api){
    const TIME = 30;
    const wrap = $('div', 'm3-wrap'), info = $('div', 'g-score', ''), bar = $('div', 'm2-timebar', '<i></i>'), grid = $('div', 'm3-grid');
    wrap.append(info, bar, grid); stage.append(wrap);
    let score = 0, miss = 0, tLeft = TIME, over = false, iv = 0, lock = false;
    const hud = ()=>{ info.textContent = `🔎 ${score} 問正解  ⏱ ${Math.ceil(tLeft)}`; bar.firstChild.style.width = (tLeft / TIME * 100) + '%'; };
    function next(){
      const n = score < 5 ? 3 : score < 12 ? 4 : score < 22 ? 5 : 6, [a, b] = shuffle(pick(PAIRS)), odd = rnd(n * n);
      grid.style.gridTemplateColumns = `repeat(${n}, 1fr)`; grid.innerHTML = ''; lock = false;
      for(let i = 0; i < n * n; i++){
        const c = $('button', 'm3-cell', i === odd ? b : a); c.type = 'button'; c.style.fontSize = (n >= 5 ? 26 : 32) + 'px';
        press(c, ()=> answer(i === odd, c)); grid.append(c);
      }
    }
    function answer(ok, c){
      if(over || lock) return; lock = true;
      if(ok){ score++; snd('pop'); c.classList.add('ok'); } else { miss++; tLeft = Math.max(0, tLeft - 2); snd('bad'); vib(30); c.classList.add('ng'); }
      hud(); setTimeout(()=>{ if(!over) next(); }, 140);
    }
    iv = setInterval(()=>{
      tLeft -= .1; hud();
      if(tLeft <= 0 && !over){ over = true; clearInterval(iv); snd('win'); setTimeout(()=> api.finish({ rating: clamp(score * 5, 0, 100), score, better: 'high', valid: true, text: `${score} 問 正解(まちがい ${miss})` }), 500); }
    }, 100);
    hud(); next();
    return ()=>{ over = true; clearInterval(iv); };
  }

  /* ---------- 5) おばけ仕分け ---------- */
  const TREATS = ['🍬', '🍭', '🍫', '🍩', '🍪', '🧁', '🍰'], TRICKS = ['💀', '👻', '🕷', '🦇', '🧟', '🕸', '🪦'];
  function gameSort(stage, api){
    const TIME = 30;
    const wrap = $('div', 'm3-wrap'), info = $('div', 'g-score', ''), bar = $('div', 'm2-timebar', '<i></i>'), card = $('div', 'm3-card', '');
    const row = $('div', 'm3-two'), bTrick = $('button', 'm3-side trick', '👻<small>いたずら</small>'), bTreat = $('button', 'm3-side treat', '🍬<small>おかし</small>');
    bTrick.type = bTreat.type = 'button'; row.append(bTrick, bTreat);
    wrap.append(info, bar, card, row, $('div', 'g-hint', 'おかしは右、いたずら(おばけ・ガイコツなど)は左！ まちがえると −2秒')); stage.append(wrap);
    let score = 0, miss = 0, tLeft = TIME, over = false, iv = 0, cur = null;
    const hud = ()=>{ info.textContent = `🍬 ${score} 問正解  ⏱ ${Math.ceil(tLeft)}`; bar.firstChild.style.width = (tLeft / TIME * 100) + '%'; };
    function next(){ const treat = Math.random() < .5; cur = { treat, e: pick(treat ? TREATS : TRICKS) }; card.textContent = cur.e; card.classList.remove('ok', 'ng'); }
    function answer(treat){
      if(over) return;
      if(treat === cur.treat){ score++; snd('pop'); card.classList.add('ok'); } else { miss++; tLeft = Math.max(0, tLeft - 2); snd('bad'); vib(30); card.classList.add('ng'); }
      hud(); setTimeout(()=>{ if(!over) next(); }, 90);
    }
    press(bTreat, ()=> answer(true)); press(bTrick, ()=> answer(false));
    iv = setInterval(()=>{
      tLeft -= .1; hud();
      if(tLeft <= 0 && !over){ over = true; clearInterval(iv); snd('win'); setTimeout(()=> api.finish({ rating: clamp(Math.round(score * 2.2), 0, 100), score, better: 'high', valid: true, text: `${score} 問 正解(まちがい ${miss})` }), 500); }
    }, 100);
    hud(); next();
    return ()=>{ over = true; clearInterval(iv); };
  }

  /* ---------- 6) ハイ＆ロー ---------- */
  function gameHighLow(stage, api){
    const wrap = $('div', 'm3-wrap'), info = $('div', 'g-score', ''), card = $('div', 'm3-card num', '');
    const row = $('div', 'm3-two'), bLow = $('button', 'm3-side', '⬇<small>もっと小さい</small>'), bHigh = $('button', 'm3-side', '⬆<small>もっと大きい</small>');
    const msg = $('div', 'm3-msg', '');
    bLow.type = bHigh.type = 'button'; row.append(bLow, bHigh);
    wrap.append(info, card, msg, row, $('div', 'g-hint', '次の数字(1〜13)は、いまより大きい？ 小さい？ 同じ数字ならひきわけ。連勝を伸ばそう！')); stage.append(wrap);
    let cur = 1 + rnd(13), streak = 0, over = false, lock = false;
    const show = ()=>{ card.textContent = cur; info.textContent = `🃏 ${streak} 連勝`; };
    function guess(high){
      if(over || lock) return; lock = true;
      const nx = 1 + rnd(13);
      card.textContent = nx;
      if(nx === cur){ msg.textContent = '😐 ひきわけ!'; snd('tick'); setTimeout(()=>{ msg.textContent = ''; lock = false; show(); }, 600); return; }
      if((nx > cur) === high){
        streak++; cur = nx; msg.textContent = '⭕ 正解！'; snd('pop');
        if(streak >= 60){ over = true; setTimeout(()=> api.finish({ rating: 100, score: streak, better: 'high', valid: true, text: `${streak} 連勝！ 完全制覇！` }), 500); return; }
        setTimeout(()=>{ msg.textContent = ''; lock = false; show(); }, 550);
      } else {
        over = true; msg.textContent = '❌ ざんねん…'; snd('bad'); vib(40); info.textContent = `🃏 ${streak} 連勝`;
        setTimeout(()=> api.finish({ rating: clamp(streak * 8, 0, 100), score: streak, better: 'high', valid: true, text: `${streak} 連勝` }), 900);
      }
    }
    press(bHigh, ()=> guess(true)); press(bLow, ()=> guess(false));
    show();
    return ()=>{ over = true; };
  }

  /* ---------- 7) おばけじゃんけん ---------- */
  function gameRps(stage, api){
    const H = ['✊', '✌️', '🖐'];       // 0=グー 1=チョキ 2=パー(i は (i+1)%3 に勝つ)
    const wrap = $('div', 'm3-wrap'), info = $('div', 'g-score', ''), cpu = $('div', 'm3-card', '👻'), msg = $('div', 'm3-msg', 'おばけに勝ち続けよう！');
    const row = $('div', 'm3-three');
    H.forEach((h, i)=>{ const b = $('button', 'm3-hand', h); b.type = 'button'; press(b, ()=> play(i)); row.append(b); });
    wrap.append(info, cpu, msg, row); stage.append(wrap);
    let streak = 0, over = false, lock = false;
    const hud = ()=>{ info.textContent = `✌️ ${streak} 連勝`; };
    function play(me){
      if(over || lock) return; lock = true;
      const c = rnd(3); cpu.textContent = H[c];
      if(me === c){ msg.textContent = '😐 あいこ！'; snd('tick'); setTimeout(()=>{ lock = false; cpu.textContent = '👻'; msg.textContent = 'もういちど！'; }, 600); return; }
      const win = ((me + 1) % 3) === c;           // グー(0)→チョキ(1)、チョキ(1)→パー(2)、パー(2)→グー(0) に勝つ
      if(win){
        streak++; msg.textContent = '⭕ かった！'; snd('pop'); hud();
        if(streak >= 60){ over = true; setTimeout(()=> api.finish({ rating: 100, score: streak, better: 'high', valid: true, text: `${streak} 連勝！ 完全制覇！` }), 500); return; }
        setTimeout(()=>{ lock = false; cpu.textContent = '👻'; msg.textContent = 'つぎも勝とう！'; }, 650);
      } else {
        over = true; msg.textContent = '❌ まけた…'; snd('bad'); vib(40);
        setTimeout(()=> api.finish({ rating: clamp(streak * 8, 0, 100), score: streak, better: 'high', valid: true, text: `${streak} 連勝` }), 900);
      }
    }
    hud();
    return ()=>{ over = true; };
  }

  /* ---------- 8) かぼちゃ数え ---------- */
  function gamePump(stage, api){
    const wrap = $('div', 'm3-wrap'), info = $('div', 'g-score', ''), field = $('div', 'm3-field'), msg = $('div', 'm3-msg', ''), opts = $('div', 'm2-opts');
    wrap.append(info, field, msg, opts); stage.append(wrap);
    let level = 0, over = false, timer = 0, ans = 0, prevN = 0;
    const hud = ()=>{ info.textContent = `🎃 ${level} 問クリア`; };
    function round(){
      opts.innerHTML = ''; msg.textContent = 'よーく見て…！'; field.innerHTML = '';
      // 個数は「問が進むほど多くなりやすい」だけで、毎回ばらばら(+1ずつ増えるような規則性は出さない)。直前と同じ数も出さない
      const lo = Math.min(16, 3 + Math.floor(level * 0.7)), hi = Math.min(20, lo + 2 + Math.floor(level / 3));
      let n; do{ n = lo + rnd(hi - lo + 1); }while(n === prevN && hi > lo);
      prevN = n;
      const cells = shuffle(Array.from({ length: 20 }, (_, i)=> i)).slice(0, n);
      ans = n;
      cells.forEach(ci=>{
        const e = $('span', 'm3-pump', '🎃'); e.style.left = ((ci % 5) * 20 + 2 + rnd(6)) + '%'; e.style.top = (Math.floor(ci / 5) * 25 + 2 + rnd(8)) + '%'; field.append(e);
      });
      timer = setTimeout(()=>{
        if(over) return; field.innerHTML = '<div class="m3-q">❓</div>'; msg.textContent = 'いくつあった？';
        const set = new Set([ans]); while(set.size < 4){ const d = ans + (rnd(7) - 3); if(d >= 1) set.add(d); }
        shuffle([...set]).forEach(v=>{ const b = $('button', 'm2-opt', String(v)); b.type = 'button'; press(b, ()=> answer(v, b)); opts.append(b); });
      }, clamp(1500 - level * 40, 700, 1500));
    }
    function answer(v, b){
      if(over) return;
      opts.querySelectorAll('button').forEach(x=> x.disabled = true);
      if(v === ans){
        level++; hud(); snd('pop'); b.classList.add('ok'); msg.textContent = '⭕ 正解！';
        if(level >= 60){ over = true; setTimeout(()=> api.finish({ rating: 100, score: level, better: 'high', valid: true, text: `${level} 問 完全制覇！` }), 500); return; }
        timer = setTimeout(round, 600);
      } else {
        over = true; b.classList.add('ng'); snd('bad'); vib(40); msg.textContent = `❌ 正解は ${ans} 個でした`;
        timer = setTimeout(()=> api.finish({ rating: clamp(level * 7, 0, 100), score: level, better: 'high', valid: true, text: `${level} 問クリア` }), 1100);
      }
    }
    hud(); round();
    return ()=>{ over = true; clearTimeout(timer); };
  }

  /* ---------- 登録 ---------- */
  const NEW3 = [
    { id:'tapspeed',  emoji:'👻', name:'おばけ10秒れんだ',   desc:'10秒でどれだけタップできる？',               unit:'回',   better:'high', genre:'reflex', start:gameTapSpeed },
    { id:'timing',    emoji:'🎯', name:'ぴったりストップ',   desc:'動くマークを真ん中でピタッと止めろ！',         unit:'点',   better:'high', genre:'reflex', start:gameTiming },
    { id:'holdexact', emoji:'⏳', name:'ぴったり5秒',        desc:'押して、ちょうど5秒で離そう(3回の平均のズレ)', unit:'ms',   better:'low',  genre:'reflex', start:gameHold, fmt:(n)=> n + 'ms' },
    { id:'oddone',    emoji:'🔎', name:'ちがうのはどれ？',   desc:'ほんの少しちがう1つを、30秒で見つけろ',        unit:'問',   better:'high', genre:'puzzle', start:gameOdd },
    { id:'sortg',     emoji:'🍬', name:'おばけ仕分け',       desc:'おかし？ いたずら？ すばやく仕分け！30秒',     unit:'問',   better:'high', genre:'action', start:gameSort },
    { id:'highlow',   emoji:'🃏', name:'ハイ＆ロー',         desc:'次の数字は大きい？小さい？ 連勝をめざせ',      unit:'連勝', better:'high', genre:'brain',  start:gameHighLow },
    { id:'rps',       emoji:'✌️', name:'おばけじゃんけん',   desc:'おばけに何連勝できるかな？',                   unit:'連勝', better:'high', genre:'brain',  start:gameRps },
    { id:'pumpcount', emoji:'🎃', name:'かぼちゃ数え',       desc:'一瞬だけ出るかぼちゃの数を当てよう',           unit:'問',   better:'high', genre:'brain',  start:gamePump }
  ];
  NEW3.forEach(g=> window.CBMini.register({ ...g, isNew: true }));
})();

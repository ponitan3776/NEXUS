/* =====================================================================
   🕹 ミニゲーム集 (v3.2) — テトリス/ブロックブラスト風とは関係ない、独立した6本のゲーム
   ・script.js が公開する window.CB (コイン・XP・イベント報告など)を使って報酬を渡す
   ・各ゲームは  start(stage, api) → 後片付け関数  を返す。終わったら api.finish({...}) を呼ぶだけ
   ===================================================================== */
(function(){
  'use strict';
  const CB = ()=> window.CB || {};
  const $ = (tag, cls, html)=>{ const e = document.createElement(tag); if(cls) e.className = cls; if(html != null) e.innerHTML = html; return e; };
  const clamp = (v,a,b)=> Math.max(a, Math.min(b, v));
  const rnd = (n)=> Math.floor(Math.random()*n);
  const shuffle = (a)=>{ for(let i=a.length-1;i>0;i--){ const j = rnd(i+1); [a[i],a[j]] = [a[j],a[i]]; } return a; };
  const REC_KEY = 'candyblast-mini-v1';
  let rec = {};
  try{ rec = JSON.parse(localStorage.getItem(REC_KEY) || '{}'); }catch(e){}
  const saveRec = ()=>{ try{ localStorage.setItem(REC_KEY, JSON.stringify(rec)); }catch(e){} };

  /* ---------- テストしやすいよう、純粋なロジックは外に出しておく ---------- */
  // 2048: 1行を左に寄せて合体する → [新しい行, 得点]
  function slideLine(line){
    const a = line.filter(Boolean); let gain = 0;
    for(let i=0;i<a.length-1;i++){ if(a[i] === a[i+1]){ a[i] *= 2; gain += a[i]; a.splice(i+1,1); } }
    while(a.length < line.length) a.push(0);
    return [a, gain];
  }
  // マインスイーパー: 8近傍
  function neighbors(i, R, C){
    const r = Math.floor(i/C), c = i%C, out = [];
    for(let dr=-1;dr<=1;dr++) for(let dc=-1;dc<=1;dc++){
      if(!dr && !dc) continue;
      const rr = r+dr, cc = c+dc;
      if(rr>=0 && rr<R && cc>=0 && cc<C) out.push(rr*C+cc);
    }
    return out;
  }
  // 最初に開けたマス(とその周り)には地雷を置かない
  function genMines(R, C, M, safe){
    const ban = new Set([safe, ...neighbors(safe, R, C)]);
    const pool = []; for(let i=0;i<R*C;i++) if(!ban.has(i)) pool.push(i);
    shuffle(pool);
    const mine = new Array(R*C).fill(false);
    pool.slice(0, M).forEach(i=> mine[i] = true);
    const adj = mine.map((_,i)=> mine[i] ? -1 : neighbors(i,R,C).filter(n=>mine[n]).length);
    return { mine, adj };
  }

  /* =====================================================================
     ① 2048 — スワイプで数字を合体
     ===================================================================== */
  function game2048(stage, api){
    const N = 4;
    let grid = Array.from({length:N}, ()=>new Array(N).fill(0));
    let score = 0, over = false, lastNew = -1;
    const wrap = $('div','g2048'), sc = $('div','g-score'), board = $('div','g2048-board'),
          hint = $('div','g-hint','スワイプ / 矢印キーで動かそう'), quit = $('button','mg-btn ghost','ここで終了して報酬をもらう');
    quit.type = 'button';
    wrap.append(sc, board, hint, quit); stage.append(wrap);
    const cells = []; for(let i=0;i<N*N;i++){ const c = $('div','t'); board.append(c); cells.push(c); }
    const colorOf = (v)=> `hsl(${(Math.log2(v)*37 + 18) % 360} 68% ${clamp(60 - Math.log2(v)*1.6, 38, 60)}%)`;
    function addTile(){
      const e = []; grid.forEach((row,r)=>row.forEach((v,c)=>{ if(!v) e.push([r,c]); }));
      if(!e.length) return;
      const [r,c] = e[rnd(e.length)]; grid[r][c] = Math.random() < .9 ? 2 : 4; lastNew = r*N+c;
    }
    function render(){
      sc.textContent = `スコア ${score}`;
      cells.forEach((el,i)=>{
        const v = grid[Math.floor(i/N)][i%N];
        el.textContent = v || '';
        el.className = 't' + (i === lastNew ? ' pop' : '');
        el.style.background = v ? colorOf(v) : '';
        el.style.fontSize = v >= 1024 ? '17px' : v >= 128 ? '22px' : '27px';
        el.style.color = v ? '#fff' : '';
      });
    }
    const pos = (dir,i,j)=> dir===0 ? [i,j] : dir===2 ? [i,N-1-j] : dir===1 ? [j,i] : [N-1-j,i];   // 0左 1上 2右 3下
    function canMove(){
      for(let d=0; d<4; d++){
        for(let i=0;i<N;i++){
          const line = []; for(let j=0;j<N;j++){ const [r,c] = pos(d,i,j); line.push(grid[r][c]); }
          const [nl] = slideLine(line);
          if(nl.some((v,j)=>v !== line[j])) return true;
        }
      }
      return false;
    }
    function move(dir){
      if(over) return;
      let moved = false, gain = 0;
      const g2 = grid.map(r=>r.slice());
      for(let i=0;i<N;i++){
        const line = []; for(let j=0;j<N;j++){ const [r,c] = pos(dir,i,j); line.push(grid[r][c]); }
        const [nl, g] = slideLine(line); gain += g;
        for(let j=0;j<N;j++){ const [r,c] = pos(dir,i,j); if(grid[r][c] !== nl[j]) moved = true; g2[r][c] = nl[j]; }
      }
      if(!moved) return;
      grid = g2; score += gain; addTile(); render();
      if(gain) CB().sound && CB().sound('place');
      if(!canMove()){ over = true; setTimeout(end, 700); }
    }
    function end(){
      const max = Math.max(...grid.flat());
      api.finish({ rating: clamp(Math.round(score/45), 0, 100), score, better:'high', text:`スコア ${score} ／ 最大タイル ${max}`, valid:true });
    }
    let sx = 0, sy = 0, down = false;
    board.addEventListener('pointerdown', e=>{ sx = e.clientX; sy = e.clientY; down = true; });
    board.addEventListener('pointerup', e=>{
      if(!down) return; down = false;
      const dx = e.clientX - sx, dy = e.clientY - sy;
      if(Math.max(Math.abs(dx), Math.abs(dy)) < 24) return;
      move(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 2 : 0) : (dy > 0 ? 3 : 1));
    });
    const onKey = (e)=>{ const m = { ArrowLeft:0, ArrowUp:1, ArrowRight:2, ArrowDown:3, a:0, w:1, d:2, s:3 }[e.key]; if(m != null){ e.preventDefault(); move(m); } };
    window.addEventListener('keydown', onKey);
    quit.addEventListener('click', ()=>{ if(!over){ over = true; end(); } });
    addTile(); addTile(); render();
    return ()=> window.removeEventListener('keydown', onKey);
  }

  /* =====================================================================
     ② パンプキン・スネーク
     ===================================================================== */
  function gameSnake(stage, api){
    const N = 15, S = 24;
    const wrap = $('div','gsnake'), info = $('div','g-score','🎃 0 個'), cv = $('canvas','gs-canvas');
    cv.width = cv.height = N*S;
    const ctx = cv.getContext('2d');
    const pad = $('div','dpad', `<button type="button" data-d="up" class="up">▲</button><button type="button" data-d="left" class="left">◀</button><button type="button" data-d="right" class="right">▶</button><button type="button" data-d="down" class="down">▼</button>`);
    const msg = $('div','g-hint','スワイプ / 矢印キー / 下のボタンでスタート');
    wrap.append(info, cv, msg, pad); stage.append(wrap);
    let snake = [{x:7,y:7},{x:6,y:7},{x:5,y:7}], dir = {x:1,y:0}, next = {x:1,y:0}, food = null, score = 0, speed = 150, timer = null, started = false, dead = false;
    function place(){
      do{ food = { x:rnd(N), y:rnd(N) }; } while(snake.some(s=>s.x===food.x && s.y===food.y));
    }
    function draw(){
      ctx.fillStyle = '#120a22'; ctx.fillRect(0,0,N*S,N*S);
      ctx.fillStyle = 'rgba(255,255,255,.035)';
      for(let x=0;x<N;x++) for(let y=0;y<N;y++) if((x+y)%2===0) ctx.fillRect(x*S,y*S,S,S);
      ctx.font = `${S-4}px serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('🎃', food.x*S + S/2, food.y*S + S/2 + 1);
      snake.forEach((s,i)=>{
        ctx.fillStyle = i === 0 ? '#c8e34a' : `hsl(${95 - i*2} 70% ${52 - Math.min(i,14)}%)`;
        const pad = i === 0 ? 1 : 2;
        ctx.beginPath(); ctx.roundRect ? ctx.roundRect(s.x*S+pad, s.y*S+pad, S-pad*2, S-pad*2, 7) : ctx.rect(s.x*S+pad, s.y*S+pad, S-pad*2, S-pad*2); ctx.fill();
        if(i === 0){ ctx.fillStyle = '#120a22'; ctx.fillRect(s.x*S+7, s.y*S+8, 3, 3); ctx.fillRect(s.x*S+14, s.y*S+8, 3, 3); }
      });
    }
    function startLoop(){ clearInterval(timer); timer = setInterval(tick, speed); }
    function tick(){
      dir = next;
      const h = { x:snake[0].x + dir.x, y:snake[0].y + dir.y };
      if(h.x<0 || h.y<0 || h.x>=N || h.y>=N || snake.some(s=>s.x===h.x && s.y===h.y)) return die();
      snake.unshift(h);
      if(h.x === food.x && h.y === food.y){
        score++; info.textContent = `🎃 ${score} 個`; place();
        CB().sound && CB().sound('coin'); CB().vibrate && CB().vibrate(10);
        const sp = Math.max(70, 150 - score*3);
        if(sp !== speed){ speed = sp; startLoop(); }
      } else snake.pop();
      draw();
    }
    function die(){
      if(dead) return; dead = true; clearInterval(timer);
      CB().sound && CB().sound('gameover');
      cv.classList.add('shake');
      setTimeout(()=> api.finish({ rating: clamp(score*5, 0, 100), score, better:'high', text:`かぼちゃを ${score} 個 食べた`, valid:true }), 650);
    }
    function turn(dx, dy){
      if(dead) return;
      if(dx === -dir.x && dy === -dir.y && started) return;   // 真後ろには曲がれない
      if(!started){ started = true; msg.style.visibility = 'hidden'; startLoop(); if(dx === -dir.x && dy === -dir.y) return; }
      next = { x:dx, y:dy };
    }
    const keyMap = { ArrowUp:[0,-1], ArrowDown:[0,1], ArrowLeft:[-1,0], ArrowRight:[1,0], w:[0,-1], s:[0,1], a:[-1,0], d:[1,0] };
    const onKey = (e)=>{ const m = keyMap[e.key]; if(m){ e.preventDefault(); turn(m[0], m[1]); } };
    window.addEventListener('keydown', onKey);
    pad.addEventListener('pointerdown', e=>{ const b = e.target.closest('button'); if(!b) return; e.preventDefault(); const m = { up:[0,-1], down:[0,1], left:[-1,0], right:[1,0] }[b.dataset.d]; turn(m[0], m[1]); });
    let sx = 0, sy = 0;
    cv.addEventListener('pointerdown', e=>{ sx = e.clientX; sy = e.clientY; });
    cv.addEventListener('pointerup', e=>{
      const dx = e.clientX - sx, dy = e.clientY - sy;
      if(Math.max(Math.abs(dx), Math.abs(dy)) < 18) return;
      if(Math.abs(dx) > Math.abs(dy)) turn(dx > 0 ? 1 : -1, 0); else turn(0, dy > 0 ? 1 : -1);
    });
    place(); draw();
    return ()=>{ clearInterval(timer); window.removeEventListener('keydown', onKey); };
  }

  /* =====================================================================
     ③ おばけ神経衰弱 — 同じ絵を少ない手数でそろえる
     ===================================================================== */
  function gameMemory(stage, api){
    const EM = ['🎃','👻','🦇','🕷️','🍬','🧙','🐈‍⬛','💀'];
    const deck = shuffle([...EM, ...EM]);
    const wrap = $('div','gmem'), info = $('div','g-score','0 手 ／ 0 秒'), grid = $('div','gmem-grid');
    wrap.append(info, grid); stage.append(wrap);
    let first = null, lock = false, moves = 0, matched = 0, t0 = 0, clock = null; const timeouts = [];
    deck.forEach((emoji, i)=>{
      const card = $('button','mcard', `<span class="mc-inner"><span class="mc-face mc-back">🌙</span><span class="mc-face mc-front">${emoji}</span></span>`);
      card.type = 'button'; card.dataset.e = emoji;
      card.addEventListener('click', ()=> flip(card));
      grid.append(card);
    });
    function updateInfo(){ info.textContent = `${moves} 手 ／ ${t0 ? Math.floor((performance.now() - t0)/1000) : 0} 秒`; }
    function flip(card){
      if(lock || card.classList.contains('open') || card.classList.contains('done')) return;
      if(!t0){ t0 = performance.now(); clock = setInterval(updateInfo, 500); }
      card.classList.add('open'); CB().sound && CB().sound('place');
      if(!first){ first = card; return; }
      moves++; updateInfo();
      if(first.dataset.e === card.dataset.e){
        first.classList.add('done'); card.classList.add('done'); first = null; matched++;
        CB().sound && CB().sound('coin');
        if(matched === EM.length){
          clearInterval(clock);
          const sec = Math.floor((performance.now() - t0)/1000);
          timeouts.push(setTimeout(()=> api.finish({ rating: clamp(100 - (moves-EM.length)*6, 20, 100), score: moves, better:'low', text:`${moves} 手 ／ ${sec} 秒 でクリア`, valid:true }), 700));
        }
      } else {
        lock = true; const a = first, b = card; first = null;
        timeouts.push(setTimeout(()=>{ a.classList.remove('open'); b.classList.remove('open'); lock = false; }, 750));
      }
    }
    return ()=>{ clearInterval(clock); timeouts.forEach(clearTimeout); };
  }

  /* =====================================================================
     ④ おばけたたき — 30秒でどれだけ叩けるか
     ===================================================================== */
  function gameWhack(stage, api){
    const TOTAL = 30000;
    const wrap = $('div','gwhack'), info = $('div','g-score','👻 0 点 ／ 残り 30 秒'), grid = $('div','gwhack-grid');
    const hint = $('div','g-hint','👻=+10 ／ 🎃=+30 ／ 🧛はさわっちゃダメ(-15)');
    wrap.append(info, grid, hint); stage.append(wrap);
    const holes = []; const timeouts = new Set();
    for(let i=0;i<9;i++){
      const h = $('button','hole','<span class="mole"></span>'); h.type = 'button';
      h.addEventListener('pointerdown', e=>{ e.preventDefault(); hit(i); });
      grid.append(h); holes.push({ el:h, mole:h.firstChild, type:null, timer:null });
    }
    let score = 0, t0 = performance.now(), nextSpawn = t0 + 500, ended = false, combo = 0;
    const TYPES = { ghost:{ e:'👻', pts:10 }, gold:{ e:'🎃', pts:30 }, bad:{ e:'🧛', pts:-15 } };
    function show(i, type, life){
      const h = holes[i]; h.type = type; h.mole.textContent = TYPES[type].e; h.el.classList.add('up'); h.el.dataset.t = type;
      h.timer = setTimeout(()=> hide(i, true), life); timeouts.add(h.timer);
    }
    function hide(i, expired){
      const h = holes[i]; clearTimeout(h.timer);
      if(expired && h.type && h.type !== 'bad') combo = 0;
      h.type = null; h.el.classList.remove('up'); delete h.el.dataset.t;
    }
    function spawn(el){
      const free = holes.map((h,i)=>h.type ? -1 : i).filter(i=>i>=0);
      if(!free.length) return;
      const i = free[rnd(free.length)], r = Math.random();
      const type = r < .62 ? 'ghost' : r < .78 ? 'gold' : 'bad';
      const life = clamp(1000 - el*0.014, 520, 1000) * (type === 'gold' ? .75 : 1);
      show(i, type, life);
    }
    function pop(i, text, cls){
      const f = $('div','float-pt ' + cls, text); holes[i].el.append(f); setTimeout(()=>f.remove(), 700);
    }
    function hit(i){
      if(ended) return;
      const h = holes[i];
      if(!h.type){ combo = 0; return; }
      const t = TYPES[h.type];
      if(h.type === 'bad'){ score = Math.max(0, score + t.pts); combo = 0; pop(i, `${t.pts}`, 'neg'); CB().sound && CB().sound('gameover'); CB().vibrate && CB().vibrate(40); }
      else { combo++; const bonus = combo >= 5 ? 5 : 0; score += t.pts + bonus; pop(i, `+${t.pts + bonus}`, 'pos'); CB().sound && CB().sound('coin'); CB().vibrate && CB().vibrate(8); }
      hide(i, false);
    }
    const loop = setInterval(()=>{
      const now = performance.now(), el = now - t0;
      info.textContent = `👻 ${score} 点 ／ 残り ${Math.max(0, Math.ceil((TOTAL - el)/1000))} 秒${combo >= 5 ? ' 🔥COMBO' : ''}`;
      if(el >= TOTAL){ finish(); return; }
      if(now >= nextSpawn){ spawn(el); nextSpawn = now + clamp(760 - el*0.012, 380, 760); }
    }, 60);
    function finish(){
      if(ended) return; ended = true; clearInterval(loop); holes.forEach((_,i)=>hide(i,false));
      api.finish({ rating: clamp(Math.round(score/3.5), 0, 100), score, better:'high', text:`${score} 点`, valid:true });
    }
    return ()=>{ ended = true; clearInterval(loop); timeouts.forEach(clearTimeout); };
  }

  /* =====================================================================
     ⑤ マイン・ハンター — 9×9 / 地雷10個
     ===================================================================== */
  function gameMines(stage, api){
    const R = 9, C = 9, M = 10;
    const wrap = $('div','gmine'), bar = $('div','gmine-bar'), grid = $('div','gmine-grid'), hint = $('div','g-hint','タップ=開ける ／ 長押し(PCは右クリック)=旗');
    const left = $('span','','💣 10'), time = $('span','','⏱ 0'), flagBtn = $('button','mg-btn small','🚩 旗モード: OFF'); flagBtn.type = 'button';
    bar.append(left, time, flagBtn); wrap.append(bar, grid, hint); stage.append(wrap);
    let mine = null, adj = null, open = new Array(R*C).fill(false), flag = new Array(R*C).fill(false), started = false, ended = false, flagMode = false, t0 = 0, clock = null, opened = 0;
    const btns = [];
    for(let i=0;i<R*C;i++){
      const b = $('button','mc'); b.type = 'button'; btns.push(b); grid.append(b);
      let lp = null, fired = false;
      b.addEventListener('pointerdown', ()=>{ fired = false; lp = setTimeout(()=>{ fired = true; toggleFlag(i); CB().vibrate && CB().vibrate(20); }, 420); });
      const up = ()=>{ clearTimeout(lp); };
      b.addEventListener('pointerup', ()=>{ up(); if(!fired) tap(i); });
      b.addEventListener('pointerleave', up); b.addEventListener('pointercancel', up);
      b.addEventListener('contextmenu', e=>{ e.preventDefault(); toggleFlag(i); });
    }
    flagBtn.addEventListener('click', ()=>{ flagMode = !flagMode; flagBtn.textContent = `🚩 旗モード: ${flagMode ? 'ON' : 'OFF'}`; flagBtn.classList.toggle('on', flagMode); });
    function paint(i){
      const b = btns[i];
      if(open[i]){ b.className = 'mc open' + (mine && mine[i] ? ' boom' : ''); b.textContent = mine && mine[i] ? '💣' : (adj[i] || ''); if(adj && adj[i] > 0) b.dataset.n = adj[i]; }
      else { b.className = 'mc'; b.textContent = flag[i] ? '🚩' : ''; }
    }
    function toggleFlag(i){
      if(ended || open[i]) return;
      flag[i] = !flag[i]; paint(i);
      left.textContent = `💣 ${M - flag.filter(Boolean).length}`;
    }
    function tap(i){ if(ended) return; if(flagMode) toggleFlag(i); else reveal(i); }
    function reveal(i){
      if(open[i] || flag[i]) return;
      if(!started){
        started = true; ({ mine, adj } = genMines(R, C, M, i)); t0 = performance.now();
        clock = setInterval(()=>{ time.textContent = `⏱ ${Math.floor((performance.now() - t0)/1000)}`; }, 500);
      }
      if(mine[i]){ open[i] = true; return lose(i); }
      const q = [i];
      while(q.length){
        const k = q.pop();
        if(open[k] || flag[k]) continue;
        open[k] = true; opened++; paint(k);
        if(adj[k] === 0) neighbors(k, R, C).forEach(n=>{ if(!open[n]) q.push(n); });
      }
      CB().sound && CB().sound('place');
      if(opened === R*C - M) win();
    }
    function lose(hitIdx){
      ended = true; clearInterval(clock);
      mine.forEach((m,i)=>{ if(m){ open[i] = true; paint(i); } });
      CB().sound && CB().sound('gameover'); CB().vibrate && CB().vibrate([40,40,80]);
      setTimeout(()=> api.finish({ rating: Math.min(40, Math.round(opened/(R*C-M)*40)), score: 0, better:'low', valid:false, text:`地雷を踏んだ… ${opened} / ${R*C-M} マス開けた` }), 1000);
    }
    function win(){
      ended = true; clearInterval(clock);
      const sec = Math.floor((performance.now() - t0)/1000);
      CB().sound && CB().sound('coin');
      setTimeout(()=> api.finish({ rating: clamp(100 - Math.floor(sec/4), 50, 100), score: sec, better:'low', valid:true, text:`クリア！ ${sec} 秒` }), 600);
    }
    return ()=>{ clearInterval(clock); };
  }

  /* =====================================================================
     ⑥ ゴースト・フライト — タップで羽ばたいて墓石をよける
     ===================================================================== */
  function gameFlight(stage, api){
    const W = 320, H = 480, GX = 80, PW = 54, GAP = 142, GROUND = 438;
    const wrap = $('div','gflight'), info = $('div','g-score','🪦 0 枚'), cv = $('canvas','gf-canvas');
    cv.width = W; cv.height = H; const ctx = cv.getContext('2d');
    const msg = $('div','g-hint','タップ / スペースで羽ばたく');
    wrap.append(info, cv, msg); stage.append(wrap);
    let y = 220, vy = 0, pipes = [], score = 0, started = false, dead = false, raf = 0, last = 0, spawnX = W + 40, bgx = 0;
    const GRAV = 1450, FLAP = -420, SPEED = 125;
    function addPipe(x){ pipes.push({ x, top: 70 + rnd(GROUND - GAP - 140), passed:false }); }
    addPipe(W + 60); addPipe(W + 60 + 190); addPipe(W + 60 + 380);
    function flap(){ if(dead) return; if(!started){ started = true; msg.style.visibility = 'hidden'; } vy = FLAP; CB().sound && CB().sound('place'); }
    function frame(t){
      raf = requestAnimationFrame(frame);
      const dt = Math.min(.033, (t - (last || t))/1000); last = t;
      if(started && !dead){
        vy += GRAV*dt; y += vy*dt; bgx = (bgx + SPEED*dt*.3) % W;
        pipes.forEach(p=>{ p.x -= SPEED*dt; });
        if(pipes[0].x + PW < -4){ pipes.shift(); addPipe(pipes[pipes.length-1].x + 190); }
        pipes.forEach(p=>{ if(!p.passed && p.x + PW < GX){ p.passed = true; score++; info.textContent = `🪦 ${score} 枚`; CB().sound && CB().sound('coin'); } });
        const hitPipe = pipes.some(p=> GX+13 > p.x && GX-13 < p.x+PW && (y-13 < p.top || y+13 > p.top+GAP));
        if(hitPipe || y+14 > GROUND || y-14 < 0){ die(); }
      } else if(!started){ y = 220 + Math.sin(t/260)*8; }
      draw();
    }
    function draw(){
      const g = ctx.createLinearGradient(0,0,0,H); g.addColorStop(0,'#150b2e'); g.addColorStop(.7,'#3a1650'); g.addColorStop(1,'#5a2060');
      ctx.fillStyle = g; ctx.fillRect(0,0,W,H);
      ctx.fillStyle = '#ffe9a8'; ctx.beginPath(); ctx.arc(250,70,26,0,7); ctx.fill();
      ctx.fillStyle = 'rgba(255,233,168,.12)'; ctx.beginPath(); ctx.arc(250,70,46,0,7); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.7)';
      [[30,40],[90,110],[160,50],[210,150],[290,170],[60,200],[130,260]].forEach(([sx,sy],i)=>ctx.fillRect((sx - bgx*(i%2?.5:1) + W) % W, sy, 2, 2));
      pipes.forEach(p=>{
        ctx.fillStyle = '#6b6f86';
        ctx.fillRect(p.x, 0, PW, p.top); ctx.fillRect(p.x, p.top+GAP, PW, GROUND - p.top - GAP);
        ctx.fillStyle = '#8b90a8'; ctx.fillRect(p.x-4, p.top-16, PW+8, 16); ctx.fillRect(p.x-4, p.top+GAP, PW+8, 16);
        ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.fillRect(p.x+PW-8, 0, 8, p.top); ctx.fillRect(p.x+PW-8, p.top+GAP, 8, GROUND - p.top - GAP);
      });
      ctx.fillStyle = '#1b0f2c'; ctx.fillRect(0, GROUND, W, H-GROUND);
      ctx.fillStyle = '#ff8a1f'; ctx.fillRect(0, GROUND, W, 3);
      ctx.save(); ctx.translate(GX, y); ctx.rotate(clamp(vy/900, -.5, .7));
      ctx.font = '32px serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('👻', 0, 0); ctx.restore();
    }
    function die(){
      if(dead) return; dead = true; CB().sound && CB().sound('gameover'); CB().vibrate && CB().vibrate(60);
      cv.classList.add('shake');
      setTimeout(()=> api.finish({ rating: clamp(score*5, 0, 100), score, better:'high', valid:true, text:`墓石を ${score} 枚 通過` }), 700);
    }
    const onKey = (e)=>{ if(e.code === 'Space' || e.key === 'ArrowUp'){ e.preventDefault(); flap(); } };
    window.addEventListener('keydown', onKey);
    wrap.addEventListener('pointerdown', e=>{ e.preventDefault(); flap(); });
    raf = requestAnimationFrame(frame);
    return ()=>{ cancelAnimationFrame(raf); window.removeEventListener('keydown', onKey); };
  }

  /* =====================================================================
     ミニゲームの共通画面(メニュー / プレイ / 結果)
     ===================================================================== */
  const GAMES = [
    { id:'g2048',  emoji:'🔢', name:'2048',               desc:'スワイプで数字を合体させよう',     unit:'点', better:'high', start:game2048 },
    { id:'snake',  emoji:'🐍', name:'パンプキン・スネーク', desc:'かぼちゃを食べて長くなろう',       unit:'個', better:'high', start:gameSnake },
    { id:'memory', emoji:'🃏', name:'おばけ神経衰弱',       desc:'同じ絵を少ない手数でそろえよう',   unit:'手', better:'low',  start:gameMemory },
    { id:'whack',  emoji:'👻', name:'おばけたたき',         desc:'30秒でおばけをたたきまくれ！',     unit:'点', better:'high', start:gameWhack },
    { id:'mines',  emoji:'💣', name:'マイン・ハンター',     desc:'9×9の地雷さがし。最速クリアを狙え', unit:'秒', better:'low',  start:gameMines },
    { id:'flight', emoji:'🪦', name:'ゴースト・フライト',   desc:'タップで飛んで墓石をよけよう',     unit:'枚', better:'high', start:gameFlight }
  ];
  let root = null, body = null, resultEl = null, titleEl = null, bestEl = null, cleanup = null, current = null;

  function ensureRoot(){
    if(root) return;
    root = $('div'); root.id = 'miniScreen';
    root.innerHTML = `<div class="mg-bar"><button class="mg-back" type="button">‹ 戻る</button><div class="mg-title">🕹 ミニゲーム</div><div class="mg-bestline"></div></div><div class="mg-body"></div><div class="mg-result"></div>`;
    document.body.appendChild(root);
    body = root.querySelector('.mg-body'); resultEl = root.querySelector('.mg-result');
    titleEl = root.querySelector('.mg-title'); bestEl = root.querySelector('.mg-bestline');
    root.querySelector('.mg-back').addEventListener('click', ()=>{ if(current) openMenu(); else close(); });
  }
  function stopGame(){ if(cleanup){ try{ cleanup(); }catch(e){} cleanup = null; } }
  function close(){ stopGame(); current = null; if(root){ root.classList.remove('show'); } }

  function bestText(g){
    const r = rec[g.id];
    return r && r.best != null ? `ベスト ${r.best}${g.unit}` : 'まだ記録なし';
  }
  function openMenu(){
    ensureRoot(); stopGame(); current = null;
    root.classList.add('show'); resultEl.className = 'mg-result'; resultEl.innerHTML = '';
    titleEl.textContent = '🕹 ミニゲーム'; bestEl.textContent = '';
    body.className = 'mg-body menu';
    body.innerHTML = `<div class="mg-lead">どれも1回1〜2分。遊ぶと 🪙コイン と 🍬ハロウィンキャンディ(開催中)がもらえます！</div><div class="mg-grid"></div>`;
    const grid = body.querySelector('.mg-grid');
    GAMES.forEach((g,i)=>{
      const card = $('button','mg-card', `<span class="mg-emo">${g.emoji}</span><span class="mg-name">${g.name}</span><span class="mg-desc">${g.desc}</span><span class="mg-best">${bestText(g)}</span>`);
      card.type = 'button'; card.style.animationDelay = (i*0.05) + 's';
      card.addEventListener('click', ()=> startGame(g.id));
      grid.append(card);
    });
  }
  function startGame(id){
    ensureRoot(); stopGame();
    current = GAMES.find(g=>g.id === id);
    root.classList.add('show'); resultEl.className = 'mg-result'; resultEl.innerHTML = '';
    titleEl.textContent = `${current.emoji} ${current.name}`; bestEl.textContent = bestText(current);
    body.className = 'mg-body play'; body.innerHTML = '';
    const stage = $('div','mg-stage'); body.append(stage);
    cleanup = current.start(stage, { finish });
  }

  function finish(res){
    stopGame();
    const g = current; if(!g) return;
    const rating = clamp(Math.round(res.rating || 0), 0, 100);
    const coins = Math.round(rating * 1.5);
    // 記録更新
    let newBest = false;
    if(res.valid){
      const r = rec[g.id] = rec[g.id] || { best:null, plays:0 };
      const better = (res.better || g.better) === 'low' ? (r.best == null || res.score < r.best) : (r.best == null || res.score > r.best);
      if(better && (res.better || g.better) !== undefined){ r.best = res.score; newBest = true; }
    }
    const r2 = rec[g.id] = rec[g.id] || { best:null, plays:0 }; r2.plays = (r2.plays || 0) + 1; saveRec();
    // 報酬
    if(coins > 0 && CB().addCoins) CB().addCoins(coins);
    if(CB().xp) CB().xp(rating * 30);
    if(CB().report) CB().report({ mode:'mini-' + g.id, score: rating * 120 });
    if(CB().sync) CB().sync();
    // 結果表示
    const stars = rating === 0 ? 0 : Math.min(5, Math.ceil(rating/20));
    resultEl.className = 'mg-result show';
    resultEl.innerHTML = `<div class="mg-rcard">
      <div class="mg-remo">${rating >= 80 ? '🎉' : rating >= 40 ? '👏' : '💪'}</div>
      <div class="mg-rtitle">${g.name}</div>
      <div class="mg-rtext">${res.text || ''}</div>
      <div class="mg-stars">${'★'.repeat(stars)}<span>${'★'.repeat(5 - stars)}</span></div>
      ${newBest ? '<div class="mg-newbest">🎉 ベスト更新！</div>' : ''}
      <div class="mg-reward">🪙 +${coins}</div>
      <div class="mg-btns"><button class="mg-btn" id="mgAgain" type="button">もう一度</button><button class="mg-btn ghost" id="mgMenu" type="button">メニューへ</button></div>
    </div>`;
    resultEl.querySelector('#mgAgain').addEventListener('click', ()=> startGame(g.id));
    resultEl.querySelector('#mgMenu').addEventListener('click', openMenu);
    bestEl.textContent = bestText(g);
  }

  window.CBMini = { open: openMenu, close, games: GAMES, _t: { slideLine, neighbors, genMines } };
  const btn = document.getElementById('titleMiniBtn');
  if(btn) btn.addEventListener('click', openMenu);
})();

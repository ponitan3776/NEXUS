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
  const REC_KEY = 'nexus-mini-v1';
  let rec = {};
  try{ rec = JSON.parse(localStorage.getItem(REC_KEY) || '{}'); }catch(e){}
  const saveRec = ()=>{ try{ localStorage.setItem(REC_KEY, JSON.stringify(rec)); }catch(e){} };

  /* ---------- テストしやすいよう、純粋なロジックは外に出しておく ---------- */
  // 2048: 1行(0=空き)を左に寄せる計画を立てる。各タイルの移動先と、どれが合体するかを返す(アニメーション用)
  //   → { moves:[{from, to, merge}], result:[...], gain }   merge=true のタイルは、to にいる先客と合体して消える
  function planSlide(values){
    const moves = []; let dest = 0, last = null, gain = 0;
    values.forEach((v, from)=>{
      if(!v) return;
      if(last && !last.merged && last.v === v){
        moves.push({ from, to:last.to, merge:true }); last.merged = true; gain += v*2;
      } else {
        const m = { from, to:dest++, v, merge:false, merged:false }; moves.push(m); last = m;
      }
    });
    const result = new Array(values.length).fill(0);
    moves.forEach(m=>{ if(!m.merge) result[m.to] = values[m.from]; });
    moves.forEach(m=>{ if(m.merge) result[m.to] *= 2; });
    return { moves: moves.map(m=>({ from:m.from, to:m.to, merge:m.merge })), result, gain };
  }
  function slideLine(line){ const p = planSlide(line); return [p.result, p.gain]; }
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
     ① 2048 — タイルがスライドして、合体でぽんっと弾む
     ===================================================================== */
  function game2048(stage, api){
    const N = 4, SLIDE_MS = 120;
    const wrap = $('div','g2048'), sc = $('div','g-score'), board = $('div','g2048-board'),
          hint = $('div','g-hint','スワイプ / 矢印キーで動かそう'), quit = $('button','mg-btn ghost','ここで終了して報酬をもらう');
    quit.type = 'button';
    const bg = $('div','g2048-bg'), layer = $('div','g2048-tiles');
    for(let i=0;i<N*N;i++) bg.append($('div','slot'));
    board.append(bg, layer); wrap.append(sc, board, hint, quit); stage.append(wrap);
    let tiles = [], score = 0, over = false, busy = false, pending = null, won = false, timers = [];
    const colorOf = (v)=> `hsl(${(Math.log2(v)*37 + 18) % 360} 68% ${clamp(60 - Math.log2(v)*1.6, 38, 60)}%)`;
    const at = (r,c)=> tiles.find(t=>t.r === r && t.c === c);
    function paint(t){
      t.inner.textContent = t.v; t.inner.style.background = colorOf(t.v);
      t.inner.style.fontSize = t.v >= 1024 ? '17px' : t.v >= 128 ? '22px' : '27px';
      t.el.style.setProperty('--r', t.r); t.el.style.setProperty('--c', t.c);
    }
    function makeTile(r, c, v, cls){
      const el = $('div','tile'), inner = $('span','tin'); el.append(inner); layer.append(el);
      const t = { r, c, v, el, inner }; tiles.push(t); paint(t);
      if(cls){ inner.classList.add(cls); }
      return t;
    }
    function addTile(){
      const e = []; for(let r=0;r<N;r++) for(let c=0;c<N;c++) if(!at(r,c)) e.push([r,c]);
      if(!e.length) return;
      const [r,c] = e[rnd(e.length)]; makeTile(r, c, Math.random() < .9 ? 2 : 4, 'spawn');
    }
    const pos = (dir,i,j)=> dir===0 ? [i,j] : dir===2 ? [i,N-1-j] : dir===1 ? [j,i] : [N-1-j,i];   // 0左 1上 2右 3下
    function canMove(){
      const g = Array.from({length:N}, ()=>new Array(N).fill(0)); tiles.forEach(t=>{ g[t.r][t.c] = t.v; });
      for(let d=0; d<4; d++) for(let i=0;i<N;i++){
        const line = []; for(let j=0;j<N;j++){ const [r,c] = pos(d,i,j); line.push(g[r][c]); }
        if(slideLine(line)[0].some((v,j)=>v !== line[j])) return true;
      }
      return false;
    }
    function floatPt(text){
      const f = $('div','float-pt pos', text); f.style.left = '50%'; f.style.top = '8%'; board.append(f); setTimeout(()=>f.remove(), 700);
    }
    function move(dir){
      if(over) return;
      if(busy){ pending = dir; return; }                      // アニメ中の入力は1つだけ覚えておく
      let moved = false, gain = 0; const dying = [], grown = [];
      for(let i=0;i<N;i++){
        const lineTiles = [], values = [];
        for(let j=0;j<N;j++){ const [r,c] = pos(dir,i,j); const t = at(r,c); lineTiles.push(t); values.push(t ? t.v : 0); }
        const plan = planSlide(values); gain += plan.gain;
        const destTile = {};
        plan.moves.forEach(m=>{
          const t = lineTiles[m.from], [r,c] = pos(dir,i,m.to);
          if(m.merge){ t.r = r; t.c = c; dying.push(t); grown.push(destTile[m.to]); moved = true; }
          else { destTile[m.to] = t; if(t.r !== r || t.c !== c) moved = true; t.r = r; t.c = c; }
        });
      }
      if(!moved) return;
      busy = true; score += gain; sc.textContent = `スコア ${score}`;
      tiles.forEach(paint);                                    // --r/--c が変わる → CSSのtransitionでスライド
      CB().sound && CB().sound('place');
      timers.push(setTimeout(()=>{
        dying.forEach(t=>{ t.el.remove(); tiles = tiles.filter(x=>x !== t); });
        grown.forEach(t=>{ t.v *= 2; paint(t); t.inner.classList.remove('spawn','merge'); void t.inner.offsetWidth; t.inner.classList.add('merge'); });
        if(gain){ floatPt(`+${gain}`); CB().sound && CB().sound('coin'); CB().vibrate && CB().vibrate(8); }
        if(!won && tiles.some(t=>t.v >= 2048)){ won = true; CB().toast && CB().toast('🎉 2048達成！ まだまだ続けられます'); }
        addTile();
        busy = false;
        if(!canMove()){ over = true; timers.push(setTimeout(end, 700)); return; }
        if(pending != null){ const d = pending; pending = null; move(d); }
      }, SLIDE_MS));
    }
    function end(){
      const max = Math.max(0, ...tiles.map(t=>t.v));
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
    sc.textContent = 'スコア 0'; addTile(); addTile();
    return ()=>{ window.removeEventListener('keydown', onKey); timers.forEach(clearTimeout); };
  }

  /* =====================================================================
     ② パンプキン・スネーク — 1マスずつ飛ばず、なめらかに滑るように動く
        ・論理は「1マス進む」で動かし、描画は毎フレーム「前の位置→今の位置」を補間する
        ・体は曲線でつなぎ、曲がり角も丸くなめらかに
     ===================================================================== */
  const lerp = (a,b,t)=> a + (b-a)*t;
  function gameSnake(stage, api){
    const N = 15, S = 24, DPR = Math.min(2, (window.devicePixelRatio || 1));
    const wrap = $('div','gsnake'), info = $('div','g-score','🎃 0 個'), cv = $('canvas','gs-canvas');
    cv.width = cv.height = N*S*DPR;
    const ctx = cv.getContext('2d'); ctx.scale(DPR, DPR);
    // ★軽量化: 背景(市松模様)とかぼちゃは最初に1回だけ描いておき、毎フレームは貼るだけにする
    //   (絵文字の描画と shadowBlur は、iPadなどでとても重いため)
    const bgCv = document.createElement('canvas'); bgCv.width = bgCv.height = N*S*DPR;
    { const b = bgCv.getContext('2d'); b.scale(DPR, DPR); b.fillStyle = '#120a22'; b.fillRect(0,0,N*S,N*S);
      b.fillStyle = 'rgba(255,255,255,.035)';
      for(let x=0;x<N;x++) for(let y=0;y<N;y++) if((x+y)%2===0) b.fillRect(x*S, y*S, S, S); }
    const PUMP = S + 16, pumpCv = document.createElement('canvas'); pumpCv.width = pumpCv.height = Math.ceil(PUMP*DPR);
    { const p = pumpCv.getContext('2d'); p.scale(DPR, DPR);
      p.shadowColor = 'rgba(255,140,30,.8)'; p.shadowBlur = 12;
      p.font = `${S-3}px serif`; p.textAlign = 'center'; p.textBaseline = 'middle'; p.fillText('🎃', PUMP/2, PUMP/2 + 1); }
    const pad = $('div','dpad', `<button type="button" data-d="up" class="up">▲</button><button type="button" data-d="left" class="left">◀</button><button type="button" data-d="right" class="right">▶</button><button type="button" data-d="down" class="down">▼</button>`);
    const msg = $('div','g-hint','スワイプ / 矢印キー / 下のボタンでスタート');
    wrap.append(info, cv, msg, pad); stage.append(wrap);
    let snake = [{x:7,y:7},{x:6,y:7},{x:5,y:7}], prev = snake.map(s=>({...s})), dir = {x:1,y:0}, queue = [];
    let food = null, score = 0, speed = 150, acc = 0, started = false, dead = false, raf = 0, last = 0, particles = [], deadAt = 0;
    function place(){ do{ food = { x:rnd(N), y:rnd(N) }; } while(snake.some(s=>s.x===food.x && s.y===food.y)); }
    function tick(){
      prev = snake.map(s=>({...s}));
      while(queue.length){                                       // 入力は最大2つまで先読み。真後ろ・同方向は捨てる
        const d = queue.shift();
        if((d.x === -dir.x && d.y === -dir.y) || (d.x === dir.x && d.y === dir.y)) continue;
        dir = d; CB().sound && CB().sound('snakeTurn'); break;
      }
      const h = { x:snake[0].x + dir.x, y:snake[0].y + dir.y };
      const tail = snake[snake.length-1];
      const willEat = h.x === food.x && h.y === food.y;
      const hitSelf = snake.some((s,i)=> s.x===h.x && s.y===h.y && (willEat || s !== tail));
      if(h.x<0 || h.y<0 || h.x>=N || h.y>=N || hitSelf) return die();
      snake.unshift(h);
      if(willEat){
        score++; info.textContent = `🎃 ${score} 個`;
        for(let i=0;i<10;i++){ const a = Math.random()*6.283, v = .05 + Math.random()*.09; particles.push({ x:food.x+.5, y:food.y+.5, vx:Math.cos(a)*v, vy:Math.sin(a)*v, life:1 }); }
        place(); speed = Math.max(75, 150 - score*3);
        CB().sound && CB().sound('snakeEat'); CB().vibrate && CB().vibrate(10);
      } else snake.pop();
    }
    function die(){
      if(dead) return; dead = true; deadAt = performance.now();
      CB().sound && CB().sound('snakeDie'); CB().vibrate && CB().vibrate([30,30,60]);
      cv.classList.add('shake');
      setTimeout(()=> api.finish({ rating: clamp(score*5, 0, 100), score, better:'high', text:`かぼちゃを ${score} 個 食べた`, valid:true }), 750);
    }
    function bodyPoints(t){
      return snake.map((s,i)=>{ const f = prev[i] || prev[prev.length-1]; return { x:lerp(f.x, s.x, t) + .5, y:lerp(f.y, s.y, t) + .5 }; });
    }
    function draw(ts, t){
      ctx.drawImage(bgCv, 0, 0, N*S, N*S);
      // かぼちゃ(ゆらゆら脈打つ)
      const pulse = 1 + Math.sin(ts/170)*.07;
      ctx.save(); ctx.translate((food.x+.5)*S, (food.y+.5)*S); ctx.scale(pulse, pulse);
      ctx.drawImage(pumpCv, -PUMP/2, -PUMP/2, PUMP, PUMP); ctx.restore();
      // 体(曲線でなめらかに)
      const pts = bodyPoints(t).map(p=>({ x:p.x*S, y:p.y*S }));
      const path = ()=>{
        ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y);
        for(let i=1;i<pts.length-1;i++){ const mx = (pts[i].x + pts[i+1].x)/2, my = (pts[i].y + pts[i+1].y)/2; ctx.quadraticCurveTo(pts[i].x, pts[i].y, mx, my); }
        if(pts.length > 1){ const l = pts[pts.length-1]; ctx.lineTo(l.x, l.y); }
      };
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      if(pts.length > 1){
        ctx.strokeStyle = dead ? '#5a1a2a' : '#2f5a14'; ctx.lineWidth = S*.84; path(); ctx.stroke();
        ctx.strokeStyle = dead ? '#a03a52' : '#7fc22a'; ctx.lineWidth = S*.66; path(); ctx.stroke();
        ctx.strokeStyle = 'rgba(255,255,255,.18)'; ctx.lineWidth = S*.2; ctx.translate(-S*.08, -S*.1); path(); ctx.stroke(); ctx.translate(S*.08, S*.1);
      }
      // 頭と目(進んでいる向きを見る)
      const h = pts[0]; ctx.fillStyle = dead ? '#c04a64' : '#a6e83c'; ctx.beginPath(); ctx.arc(h.x, h.y, S*.46, 0, 6.283); ctx.fill();
      const px = -dir.y, py = dir.x;
      [-1,1].forEach(sd=>{
        const ex = h.x + dir.x*S*.16 + px*sd*S*.2, ey = h.y + dir.y*S*.16 + py*sd*S*.2;
        ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(ex, ey, S*.12, 0, 6.283); ctx.fill();
        ctx.fillStyle = '#120a22'; ctx.beginPath(); ctx.arc(ex + dir.x*S*.04, ey + dir.y*S*.04, S*.06, 0, 6.283); ctx.fill();
      });
      // かぼちゃをとったときの火花
      particles = particles.filter(p=>p.life > 0);
      particles.forEach(p=>{ p.x += p.vx; p.y += p.vy; p.life -= .045; ctx.globalAlpha = Math.max(0, p.life); ctx.fillStyle = '#ffb347'; ctx.beginPath(); ctx.arc(p.x*S, p.y*S, 2.6, 0, 6.283); ctx.fill(); });
      ctx.globalAlpha = 1;
    }
    function frame(ts){
      raf = requestAnimationFrame(frame);
      const dt = Math.min(50, ts - (last || ts)); last = ts;
      if(started && !dead){ acc += dt; while(acc >= speed && !dead){ acc -= speed; tick(); } }
      draw(ts, dead ? 1 : (started ? clamp(acc/speed, 0, 1) : 0));
    }
    function turn(dx, dy){
      if(dead) return;
      if(!started){ started = true; msg.style.visibility = 'hidden'; CB().sound && CB().sound('snakeStart'); if(dx === -dir.x && dy === -dir.y) return; }
      if(queue.length < 2) queue.push({ x:dx, y:dy });
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
    place(); raf = requestAnimationFrame(frame);
    return ()=>{ cancelAnimationFrame(raf); window.removeEventListener('keydown', onKey); };
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
    let lastLabel = '';
    const loop = setInterval(()=>{
      const now = performance.now(), el = now - t0;
      const label = `👻 ${score} 点 ／ 残り ${Math.max(0, Math.ceil((TOTAL - el)/1000))} 秒${combo >= 5 ? ' 🔥COMBO' : ''}`;
      if(label !== lastLabel){ lastLabel = label; info.textContent = label; }
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
    // ★軽量化: グラデーションと月は1回だけ描いておく / おばけ(絵文字)も画像にしておく
    const bgCv = document.createElement('canvas'); bgCv.width = W; bgCv.height = H;
    { const b = bgCv.getContext('2d'); const g = b.createLinearGradient(0,0,0,H); g.addColorStop(0,'#150b2e'); g.addColorStop(.7,'#3a1650'); g.addColorStop(1,'#5a2060');
      b.fillStyle = g; b.fillRect(0,0,W,H);
      b.fillStyle = '#ffe9a8'; b.beginPath(); b.arc(250,70,26,0,7); b.fill();
      b.fillStyle = 'rgba(255,233,168,.12)'; b.beginPath(); b.arc(250,70,46,0,7); b.fill(); }
    const ghostCv = document.createElement('canvas'); ghostCv.width = ghostCv.height = 56;
    { const gc = ghostCv.getContext('2d'); gc.font = '32px serif'; gc.textAlign = 'center'; gc.textBaseline = 'middle'; gc.fillText('👻', 28, 28); }
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
      ctx.drawImage(bgCv, 0, 0);
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
      ctx.drawImage(ghostCv, -28, -28); ctx.restore();
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
    { id:'g2048',  emoji:'🔢', name:'2048',               desc:'スワイプで数字を合体させよう',     unit:'点', better:'high', genre:'puzzle', start:game2048 },
    { id:'snake',  emoji:'🐍', name:'パンプキン・スネーク', desc:'かぼちゃを食べて長くなろう',       unit:'個', better:'high', genre:'action', start:gameSnake },
    { id:'memory', emoji:'🃏', name:'おばけ神経衰弱',       desc:'同じ絵を少ない手数でそろえよう',   unit:'手', better:'low',  genre:'brain', start:gameMemory },
    { id:'whack',  emoji:'👻', name:'おばけたたき',         desc:'30秒でおばけをたたきまくれ！',     unit:'点', better:'high', genre:'reflex', start:gameWhack },
    { id:'mines',  emoji:'💣', name:'マイン・ハンター',     desc:'9×9の地雷さがし。最速クリアを狙え', unit:'秒', better:'low',  genre:'puzzle', start:gameMines },
    { id:'flight', emoji:'🪦', name:'ゴースト・フライト',   desc:'タップで飛んで墓石をよけよう',     unit:'枚', better:'high', genre:'action', start:gameFlight }
  ];
  let root = null, body = null, resultEl = null, titleEl = null, bestEl = null, cleanup = null, current = null, rankView = false, summary = null;

  function ensureRoot(){
    if(root) return;
    root = $('div'); root.id = 'miniScreen';
    root.innerHTML = `<div class="mg-bar"><button class="mg-back" type="button">‹ 戻る</button><div class="mg-title">🕹 ミニゲーム</div><div class="mg-bestline"></div></div><div class="mg-body"></div><div class="mg-result"></div>`;
    document.body.appendChild(root);
    body = root.querySelector('.mg-body'); resultEl = root.querySelector('.mg-result');
    titleEl = root.querySelector('.mg-title'); bestEl = root.querySelector('.mg-bestline');
    root.querySelector('.mg-back').addEventListener('click', ()=>{ if(current || rankView) openMenu(); else close(); });
  }
  let session = 0;      // ゲームを切り替えたあとに、前のゲームの終了処理が遅れて届かないようにする
  function stopGame(){ session++; if(cleanup){ try{ cleanup(); }catch(e){} cleanup = null; } }
  function close(){ stopGame(); current = null; document.body.classList.remove('mg-open'); if(root){ root.classList.remove('show'); } }

  const GENRES = [
    ['all', '🕹 ぜんぶ'], ['action', '🏃 アクション'], ['puzzle', '🧩 パズル'], ['reflex', '⚡ はんしゃ'], ['brain', '🧠 あたま']
  ];
  const GENRE_NAME = { action:'アクション', puzzle:'パズル', reflex:'はんしゃ', brain:'あたま' };
  let genreFilter = 'all';
  const fmtVal = (g, n)=> g.fmt ? g.fmt(n) : `${n}${g.unit}`;
  function bestText(g){
    const r = rec[g.id];
    return r && r.best != null ? `ベスト ${fmtVal(g, r.best)}` : 'まだ記録なし';
  }
  function openMenu(){
    ensureRoot(); stopGame(); current = null; rankView = false;
    root.classList.add('show'); document.body.classList.add('mg-open'); resultEl.className = 'mg-result'; resultEl.innerHTML = '';
    titleEl.textContent = '🕹 ミニゲーム'; bestEl.textContent = '';
    body.className = 'mg-body menu';
    const stamped = GAMES.filter(g=> rec[g.id] && rec[g.id].plays > 0).length;
    body.innerHTML = `<div class="mg-lead">どれも1回1〜2分。遊ぶと 🪙コイン と 🍬ハロウィンキャンディ(開催中)がもらえます！<br><b>🎪 遊んだ種類: ${stamped} / ${GAMES.length}</b>(全部遊ぶとスタンプラリー達成)</div>
      <button class="mg-rankbtn" type="button">🏆 ランキングを見る</button>
      <div class="mg-genres">${GENRES.map(([k,l])=>`<button type="button" class="mg-gchip ${k===genreFilter?'active':''}" data-genre="${k}">${l}</button>`).join('')}</div>
      <div class="mg-grid"></div>`;
    body.querySelector('.mg-rankbtn').addEventListener('click', ()=> openRanking(GAMES[0].id));
    const grid = body.querySelector('.mg-grid');
    const bestLine = (g)=>{ const sm = summary && summary[g.id]; return sm && sm.rank ? `${bestText(g)}(全体 ${sm.rank}位)` : bestText(g); };
    const bestEls = {};
    const draw = ()=>{
      grid.innerHTML = ''; Object.keys(bestEls).forEach(k=> delete bestEls[k]);
      GAMES.filter(g=> genreFilter === 'all' || g.genre === genreFilter).forEach((g,i)=>{
        const played = rec[g.id] && rec[g.id].plays > 0;
        const card = $('button','mg-card g-' + (g.genre || 'action'), `${g.isNew ? '<span class="mg-new">NEW</span>' : ''}<span class="mg-genre">${GENRE_NAME[g.genre] || ''}</span><span class="mg-emo">${g.emoji}</span><span class="mg-name">${g.name}</span><span class="mg-desc">${g.desc}</span><span class="mg-best">${bestLine(g)}</span>${played ? '<span class="mg-stamp" title="遊んだ！">✔</span>' : ''}`);
        card.type = 'button'; card.style.animationDelay = Math.min(i, 12)*0.04 + 's';
        card.addEventListener('click', ()=> startGame(g.id));
        grid.append(card); bestEls[g.id] = card.querySelector('.mg-best');
      });
    };
    draw();
    body.querySelectorAll('.mg-gchip').forEach(b=> b.addEventListener('click', ()=>{
      genreFilter = b.dataset.genre;
      body.querySelectorAll('.mg-gchip').forEach(x=> x.classList.toggle('active', x === b)); draw();
    }));
    // ログイン中なら、自分の順位を取ってきて表示する
    if(CB().isLoggedIn && CB().isLoggedIn() && CB().api){
      CB().api('/api/mini/summary').then(d=>{
        summary = d.games; if(rankView || current) return;
        GAMES.forEach(g=>{ if(bestEls[g.id]) bestEls[g.id].textContent = bestLine(g); });
      }).catch(()=>{});
    }
  }

  // ---------- ランキング画面 ----------
  const fmtScore = (g, n)=> fmtVal(g, n);
  function openRanking(gameId){
    ensureRoot(); stopGame(); current = null; rankView = true;
    const g = GAMES.find(x=>x.id === gameId) || GAMES[0];
    root.classList.add('show'); document.body.classList.add('mg-open'); resultEl.className = 'mg-result'; resultEl.innerHTML = '';
    titleEl.textContent = '🏆 ランキング'; bestEl.textContent = '';
    body.className = 'mg-body rank';
    body.innerHTML = `<div class="mg-ranktabs">${GAMES.map(x=>`<button type="button" class="mg-rtab ${x.id===g.id?'active':''}" data-g="${x.id}">${x.emoji}<span>${x.name}</span></button>`).join('')}</div>
      <div class="mg-rankinfo">${g.better === 'low' ? '少ないほど上位' : '高いほど上位'}(1人1記録・自己ベスト)</div><div class="mg-ranklist"><div class="empty-hint">読み込み中...</div></div>`;
    body.querySelectorAll('.mg-rtab').forEach(b=> b.addEventListener('click', ()=> openRanking(b.dataset.g)));
    const list = body.querySelector('.mg-ranklist');
    if(!CB().api){ list.innerHTML = '<div class="empty-hint">ランキングを読み込めません</div>'; return; }
    CB().api('/api/mini/ranking?game=' + encodeURIComponent(g.id)).then(d=>{
      if(!rankView) return;
      const me = d.me, meId = me && me.id;
      let html = d.ranking.map((r,i)=>`<div class="mg-rankrow ${r.id===meId?'me':''} ${i<3?'top':''}"><span class="rk">${['🥇','🥈','🥉'][i] || (i+1)}</span><span class="nm">${String(r.name || r.id).replace(/[&<>"']/g, c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]))}</span><span class="sc">${fmtScore(g, r.score)}</span></div>`).join('');
      if(!d.ranking.length) html = '<div class="empty-hint">まだ記録がありません。一番乗りを目指そう！</div>';
      html += me ? `<div class="mg-rankme">あなた: ${me.rank ? `${me.rank}位 / ${fmtScore(g, me.best)}` : 'まだ記録なし'}</div>`
                 : `<div class="mg-rankme">ログインすると、あなたの記録がランキングに載ります</div>`;
      list.innerHTML = html;
    }).catch(err=>{ list.innerHTML = `<div class="empty-hint">${err.message || '読み込みに失敗しました'}</div>`; });
  }
  function startGame(id){
    ensureRoot(); stopGame(); rankView = false;
    current = GAMES.find(g=>g.id === id);
    root.classList.add('show'); document.body.classList.add('mg-open'); resultEl.className = 'mg-result'; resultEl.innerHTML = '';
    titleEl.textContent = `${current.emoji} ${current.name}`; bestEl.textContent = bestText(current);
    body.className = 'mg-body play'; body.innerHTML = '';
    const stage = $('div','mg-stage'); body.append(stage);
    const sid = session;
    cleanup = current.start(stage, { finish: (r)=>{ if(sid === session) finish(r); }, best: rec[current.id] ? rec[current.id].best : null });
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
      <div class="mg-rankline" id="mgRankLine">${res.valid ? (CB().isLoggedIn && CB().isLoggedIn() ? '🏆 ランキングに記録中...' : '🏆 ログインするとランキングに載ります') : ''}</div>
      <div class="mg-btns"><button class="mg-btn" id="mgAgain" type="button">もう一度</button><button class="mg-btn ghost" id="mgMenu" type="button">メニューへ</button></div>
      <button class="mg-linkbtn" id="mgRank" type="button">🏆 ランキングを見る</button>
      ${window.CBEngage ? window.CBEngage.signupLine() : ''}
    </div>`;
    resultEl.querySelector('#mgAgain').addEventListener('click', ()=> startGame(g.id));
    resultEl.querySelector('#mgMenu').addEventListener('click', openMenu);
    resultEl.querySelector('#mgRank').addEventListener('click', ()=> openRanking(g.id));
    { const su = resultEl.querySelector('#mgSignup'); if(su) su.addEventListener('click', ()=>{ if(CB().openRegister) CB().openRegister(); }); }
    bestEl.textContent = bestText(g);
    // ランキングに記録して、順位を表示する
    if(res.valid && CB().isLoggedIn && CB().isLoggedIn() && CB().api){
      CB().api('/api/mini/score', 'POST', { game:g.id, score:res.score }).then(d=>{
        const line = resultEl.querySelector('#mgRankLine');
        if(d && d.rank){ if(summary) summary[g.id] = { ...(summary[g.id]||{}), best:d.best, rank:d.rank }; if(line) line.textContent = `🏆 全体 ${d.rank}位(自己ベスト ${fmtVal(g, d.best)})`; }
        else if(line) line.textContent = '';
      }).catch(()=>{ const line = resultEl.querySelector('#mgRankLine'); if(line) line.textContent = ''; });
    }
  }

  // 新しいゲームを足す窓口(minigames2.js から呼ぶ)。同じ id は上書き
  function register(def){
    const i = GAMES.findIndex(g=>g.id === def.id);
    if(i >= 0) GAMES[i] = def; else GAMES.push(def);
  }
  window.CBMini = { open: openMenu, close, games: GAMES, register, _t: { slideLine, planSlide, neighbors, genMines } };
  const btn = document.getElementById('titleMiniBtn');
  if(btn) btn.addEventListener('click', openMenu);
})();

/* =====================================================================
   🕹 ミニゲーム パート2 (v3.6) — 新しい12本
   ・minigames.js の後に読み込み、CBMini.register() で仲間に入れる
   ・各ゲームは  start(stage, api) → 後片付け関数  を返し、終わったら api.finish({...}) を呼ぶだけ
   ・api.best = 自己ベスト(なければ null)
   ===================================================================== */
(function(){
  'use strict';
  if(!window.CBMini) return;
  const CB = ()=> window.CB || {};
  const $ = (tag, cls, html)=>{ const e = document.createElement(tag); if(cls) e.className = cls; if(html != null) e.innerHTML = html; return e; };
  const clamp = (v,a,b)=> Math.max(a, Math.min(b, v));
  const rnd = (n)=> Math.floor(Math.random()*n);
  const pick = (a)=> a[rnd(a.length)];
  const shuffle = (a)=>{ for(let i=a.length-1;i>0;i--){ const j = rnd(i+1); [a[i],a[j]] = [a[j],a[i]]; } return a; };
  const snd = (n, a)=>{ CB().sound && CB().sound(n, a); };
  const vib = (p)=>{ CB().vibrate && CB().vibrate(p); };
  const DPR = ()=> Math.min(2, window.devicePixelRatio || 1);
  const mix = (a, b, t)=> a + (b-a)*t;
  const hex = (h)=> [parseInt(h.slice(1,3),16), parseInt(h.slice(3,5),16), parseInt(h.slice(5,7),16)];
  const mixCol = (c1, c2, t)=>{ const a = hex(c1), b = hex(c2); return `rgb(${Math.round(mix(a[0],b[0],t))},${Math.round(mix(a[1],b[1],t))},${Math.round(mix(a[2],b[2],t))})`; };
  function emojiSprite(ch, size){      // 絵文字は毎フレーム描くと重いので、先に画像にしておく
    const d = DPR(), c = document.createElement('canvas'); c.width = c.height = Math.ceil(size*d);
    const x = c.getContext('2d'); x.scale(d, d); x.font = `${size*.8}px serif`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(ch, size/2, size/2 + size*.04);
    return c;
  }
  function hiCanvas(w, h, cls){
    const cv = $('canvas', cls || 'm2-canvas'), d = DPR();
    cv.width = Math.round(w*d); cv.height = Math.round(h*d);
    const ctx = cv.getContext('2d'); ctx.scale(d, d);
    return { cv, ctx };
  }
  // 画面を触っても、ページがスクロール・ズームしないようにする
  const noScroll = (el)=>{ el.style.touchAction = 'none'; };

  /* =====================================================================
     ① ハロウィン・ラン — Chromeの恐竜ゲーム風(ジャンプ / しゃがむ)
     ===================================================================== */
  function gameDino(stage, api){
    const W = 480, H = 200, GROUND = 170, X0 = 56;
    const wrap = $('div','m2-wrap'), { cv, ctx } = hiCanvas(W, H, 'm2-canvas wide');
    const duckBtn = $('button','mg-btn ghost m2-duck','⬇ しゃがむ(ながおし)'); duckBtn.type = 'button';
    const hint = $('div','g-hint','タップ / スペース / ↑ でジャンプ・↓(またはボタン長押し)でしゃがむ');
    noScroll(cv); wrap.append(cv, duckBtn, hint); stage.append(wrap);
    let dist = 0, speed = 6, score = 0, hi = api.best || 0, started = false, dead = false, raf = 0, last = 0, acc = 0, frame = 0;
    let y = GROUND - 47, vy = 0, duck = false, obs = [], nextGap = 220, night = 0, nightTarget = 0, blink = 0, clouds = [], stars = [];
    for(let i=0;i<3;i++) clouds.push({ x: rnd(W), y: 24 + rnd(60), s: .3 + Math.random()*.3 });
    for(let i=0;i<18;i++) stars.push({ x: rnd(W), y: 8 + rnd(110), r: Math.random()*1.4 + .4 });
    const bumps = []; for(let i=0;i<40;i++) bumps.push({ x: rnd(W*2), w: 2 + rnd(6) });
    const GRAV = .62, JUMP = -11.4;
    function dinoBox(){ return duck && y >= GROUND - 47 - .1 ? { x:X0, y:GROUND-24, w:52, h:22 } : { x:X0+10, y:y+3, w:30, h:42 }; }
    function jump(){
      if(dead) return;
      if(!started){ started = true; hint.style.visibility = 'hidden'; }
      if(y >= GROUND - 47 - .1 && !duck){ vy = JUMP; snd('jump'); }
    }
    function spawn(){
      const sc = score, kind = Math.random();
      let o;
      if(sc >= 250 && kind < .22){ const ys = [138, 108, 72]; o = { t:'bat', w:40, h:28, y:pick(ys), x:W + 20 }; }
      else if(kind < .5){ const n = 1 + rnd(3); o = { t:'tomb', n, w:18*n + 6*(n-1), h:36, y:GROUND-36, x:W + 20 }; }
      else if(kind < .72){ o = { t:'tomb2', w:26, h:48, y:GROUND-48, x:W + 20 }; }
      else { const n = 1 + rnd(2); o = { t:'pump', n, w:30*n + 4*(n-1), h:28, y:GROUND-28, x:W + 20 }; }
      obs.push(o);
      nextGap = o.w + speed*(34 + Math.random()*30) + 40;
    }
    function step(){
      frame++;
      if(!started || dead) return;
      speed = Math.min(13, speed + .0016);
      dist += speed; const ns = Math.floor(dist*.025);
      if(ns > score){
        const prev = score; score = ns;
        if(Math.floor(prev/100) < Math.floor(score/100)){ snd('point'); blink = 70; nightTarget = Math.floor(score/100) % 7 >= 3 && Math.floor(score/100) % 7 <= 5 ? 1 : 0; }
      }
      night += clamp(nightTarget - night, -.02, .02);
      vy += GRAV + (duck && y < GROUND-47 ? 1.1 : 0); y += vy;
      if(y >= GROUND - 47){ y = GROUND - 47; vy = 0; }
      obs.forEach(o=>{ o.x -= speed; });
      obs = obs.filter(o=> o.x + o.w > -10);
      const lastOb = obs[obs.length-1];
      if(!lastOb || (W - (lastOb.x + lastOb.w)) > nextGap) spawn();
      clouds.forEach(c=>{ c.x -= c.s*speed*.3; if(c.x < -40) c.x = W + 20 + rnd(80); });
      bumps.forEach(b=>{ b.x -= speed; if(b.x < -10) b.x += W*2; });
      if(blink > 0) blink--;
      const d = dinoBox();
      for(const o of obs){
        const m = o.t === 'bat' ? 6 : 3;
        if(d.x < o.x + o.w - m && d.x + d.w > o.x + m && d.y < o.y + o.h - m && d.y + d.h > o.y + m){ return die(); }
      }
    }
    function die(){
      if(dead) return; dead = true; snd('hit'); vib([30,30,60]);
      if(score > hi) hi = score;
      cv.classList.add('shake');
      setTimeout(()=> api.finish({ rating: clamp(Math.floor(score/12), 0, 100), score, better:'high', valid:true, text:`${score} 点 走りぬけた` }), 900);
    }
    function drawDino(fg, bg){
      const x = X0;
      ctx.fillStyle = fg;
      const runF = Math.floor(frame/6) % 2;
      if(duck && y >= GROUND - 47 - .1 && started){
        const yy = GROUND - 26;
        ctx.fillRect(x+36, yy, 22, 14); ctx.fillRect(x+6, yy+4, 34, 14); ctx.fillRect(x, yy+4, 8, 6);
        ctx.fillRect(x+12, yy+18, 7, runF ? 8 : 3); ctx.fillRect(x+26, yy+18, 7, runF ? 3 : 8);
        ctx.fillStyle = bg; ctx.fillRect(x+47, yy+3, 4, 4);
        ctx.fillStyle = '#8a4dff'; ctx.beginPath(); ctx.moveTo(x+38, yy); ctx.lineTo(x+48, yy-10); ctx.lineTo(x+56, yy); ctx.fill();
        return;
      }
      ctx.fillRect(x+20, y, 24, 17); ctx.fillRect(x+20, y+17, 12, 8); ctx.fillRect(x+8, y+22, 28, 14); ctx.fillRect(x, y+20, 10, 7); ctx.fillRect(x+34, y+28, 8, 3);
      const air = y < GROUND - 47 - .1 || !started;
      ctx.fillRect(x+12, y+36, 7, air ? 11 : (runF ? 11 : 5)); ctx.fillRect(x+24, y+36, 7, air ? 11 : (runF ? 5 : 11));
      ctx.fillStyle = bg;
      if(dead){ ctx.strokeStyle = bg; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x+29, y+3); ctx.lineTo(x+35, y+9); ctx.moveTo(x+35, y+3); ctx.lineTo(x+29, y+9); ctx.stroke(); }
      else ctx.fillRect(x+30, y+4, 5, 5);
      ctx.fillRect(x+34, y+13, 10, 2);
      ctx.fillStyle = '#8a4dff'; ctx.beginPath(); ctx.moveTo(x+22, y); ctx.lineTo(x+33, y-17); ctx.lineTo(x+42, y); ctx.fill();   // 魔女の帽子
      ctx.fillStyle = '#ff8a1f'; ctx.fillRect(x+22, y-4, 20, 4);
    }
    function drawObs(o, fg, bg){
      if(o.t === 'tomb' || o.t === 'tomb2'){
        const n = o.t === 'tomb' ? o.n : 1, w = o.t === 'tomb' ? 18 : 26, h = o.h;
        for(let i=0;i<n;i++){
          const x = o.x + i*(w+6);
          ctx.fillStyle = fg; ctx.beginPath(); ctx.moveTo(x, o.y+h); ctx.lineTo(x, o.y+w/2); ctx.arc(x+w/2, o.y+w/2, w/2, Math.PI, 0); ctx.lineTo(x+w, o.y+h); ctx.closePath(); ctx.fill();
          ctx.fillStyle = bg; ctx.fillRect(x+w/2-1, o.y+8, 2, 11); ctx.fillRect(x+w/2-4, o.y+11, 8, 2);
        }
      } else if(o.t === 'pump'){
        for(let i=0;i<o.n;i++){
          const x = o.x + i*34;
          ctx.fillStyle = '#ff8a1f'; ctx.beginPath(); ctx.ellipse(x+15, o.y+16, 15, 12, 0, 0, 7); ctx.fill();
          ctx.fillStyle = '#c85a00'; ctx.fillRect(x+13, o.y+2, 4, 5); ctx.fillStyle = '#3d8a2a'; ctx.fillRect(x+13, o.y, 5, 4);
          ctx.fillStyle = bg; ctx.beginPath(); ctx.moveTo(x+7, o.y+11); ctx.lineTo(x+12, o.y+11); ctx.lineTo(x+9, o.y+16); ctx.fill();
          ctx.beginPath(); ctx.moveTo(x+18, o.y+11); ctx.lineTo(x+23, o.y+11); ctx.lineTo(x+21, o.y+16); ctx.fill(); ctx.fillRect(x+9, o.y+20, 12, 2);
        }
      } else if(o.t === 'bat'){
        const f = Math.floor(frame/8) % 2, x = o.x, yy = o.y;
        ctx.fillStyle = fg; ctx.beginPath(); ctx.ellipse(x+20, yy+16, 7, 8, 0, 0, 7); ctx.fill();
        ctx.beginPath(); ctx.moveTo(x+16, yy+9); ctx.lineTo(x+17, yy+2); ctx.lineTo(x+20, yy+8); ctx.lineTo(x+23, yy+2); ctx.lineTo(x+24, yy+9); ctx.fill();
        ctx.beginPath();
        if(f){ ctx.moveTo(x+14, yy+14); ctx.lineTo(x, yy+4); ctx.lineTo(x+4, yy+16); ctx.lineTo(x+14, yy+22); ctx.moveTo(x+26, yy+14); ctx.lineTo(x+40, yy+4); ctx.lineTo(x+36, yy+16); ctx.lineTo(x+26, yy+22); }
        else { ctx.moveTo(x+14, yy+16); ctx.lineTo(x+1, yy+26); ctx.lineTo(x+8, yy+14); ctx.lineTo(x+14, yy+12); ctx.moveTo(x+26, yy+16); ctx.lineTo(x+39, yy+26); ctx.lineTo(x+32, yy+14); ctx.lineTo(x+26, yy+12); }
        ctx.fill(); ctx.fillStyle = bg; ctx.fillRect(x+17, yy+14, 2, 2); ctx.fillRect(x+22, yy+14, 2, 2);
      }
    }
    function draw(){
      const bgc = mixCol('#f6f1e8', '#150c28', night), fg = mixCol('#4b3d5e', '#e3d8ff', night);
      ctx.fillStyle = bgc; ctx.fillRect(0, 0, W, H);
      if(night > .3){ ctx.globalAlpha = night; ctx.fillStyle = '#fff'; stars.forEach(s=> ctx.fillRect(s.x, s.y, s.r, s.r)); ctx.fillStyle = '#ffe9a8'; ctx.beginPath(); ctx.arc(400, 46, 15, 0, 7); ctx.fill(); ctx.globalAlpha = 1; }
      ctx.fillStyle = mixCol('#d9d2c6', '#2c1f4a', night);
      clouds.forEach(c=>{ ctx.beginPath(); ctx.ellipse(c.x, c.y, 22, 7, 0, 0, 7); ctx.ellipse(c.x+12, c.y-4, 12, 7, 0, 0, 7); ctx.fill(); });
      ctx.fillStyle = fg; ctx.fillRect(0, GROUND, W, 2);
      bumps.forEach(b=> ctx.fillRect(b.x, GROUND + 6, b.w, 1));
      obs.forEach(o=> drawObs(o, fg, bgc));
      drawDino(fg, bgc);
      ctx.font = '700 15px "Courier New", monospace'; ctx.textAlign = 'right'; ctx.fillStyle = fg;
      const pad = (n)=> String(n).padStart(5, '0');
      if(!(blink > 0 && Math.floor(blink/7) % 2 === 0)) ctx.fillText(pad(score), W-12, 22);
      ctx.globalAlpha = .55; ctx.fillText('HI ' + pad(hi), W-70, 22); ctx.globalAlpha = 1;
      if(dead){ ctx.textAlign = 'center'; ctx.font = '700 18px "Courier New", monospace'; ctx.fillText('G A M E  O V E R', W/2, 80); }
    }
    function frameLoop(ts){
      raf = requestAnimationFrame(frameLoop);
      const dt = Math.min(100, ts - (last || ts)); last = ts; acc += dt;
      while(acc >= 16.667){ acc -= 16.667; step(); }
      draw();
    }
    const onKey = (e)=>{
      if(e.type === 'keydown'){
        if(e.code === 'Space' || e.key === 'ArrowUp' || e.key === 'w'){ e.preventDefault(); jump(); }
        else if(e.key === 'ArrowDown' || e.key === 's'){ e.preventDefault(); duck = true; }
      } else if(e.key === 'ArrowDown' || e.key === 's'){ duck = false; }
    };
    window.addEventListener('keydown', onKey); window.addEventListener('keyup', onKey);
    cv.addEventListener('pointerdown', e=>{ e.preventDefault(); jump(); });
    const dOn = (e)=>{ e.preventDefault(); duck = true; if(!started){ started = true; hint.style.visibility = 'hidden'; } }, dOff = ()=>{ duck = false; };
    duckBtn.addEventListener('pointerdown', dOn); ['pointerup','pointerleave','pointercancel'].forEach(ev=> duckBtn.addEventListener(ev, dOff));
    raf = requestAnimationFrame(frameLoop);
    return ()=>{ cancelAnimationFrame(raf); window.removeEventListener('keydown', onKey); window.removeEventListener('keyup', onKey); };
  }

  /* =====================================================================
     ② かぼちゃブロック崩し
     ===================================================================== */
  function gameBreakout(stage, api){
    const W = 320, H = 440, PW0 = 66, PH = 10, PY = 400, BR = 6, COLS = 7, BW = 40, BH = 16, GAP = 4, LEFT = 8, TOP = 56;
    const wrap = $('div','m2-wrap'), info = $('div','g-score','🎃 0 点   ❤❤❤'), { cv, ctx } = hiCanvas(W, H);
    const hint = $('div','g-hint','ドラッグ / ←→ でバーを動かす。タップでボール発射'); noScroll(cv);
    wrap.append(info, cv, hint); stage.append(wrap);
    const COLORS = ['#ff8a1f', '#ff4d6d', '#b14dff', '#3ddc84', '#ffd23d'];
    let px = W/2, bricks = [], bx = 0, by = 0, vx = 0, vy = 0, launched = false, lives = 3, score = 0, level = 1, raf = 0, last = 0, over = false, spd = 4.6;
    function build(){
      bricks = [];
      for(let r=0;r<5;r++) for(let c=0;c<COLS;c++) bricks.push({ x: LEFT + c*(BW+GAP), y: TOP + r*(BH+GAP), r, hp: r === 0 ? 2 : 1 });
    }
    function reset(){ launched = false; bx = px; by = PY - BR - 1; }
    function launch(){ if(over) return; if(!launched){ launched = true; const a = (Math.random()*.6 - .3); vx = spd*Math.sin(a); vy = -spd*Math.cos(a); snd('place'); hint.style.visibility = 'hidden'; } }
    function hud(){ info.textContent = `🎃 ${score} 点   ${'❤'.repeat(lives)}${'♡'.repeat(3-lives)}   Lv.${level}`; }
    function stepBall(k){
      bx += vx*k; by += vy*k;
      if(bx < BR){ bx = BR; vx = Math.abs(vx); } else if(bx > W-BR){ bx = W-BR; vx = -Math.abs(vx); }
      if(by < BR){ by = BR; vy = Math.abs(vy); }
      if(vy > 0 && by + BR >= PY && by + BR <= PY + PH + 6 && bx > px - PW0/2 - BR && bx < px + PW0/2 + BR){
        const rel = clamp((bx - px)/(PW0/2), -1, 1), a = rel*1.0; const s = Math.hypot(vx, vy);
        vx = s*Math.sin(a); vy = -s*Math.cos(a); by = PY - BR; snd('tick');
      }
      for(const b of bricks){
        const cx = clamp(bx, b.x, b.x+BW), cy = clamp(by, b.y, b.y+BH), dx = bx - cx, dy = by - cy;
        if(dx*dx + dy*dy <= BR*BR){
          if(Math.abs(dx) > Math.abs(dy)) vx = dx > 0 ? Math.abs(vx) : -Math.abs(vx); else vy = dy > 0 ? Math.abs(vy) : -Math.abs(vy);
          b.hp--; if(b.hp <= 0){ bricks.splice(bricks.indexOf(b), 1); score += 10 + (4 - b.r)*2; snd('pop'); } else snd('tick');
          hud();
          if(!bricks.length){ level++; spd = Math.min(8, spd + .5); build(); reset(); snd('win'); hud(); }
          break;
        }
      }
      if(by > H + 10){
        lives--; hud(); snd('bad'); vib(40);
        if(lives <= 0) return end();
        reset();
      }
    }
    function end(){
      if(over) return; over = true; snd('gameover'); cv.classList.add('shake');
      setTimeout(()=> api.finish({ rating: clamp(Math.floor(score/25), 0, 100), score, better:'high', valid:true, text:`${score} 点(Lv.${level})` }), 800);
    }
    function draw(){
      ctx.fillStyle = '#120a22'; ctx.fillRect(0, 0, W, H);
      bricks.forEach(b=>{ ctx.fillStyle = COLORS[b.r]; ctx.fillRect(b.x, b.y, BW, BH); ctx.fillStyle = 'rgba(255,255,255,.22)'; ctx.fillRect(b.x, b.y, BW, 4); if(b.hp > 1){ ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.fillRect(b.x+4, b.y+BH-5, BW-8, 2); } });
      ctx.fillStyle = '#e8dcff'; ctx.fillRect(px - PW0/2, PY, PW0, PH); ctx.fillStyle = '#ff8a1f'; ctx.fillRect(px - PW0/2, PY, PW0, 3);
      ctx.fillStyle = '#ffe9a8'; ctx.beginPath(); ctx.arc(bx, by, BR, 0, 7); ctx.fill();
    }
    function frame(ts){
      raf = requestAnimationFrame(frame);
      const dt = Math.min(40, ts - (last || ts)); last = ts; const k = dt/16.667;
      if(!over){ if(launched){ stepBall(k/2); stepBall(k/2); } else bx = px; }
      draw();
    }
    const move = (clientX)=>{ const r = cv.getBoundingClientRect(); px = clamp((clientX - r.left)/r.width*W, PW0/2, W - PW0/2); };
    cv.addEventListener('pointermove', e=> move(e.clientX));
    cv.addEventListener('pointerdown', e=>{ move(e.clientX); launch(); });
    const onKey = (e)=>{
      if(e.key === 'ArrowLeft' || e.key === 'a'){ px = clamp(px - 26, PW0/2, W - PW0/2); }
      else if(e.key === 'ArrowRight' || e.key === 'd'){ px = clamp(px + 26, PW0/2, W - PW0/2); }
      else if(e.code === 'Space' || e.key === 'ArrowUp'){ e.preventDefault(); launch(); }
    };
    window.addEventListener('keydown', onKey);
    build(); reset(); hud(); raf = requestAnimationFrame(frame);
    return ()=>{ cancelAnimationFrame(raf); window.removeEventListener('keydown', onKey); };
  }

  /* =====================================================================
     ③ ろうそくシモン — 光る順番をおぼえて、同じ順番でタップ
     ===================================================================== */
  function gameSimon(stage, api){
    const wrap = $('div','m2-wrap'), info = $('div','g-score','ラウンド 0'), msg = $('div','m2-simon-msg','ようい…'), grid = $('div','m2-simon');
    const PADS = [{ c:'#ff8a1f', f:262 }, { c:'#b14dff', f:330 }, { c:'#3ddc84', f:392 }, { c:'#ff4d9a', f:494 }];
    const els = PADS.map((p,i)=>{ const b = $('button','m2-pad', '🕯'); b.type = 'button'; b.style.setProperty('--c', p.c); b.dataset.i = i; grid.append(b); return b; });
    wrap.append(info, msg, grid); stage.append(wrap);
    let seq = [], idx = 0, accept = false, over = false, timers = [];
    const later = (fn, ms)=>{ const t = setTimeout(fn, ms); timers.push(t); return t; };
    function flash(i, ms){ els[i].classList.add('lit'); snd('note', PADS[i].f); later(()=> els[i].classList.remove('lit'), ms); }
    function round(){
      seq.push(rnd(4)); idx = 0; accept = false; info.textContent = `ラウンド ${seq.length - 1}`; msg.textContent = '👀 よく見て…';
      const gap = Math.max(260, 560 - seq.length*22);
      seq.forEach((n,k)=> later(()=> flash(n, gap*.7), 700 + k*gap));
      later(()=>{ accept = true; msg.textContent = '👆 あなたの番！'; }, 700 + seq.length*gap);
    }
    function tap(i){
      if(!accept || over) return;
      flash(i, 180);
      if(seq[idx] !== i){ over = true; accept = false; msg.textContent = '💥 まちがい！'; snd('gameover'); vib([30,30,60]); const done = seq.length - 1;
        later(()=> api.finish({ rating: clamp(done*8, 0, 100), score: done, better:'high', valid:true, text:`${done} ラウンド成功` }), 900); return; }
      idx++;
      if(idx >= seq.length){ accept = false; msg.textContent = '✨ せいかい！'; snd('coin'); later(round, 800); }
    }
    els.forEach(b=> b.addEventListener('pointerdown', e=>{ e.preventDefault(); tap(+b.dataset.i); }));
    later(round, 700);
    return ()=>{ timers.forEach(clearTimeout); };
  }

  /* =====================================================================
     ④ ガイコツ反射神経 — 「いま！」で一瞬でタップ(5回の平均)
     ===================================================================== */
  function gameReflex(stage, api){
    const ROUNDS = 5;
    const wrap = $('div','m2-wrap'), info = $('div','g-score',`1 / ${ROUNDS} 回目`), pad = $('button','m2-reflex wait','<span class="rf-emo">💀</span><span class="rf-txt">タップしてスタート</span>'), list = $('div','m2-rflist');
    pad.type = 'button'; wrap.append(info, pad, list); stage.append(wrap);
    const emo = pad.querySelector('.rf-emo'), txt = pad.querySelector('.rf-txt');
    let state = 'idle', t0 = 0, timer = 0, times = [], penalty = 0, round = 0;
    function set(cls, e, t){ pad.className = 'm2-reflex ' + cls; emo.textContent = e; txt.textContent = t; }
    function arm(){
      state = 'wait'; set('wait', '🌑', 'まだ…… 光るまで待って'); info.textContent = `${round + 1} / ${ROUNDS} 回目`;
      timer = setTimeout(()=>{ state = 'go'; t0 = performance.now(); set('go', '👻', 'いま！！'); snd('pop'); }, 1300 + Math.random()*2800);
    }
    pad.addEventListener('pointerdown', e=>{
      e.preventDefault();
      if(state === 'idle'){ arm(); return; }
      if(state === 'wait'){ clearTimeout(timer); penalty += 150; snd('bad'); state = 'idle'; set('early', '⚠', 'はやすぎ！(ペナルティ +150ms) タップでやりなおし'); return; }
      if(state === 'go'){
        const ms = Math.round(performance.now() - t0) + penalty; penalty = 0; times.push(ms); round++; snd('coin');
        list.innerHTML = times.map((t,i)=>`<span>${i+1}回目 <b>${t}ms</b></span>`).join('');
        if(round >= ROUNDS){ state = 'done'; const avg = Math.round(times.reduce((a,b)=>a+b, 0)/ROUNDS); set('wait', '🏁', `平均 ${avg}ms`);
          setTimeout(()=> api.finish({ rating: clamp(Math.round((500 - avg)/3), 0, 100), score: clamp(avg, 80, 2000), better:'low', valid:true, text:`平均 ${avg}ms` }), 800); return; }
        state = 'idle'; set('wait', '✅', `${ms}ms！ タップで次へ`);
      }
    });
    return ()=>{ clearTimeout(timer); };
  }

  /* =====================================================================
     ⑤ キャンディキャッチ — 落ちてくるお菓子をカゴで受けよう(ガイコツはダメ)
     ===================================================================== */
  function gameCatch(stage, api){
    const W = 320, H = 440, BWID = 64, BY = 396, TIME = 30;
    const wrap = $('div','m2-wrap'), info = $('div','g-score',''), { cv, ctx } = hiCanvas(W, H), hint = $('div','g-hint','ドラッグ / ←→ でカゴを動かす。🍬を集めて💀はよけよう');
    noScroll(cv); wrap.append(info, cv, hint); stage.append(wrap);
    const SP = { candy: emojiSprite('🍬', 30), lolli: emojiSprite('🍭', 30), pump: emojiSprite('🎃', 32), skull: emojiSprite('💀', 30), basket: emojiSprite('🧺', 52) };
    let x = W/2, items = [], score = 0, lives = 3, tLeft = TIME, spawnIn = .4, raf = 0, last = 0, over = false, elapsed = 0, floats = [];
    const hud = ()=>{ info.textContent = `🍬 ${score} 点   ${'❤'.repeat(lives)}${'♡'.repeat(3-lives)}   ⏱ ${Math.ceil(tLeft)}`; };
    function spawn(){
      const r = Math.random(); let t = 'candy';
      if(r < .22) t = 'skull'; else if(r < .34) t = 'lolli'; else if(r < .40) t = 'pump';
      items.push({ t, x: 18 + rnd(W - 36), y: -20, v: 110 + Math.random()*70 + elapsed*3.2 });
    }
    function end(msg){
      if(over) return; over = true; snd(lives > 0 ? 'win' : 'gameover');
      setTimeout(()=> api.finish({ rating: clamp(Math.round(score/5), 0, 100), score, better:'high', valid:true, text:`${msg} ${score} 点` }), 700);
    }
    function frame(ts){
      raf = requestAnimationFrame(frame);
      const dt = Math.min(.05, (ts - (last || ts))/1000); last = ts;
      if(!over){
        tLeft -= dt; elapsed += dt; spawnIn -= dt;
        if(spawnIn <= 0){ spawn(); spawnIn = Math.max(.25, .62 - elapsed*.008) * (.7 + Math.random()*.6); }
        items.forEach(it=>{ it.y += it.v*dt; });
        items = items.filter(it=>{
          if(it.y > BY - 14 && it.y < BY + 22 && Math.abs(it.x - x) < BWID/2 + 6){
            if(it.t === 'skull'){ lives--; snd('bad'); vib(40); floats.push({ x:it.x, y:it.y, s:'💥', life:1 }); if(lives <= 0) end('ガイコツに当たった…'); }
            else { const p = it.t === 'pump' ? 50 : it.t === 'lolli' ? 30 : 10; score += p; snd('pop'); floats.push({ x:it.x, y:it.y, s:'+'+p, life:1 }); }
            hud(); return false;
          }
          return it.y < H + 20;
        });
        if(tLeft <= 0){ tLeft = 0; end('タイムアップ！'); }
        hud();
      }
      ctx.fillStyle = '#120a22'; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = 'rgba(255,255,255,.04)'; for(let i=0;i<10;i++) ctx.fillRect((i*37 + elapsed*6)%W, (i*53)%H, 2, 2);
      items.forEach(it=> ctx.drawImage(SP[it.t], it.x - 15, it.y - 15, 30, 30));
      ctx.drawImage(SP.basket, x - 26, BY - 8, 52, 52);
      floats = floats.filter(f=> f.life > 0);
      floats.forEach(f=>{ f.y -= 36*dt; f.life -= dt*1.6; ctx.globalAlpha = Math.max(0, f.life); ctx.fillStyle = '#ffd23d'; ctx.font = '800 15px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(f.s, f.x, f.y); });
      ctx.globalAlpha = 1;
    }
    const move = (clientX)=>{ const r = cv.getBoundingClientRect(); x = clamp((clientX - r.left)/r.width*W, BWID/2, W - BWID/2); };
    cv.addEventListener('pointermove', e=> move(e.clientX)); cv.addEventListener('pointerdown', e=> move(e.clientX));
    const onKey = (e)=>{ if(e.key === 'ArrowLeft' || e.key === 'a') x = clamp(x - 30, BWID/2, W - BWID/2); else if(e.key === 'ArrowRight' || e.key === 'd') x = clamp(x + 30, BWID/2, W - BWID/2); };
    window.addEventListener('keydown', onKey);
    hud(); raf = requestAnimationFrame(frame);
    return ()=>{ cancelAnimationFrame(raf); window.removeEventListener('keydown', onKey); };
  }

  /* =====================================================================
     ⑥ ばけばけ計算 — 30秒で、できるだけたくさん正解しよう
     ===================================================================== */
  function makeQuestion(n){
    // n = これまでの正解数。進むほど難しく
    let a, b, op, ans;
    const r = Math.random();
    if(n < 4 || r < .45){ op = '+'; a = 2 + rnd(8 + n*2); b = 2 + rnd(8 + n*2); ans = a + b; }
    else if(r < .75){ op = '−'; a = 6 + rnd(10 + n*2); b = 1 + rnd(a - 1); ans = a - b; }
    else { op = '×'; a = 2 + rnd(Math.min(9, 4 + Math.floor(n/3))); b = 2 + rnd(Math.min(9, 4 + Math.floor(n/3))); ans = a*b; }
    const opts = new Set([ans]);
    while(opts.size < 4){ const d = (1 + rnd(4)) * (Math.random() < .5 ? -1 : 1); const v = ans + d; if(v >= 0) opts.add(v); }
    return { text: `${a} ${op} ${b} = ?`, ans, options: shuffle([...opts]) };
  }
  function gameMath(stage, api){
    const TIME = 30;
    const wrap = $('div','m2-wrap'), info = $('div','g-score',''), q = $('div','m2-q',''), opts = $('div','m2-opts'), bar = $('div','m2-timebar','<i></i>');
    wrap.append(info, bar, q, opts); stage.append(wrap);
    let score = 0, tLeft = TIME, cur = null, over = false, iv = 0, miss = 0, lock = false;
    const hud = ()=>{ info.textContent = `➕ ${score} 問正解  ⏱ ${Math.ceil(tLeft)}`; bar.firstChild.style.width = (tLeft/TIME*100) + '%'; };
    function next(){
      cur = makeQuestion(score); q.textContent = cur.text; q.classList.remove('bad','good'); opts.innerHTML = '';
      cur.options.forEach(v=>{ const b = $('button','m2-opt', String(v)); b.type = 'button'; b.addEventListener('pointerdown', e=>{ e.preventDefault(); answer(v, b); }); opts.append(b); });
      lock = false;
    }
    function answer(v, b){
      if(over || lock) return; lock = true;
      if(v === cur.ans){ score++; snd('pop'); q.classList.add('good'); b.classList.add('ok'); }
      else { miss++; tLeft = Math.max(0, tLeft - 2); snd('bad'); q.classList.add('bad'); b.classList.add('ng'); vib(30); }
      hud(); setTimeout(()=>{ if(!over) next(); }, 180);
    }
    iv = setInterval(()=>{
      tLeft -= .1; hud();
      if(tLeft <= 0 && !over){ over = true; clearInterval(iv); snd('win');
        setTimeout(()=> api.finish({ rating: clamp(score*4, 0, 100), score, better:'high', valid:true, text:`${score} 問 正解(まちがい ${miss})` }), 500); }
    }, 100);
    hud(); next();
    return ()=>{ clearInterval(iv); };
  }

  /* =====================================================================
     ⑦ まよいの洋館 — 迷路をぬけて出口へ(スワイプは曲がり角まで一気に進む)
     ===================================================================== */
  function genMaze(cells){
    // cells×cells の部屋 → (2*cells+1) の格子。1=壁 0=通路。穴掘り法(DFS)
    const N = cells*2 + 1, g = Array.from({length:N}, ()=> new Array(N).fill(1));
    const stack = [[1,1]]; g[1][1] = 0;
    while(stack.length){
      const [cx, cy] = stack[stack.length-1];
      const ns = shuffle([[2,0],[-2,0],[0,2],[0,-2]]).map(([dx,dy])=>[cx+dx, cy+dy, dx, dy]).filter(([x,y])=> x > 0 && y > 0 && x < N-1 && y < N-1 && g[y][x] === 1);
      if(!ns.length){ stack.pop(); continue; }
      const [nx, ny, dx, dy] = ns[0]; g[cy + dy/2][cx + dx/2] = 0; g[ny][nx] = 0; stack.push([nx, ny]);
    }
    return g;
  }
  function gameMaze(stage, api){
    const CELLS = 10, N = CELLS*2 + 1, S = 16, SIZE = N*S;
    const wrap = $('div','m2-wrap'), info = $('div','g-score','⏱ 0 秒'), { cv, ctx } = hiCanvas(SIZE, SIZE, 'm2-canvas sq');
    const pad = $('div','dpad', `<button type="button" data-d="up" class="up">▲</button><button type="button" data-d="left" class="left">◀</button><button type="button" data-d="right" class="right">▶</button><button type="button" data-d="down" class="down">▼</button>`);
    const hint = $('div','g-hint','スワイプ / 矢印 / ボタンで進む(曲がり角まで一気に進みます)'); noScroll(cv);
    wrap.append(info, cv, hint, pad); stage.append(wrap);
    const g = genMaze(CELLS), px0 = 1, EX = N-2, EY = N-2;
    const SPR = { me: emojiSprite('🎃', S+2), exit: emojiSprite('🚪', S+2) };
    let px = px0, py = 1, t0 = 0, iv = 0, over = false; const seen = new Set(['1,1']);
    const open = (x, y)=> x >= 0 && y >= 0 && x < N && y < N && g[y][x] === 0;
    function draw(){
      ctx.fillStyle = '#120a22'; ctx.fillRect(0, 0, SIZE, SIZE);
      for(let y=0;y<N;y++) for(let x=0;x<N;x++){
        if(g[y][x]){ ctx.fillStyle = (x+y)%2 ? '#3a2466' : '#43296f'; ctx.fillRect(x*S, y*S, S, S); }
        else if(seen.has(x+','+y)){ ctx.fillStyle = 'rgba(255,138,31,.16)'; ctx.fillRect(x*S, y*S, S, S); }
      }
      ctx.drawImage(SPR.exit, EX*S - 1, EY*S - 1, S+2, S+2); ctx.drawImage(SPR.me, px*S - 1, py*S - 1, S+2, S+2);
    }
    function go(dx, dy){
      if(over) return;
      if(!t0){ t0 = performance.now(); iv = setInterval(()=>{ info.textContent = `⏱ ${Math.floor((performance.now() - t0)/1000)} 秒`; }, 250); }
      let moved = 0;
      while(open(px + dx, py + dy)){
        px += dx; py += dy; moved++; seen.add(px + ',' + py);
        if(px === EX && py === EY) break;
        const exits = [[1,0],[-1,0],[0,1],[0,-1]].filter(([a,b])=> !(a === -dx && b === -dy) && open(px + a, py + b)).length;
        if(exits !== 1) break;          // 分かれ道か行き止まり → そこで止まる(まっすぐ進めなくなったら次のループで止まる)
      }
      if(moved) snd('tick');
      draw();
      if(px === EX && py === EY){
        over = true; clearInterval(iv); const sec = Math.max(3, Math.round((performance.now() - t0)/1000)); snd('win');
        setTimeout(()=> api.finish({ rating: clamp(Math.round(110 - sec*1.8), 30, 100), score: sec, better:'low', valid:true, text:`脱出！ ${sec} 秒` }), 500);
      }
    }
    const map = { ArrowUp:[0,-1], ArrowDown:[0,1], ArrowLeft:[-1,0], ArrowRight:[1,0], w:[0,-1], s:[0,1], a:[-1,0], d:[1,0] };
    const onKey = (e)=>{ const m = map[e.key]; if(m){ e.preventDefault(); go(m[0], m[1]); } };
    window.addEventListener('keydown', onKey);
    pad.addEventListener('pointerdown', e=>{ const b = e.target.closest('button'); if(!b) return; e.preventDefault(); const m = { up:[0,-1], down:[0,1], left:[-1,0], right:[1,0] }[b.dataset.d]; go(m[0], m[1]); });
    let sx = 0, sy = 0;
    cv.addEventListener('pointerdown', e=>{ sx = e.clientX; sy = e.clientY; });
    cv.addEventListener('pointerup', e=>{ const dx = e.clientX - sx, dy = e.clientY - sy; if(Math.max(Math.abs(dx), Math.abs(dy)) < 14) return; if(Math.abs(dx) > Math.abs(dy)) go(dx > 0 ? 1 : -1, 0); else go(0, dy > 0 ? 1 : -1); });
    draw();
    return ()=>{ clearInterval(iv); window.removeEventListener('keydown', onKey); };
  }

  /* =====================================================================
     ⑧ おばけスライドパズル — 3×3、少ない手数で並べよう
     ===================================================================== */
  const SLIDE_EMO = ['🎃','👻','🦇','🕷','💀','🍬','🕯','🧙'];
  function slideShuffle(){
    // 解ける盤面だけを作る: 完成形から、空きマスを何回かランダムに動かす
    const b = [1,2,3,4,5,6,7,8,0]; let blank = 8, prev = -1;
    const nb = (i)=>{ const r = Math.floor(i/3), c = i%3, o = []; if(r>0) o.push(i-3); if(r<2) o.push(i+3); if(c>0) o.push(i-1); if(c<2) o.push(i+1); return o; };
    for(let k=0;k<140;k++){
      const c = nb(blank).filter(x=> x !== prev); const t = pick(c);
      b[blank] = b[t]; b[t] = 0; prev = blank; blank = t;
    }
    return b;
  }
  const slideSolved = (b)=> b.every((v,i)=> v === (i === 8 ? 0 : i+1));
  function gameSlide(stage, api){
    const wrap = $('div','m2-wrap'), info = $('div','g-score','手数 0'), grid = $('div','m2-slide'), hint = $('div','g-hint','となりの空きマスにタップで動かす。1〜8の順に並べよう');
    wrap.append(info, grid, hint); stage.append(wrap);
    let b = slideShuffle(); while(slideSolved(b)) b = slideShuffle();
    let moves = 0, over = false;
    function paint(){
      grid.innerHTML = '';
      b.forEach((v,i)=>{
        const t = $('button','m2-tile' + (v ? '' : ' blank') + (v && v === i+1 ? ' right' : ''), v ? `<span class="e">${SLIDE_EMO[v-1]}</span><span class="n">${v}</span>` : ''); t.type = 'button';
        if(v) t.addEventListener('pointerdown', e=>{ e.preventDefault(); tap(i); });
        grid.append(t);
      });
      info.textContent = `手数 ${moves}`;
    }
    function tap(i){
      if(over) return; const z = b.indexOf(0), r = Math.floor(i/3), c = i%3, zr = Math.floor(z/3), zc = z%3;
      if(Math.abs(r - zr) + Math.abs(c - zc) !== 1) return;
      b[z] = b[i]; b[i] = 0; moves++; snd('tick'); paint();
      if(slideSolved(b)){ over = true; snd('win'); setTimeout(()=> api.finish({ rating: clamp(Math.round(130 - moves*1.5), 30, 100), score: Math.max(8, moves), better:'low', valid:true, text:`${moves} 手でクリア！` }), 600); }
    }
    paint();
    return ()=>{};
  }

  /* =====================================================================
     ⑨ ともしびライツアウト — 全部のろうそくを消そう(押すと上下左右も反転)
     ===================================================================== */
  function lightsGen(){
    let g, presses;
    do{
      g = new Array(25).fill(false); presses = 6 + rnd(5);
      const cells = shuffle([...Array(25).keys()]).slice(0, presses);
      cells.forEach(i=> lightsToggle(g, i));
    } while(g.filter(Boolean).length < 5);
    return { g, par: presses };
  }
  function lightsToggle(g, i){
    const r = Math.floor(i/5), c = i%5;
    [[0,0],[1,0],[-1,0],[0,1],[0,-1]].forEach(([dr,dc])=>{ const rr = r+dr, cc = c+dc; if(rr>=0 && rr<5 && cc>=0 && cc<5) g[rr*5+cc] = !g[rr*5+cc]; });
  }
  function gameLights(stage, api){
    const wrap = $('div','m2-wrap'), info = $('div','g-score','手数 0'), grid = $('div','m2-lights'), hint = $('div','g-hint','タップすると、そのろうそくと上下左右が反転。全部消せばクリア！');
    wrap.append(info, grid, hint); stage.append(wrap);
    const { g, par } = lightsGen(); let moves = 0, over = false;
    const cells = [];
    for(let i=0;i<25;i++){ const b = $('button','m2-light','<span>🕯</span>'); b.type = 'button'; b.addEventListener('pointerdown', e=>{ e.preventDefault(); tap(i); }); grid.append(b); cells.push(b); }
    function paint(){ cells.forEach((b,i)=> b.classList.toggle('on', g[i])); info.textContent = `手数 ${moves}   🔥 ${g.filter(Boolean).length}`; }
    function tap(i){
      if(over) return; lightsToggle(g, i); moves++; snd('tick'); paint();
      if(!g.some(Boolean)){ over = true; snd('win'); setTimeout(()=> api.finish({ rating: clamp(Math.round(100 - Math.max(0, moves - par)*6), 30, 100), score: Math.max(3, moves), better:'low', valid:true, text:`${moves} 手で全部消した！` }), 600); }
    }
    paint();
    return ()=>{};
  }

  /* =====================================================================
     ⑩ ナンバータッチ — 1〜16を、順番にできるだけ速くタップ
     ===================================================================== */
  function gameNumTouch(stage, api){
    const wrap = $('div','m2-wrap'), info = $('div','g-score','次は 1'), grid = $('div','m2-num'), hint = $('div','g-hint','1から16まで順番にタップ！まちがえると +0.5秒');
    wrap.append(info, grid, hint); stage.append(wrap);
    const nums = shuffle([...Array(16).keys()].map(n=>n+1)); let next = 1, t0 = 0, pen = 0, iv = 0, over = false;
    const btns = nums.map(n=>{ const b = $('button','m2-n', String(n)); b.type = 'button'; b.style.setProperty('--h', (n*22)%360); b.addEventListener('pointerdown', e=>{ e.preventDefault(); tap(n, b); }); grid.append(b); return b; });
    function tap(n, b){
      if(over) return;
      if(!t0){ t0 = performance.now(); iv = setInterval(()=>{ info.textContent = `次は ${Math.min(next,16)}   ⏱ ${((performance.now() - t0 + pen)/1000).toFixed(1)}`; }, 100); }
      if(n !== next){ pen += 500; snd('bad'); b.classList.add('ng'); setTimeout(()=> b.classList.remove('ng'), 220); return; }
      b.classList.add('done'); snd('tick'); next++;
      if(next > 16){
        over = true; clearInterval(iv); const ms = performance.now() - t0 + pen, ds = clamp(Math.round(ms/100), 30, 6000), sec = ms/1000; snd('win');
        info.textContent = `⏱ ${sec.toFixed(1)} 秒`;
        setTimeout(()=> api.finish({ rating: clamp(Math.round(150 - sec*5), 20, 100), score: ds, better:'low', valid:true, text:`${sec.toFixed(1)} 秒でクリア！` }), 600);
      }
    }
    return ()=>{ clearInterval(iv); };
  }

  /* =====================================================================
     ⑪ いろいろモンスター — 文字の「色」をえらべ！(ストループ)
     ===================================================================== */
  const INKS = [{ n:'あか', c:'#ff4d4d' }, { n:'あお', c:'#4d8dff' }, { n:'みどり', c:'#3ddc84' }, { n:'きいろ', c:'#ffd23d' }];
  function gameStroop(stage, api){
    const TIME = 30;
    const wrap = $('div','m2-wrap'), info = $('div','g-score',''), bar = $('div','m2-timebar','<i></i>'), word = $('div','m2-word',''), opts = $('div','m2-inks'), hint = $('div','g-hint','文字が「何色で書かれているか」をえらぼう(読んだ文字ではなく、色！)');
    wrap.append(info, bar, word, opts, hint); stage.append(wrap);
    let score = 0, miss = 0, tLeft = TIME, iv = 0, over = false, cur = null, lock = false;
    INKS.forEach((k,i)=>{ const b = $('button','m2-ink', k.n); b.type = 'button'; b.style.background = k.c; b.addEventListener('pointerdown', e=>{ e.preventDefault(); answer(i); }); opts.append(b); });
    const hud = ()=>{ info.textContent = `🎨 ${score} 問正解  ⏱ ${Math.ceil(tLeft)}`; bar.firstChild.style.width = (tLeft/TIME*100) + '%'; };
    function next(){
      const w = rnd(4); let ink = rnd(4); if(Math.random() < .75) while(ink === w) ink = rnd(4);
      cur = { w, ink }; word.textContent = INKS[w].n; word.style.color = INKS[ink].c; lock = false;
    }
    function answer(i){
      if(over || lock) return; lock = true;
      if(i === cur.ink){ score++; snd('pop'); } else { miss++; tLeft = Math.max(0, tLeft - 2); snd('bad'); vib(30); word.classList.add('ng'); setTimeout(()=> word.classList.remove('ng'), 200); }
      hud(); setTimeout(()=>{ if(!over) next(); }, 120);
    }
    iv = setInterval(()=>{
      tLeft -= .1; hud();
      if(tLeft <= 0 && !over){ over = true; clearInterval(iv); snd('win'); setTimeout(()=> api.finish({ rating: clamp(score*4, 0, 100), score, better:'high', valid:true, text:`${score} 問 正解(まちがい ${miss})` }), 500); }
    }, 100);
    hud(); next();
    return ()=>{ clearInterval(iv); };
  }

  /* =====================================================================
     ⑫ ホーンテッド・スタック — ブロックをぴったり積み上げよう
     ===================================================================== */
  function gameStack(stage, api){
    const W = 280, H = 440, BH = 22, MAXW = 150;
    const wrap = $('div','m2-wrap'), info = $('div','g-score','🏰 0 段'), { cv, ctx } = hiCanvas(W, H), hint = $('div','g-hint','タップでブロックを置く。ずれた部分は切り落とされるよ');
    noScroll(cv); wrap.append(info, cv, hint); stage.append(wrap);
    let tower = [{ x: (W - MAXW)/2, w: MAXW }], cur = { x: 0, w: MAXW, dir: 1 }, speed = 2.2, score = 0, over = false, raf = 0, last = 0, streak = 0, cam = 0, camT = 0, falling = [];
    const hue = (i)=> (i*23 + 20) % 360;
    function place(){
      if(over) return;
      const top = tower[tower.length-1], l = Math.max(cur.x, top.x), r = Math.min(cur.x + cur.w, top.x + top.w), ov = r - l;
      if(ov <= 0){ falling.push({ x:cur.x, w:cur.w, y:(tower.length)*BH, vy:0, h:hue(tower.length) }); over = true; snd('gameover'); vib([30,30,60]); cv.classList.add('shake');
        setTimeout(()=> api.finish({ rating: clamp(score*4, 0, 100), score, better:'high', valid:true, text:`${score} 段 積んだ` }), 900); return; }
      let nx = l, nw = ov;
      if(Math.abs(cur.x - top.x) < 4){ nx = top.x; nw = top.w; streak++; snd('win'); if(streak >= 3){ nw = Math.min(MAXW, nw + 6); nx = Math.max(0, nx - 3); } }
      else { streak = 0; snd('place'); const cutL = l - cur.x, cutR = (cur.x + cur.w) - r; if(cutL > 0) falling.push({ x:cur.x, w:cutL, y:tower.length*BH, vy:0, h:hue(tower.length) }); if(cutR > 0) falling.push({ x:r, w:cutR, y:tower.length*BH, vy:0, h:hue(tower.length) }); }
      tower.push({ x: nx, w: nw }); score++; info.textContent = `🏰 ${score} 段`;
      speed = Math.min(6.5, 2.2 + score*.09); camT = Math.max(0, (tower.length - 9)*BH);
      cur = { x: cur.dir > 0 ? W - nw : 0, w: nw, dir: -cur.dir };
    }
    function frame(ts){
      raf = requestAnimationFrame(frame);
      const dt = Math.min(40, ts - (last || ts)); last = ts; const k = dt/16.667;
      if(!over){ cur.x += cur.dir*speed*k; if(cur.x < 0){ cur.x = 0; cur.dir = 1; } else if(cur.x + cur.w > W){ cur.x = W - cur.w; cur.dir = -1; } }
      cam += (camT - cam)*.12;
      falling.forEach(f=>{ f.vy += .6*k; f.y -= f.vy*k; });
      ctx.fillStyle = '#120a22'; ctx.fillRect(0, 0, W, H);
      const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, 'rgba(120,60,200,.25)'); g.addColorStop(1, 'rgba(255,120,30,.18)'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#ffe9a8'; ctx.beginPath(); ctx.arc(230, 60, 20, 0, 7); ctx.fill();
      const yOf = (i)=> H - 20 - (i+1)*BH + cam;
      tower.forEach((b,i)=>{ ctx.fillStyle = `hsl(${hue(i)} 65% 55%)`; ctx.fillRect(b.x, yOf(i), b.w, BH - 2); ctx.fillStyle = 'rgba(255,255,255,.2)'; ctx.fillRect(b.x, yOf(i), b.w, 4); });
      if(!over){ const i = tower.length; ctx.fillStyle = `hsl(${hue(i)} 70% 62%)`; ctx.fillRect(cur.x, yOf(i), cur.w, BH - 2); }
      falling.forEach(f=>{ ctx.fillStyle = `hsl(${f.h} 50% 45%)`; ctx.fillRect(f.x, H - 20 - (f.y/BH + 1)*BH + cam, f.w, BH - 2); });
      falling = falling.filter(f=> f.vy < 25);
    }
    cv.addEventListener('pointerdown', e=>{ e.preventDefault(); place(); });
    const onKey = (e)=>{ if(e.code === 'Space' || e.key === 'ArrowDown'){ e.preventDefault(); place(); } };
    window.addEventListener('keydown', onKey);
    raf = requestAnimationFrame(frame);
    return ()=>{ cancelAnimationFrame(raf); window.removeEventListener('keydown', onKey); };
  }

  /* ---------- 登録 ---------- */
  const NEW = [
    { id:'dino',     emoji:'🦖', name:'ハロウィン・ラン',     desc:'ジャンプ＆しゃがみで障害物をよけて走れ！', unit:'点',     better:'high', genre:'action', start:gameDino },
    { id:'breakout', emoji:'🧱', name:'かぼちゃブロック崩し', desc:'ボールを打ち返して全部こわそう',           unit:'点',     better:'high', genre:'action', start:gameBreakout },
    { id:'catch',    emoji:'🧺', name:'キャンディキャッチ',   desc:'お菓子をキャッチ！💀はよけて',             unit:'点',     better:'high', genre:'action', start:gameCatch },
    { id:'stack',    emoji:'🏰', name:'ホーンテッド・スタック', desc:'ぴったり積んで、お城を高く！',           unit:'段',     better:'high', genre:'action', start:gameStack },
    { id:'maze',     emoji:'🌀', name:'まよいの洋館',         desc:'迷路を最速で脱出しよう',                   unit:'秒',     better:'low',  genre:'puzzle', start:gameMaze },
    { id:'slide',    emoji:'🧩', name:'おばけスライド',       desc:'少ない手数で1〜8を並べよう',               unit:'手',     better:'low',  genre:'puzzle', start:gameSlide },
    { id:'lights',   emoji:'💡', name:'ともしびライツアウト', desc:'ろうそくを全部消せ！',                     unit:'手',     better:'low',  genre:'puzzle', start:gameLights },
    { id:'reflex',   emoji:'⚡', name:'ガイコツ反射神経',     desc:'「いま！」で即タップ。5回の平均',           unit:'ms',     better:'low',  genre:'reflex', start:gameReflex, fmt:(n)=> n + 'ms' },
    { id:'numtouch', emoji:'🔢', name:'ナンバータッチ',       desc:'1〜16を順番にすばやくタップ',               unit:'0.1秒',  better:'low',  genre:'reflex', start:gameNumTouch, fmt:(n)=> (n/10).toFixed(1) + '秒' },
    { id:'stroop',   emoji:'🎨', name:'いろいろモンスター',   desc:'文字の「色」をえらべ！30秒',               unit:'問',     better:'high', genre:'reflex', start:gameStroop },
    { id:'simon',    emoji:'🕯', name:'ろうそくシモン',       desc:'光る順番をおぼえて、同じ順にタップ',       unit:'ラウンド', better:'high', genre:'brain', start:gameSimon },
    { id:'math',     emoji:'➕', name:'ばけばけ計算',         desc:'30秒で何問とけるかな？',                   unit:'問',     better:'high', genre:'brain',  start:gameMath }
  ];
  NEW.forEach(g=> window.CBMini.register({ ...g, isNew:true }));
  window.CBMini._t2 = { genMaze, slideShuffle, slideSolved, lightsGen, lightsToggle, makeQuestion };
})();

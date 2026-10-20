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
        dir = d; break;
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
        CB().sound && CB().sound('coin'); CB().vibrate && CB().vibrate(10);
      } else snake.pop();
    }
    function die(){
      if(dead) return; dead = true; deadAt = performance.now();
      CB().sound && CB().sound('gameover'); CB().vibrate && CB().vibrate([30,30,60]);
      cv.classList.add('shake');
      setTimeout(()=> api.finish({ rating: clamp(score*5, 0, 100), score, better:'high', text:`かぼちゃを ${score} 個 食べた`, valid:true }), 750);
    }
    function bodyPoints(t){
      return snake.map((s,i)=>{ const f = prev[i] || prev[prev.length-1]; return { x:lerp(f.x, s.x, t) + .5, y:lerp(f.y, s.y, t) + .5 }; });
    }
    function draw(ts, t){
      ctx.fillStyle = '#120a22'; ctx.fillRect(0,0,N*S,N*S);
      ctx.fillStyle = 'rgba(255,255,255,.035)';
      for(let x=0;x<N;x++) for(let y=0;y<N;y++) if((x+y)%2===0) ctx.fillRect(x*S, y*S, S, S);
      // かぼちゃ(ゆらゆら脈打つ)
      const pulse = 1 + Math.sin(ts/170)*.07;
      ctx.save(); ctx.translate((food.x+.5)*S, (food.y+.5)*S); ctx.scale(pulse, pulse);
      ctx.shadowColor = 'rgba(255,140,30,.8)'; ctx.shadowBlur = 14;
      ctx.font = `${S-3}px serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('🎃', 0, 1); ctx.restore();
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
      if(!started){ started = true; msg.style.visibility = 'hidden'; if(dx === -dir.x && dy === -dir.y) return; }
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
  function stopGame(){ if(cleanup){ try{ cleanup(); }catch(e){} cleanup = null; } }
  function close(){ stopGame(); current = null; if(root){ root.classList.remove('show'); } }

  function bestText(g){
    const r = rec[g.id];
    return r && r.best != null ? `ベスト ${r.best}${g.unit}` : 'まだ記録なし';
  }
  function openMenu(){
    ensureRoot(); stopGame(); current = null; rankView = false;
    root.classList.add('show'); resultEl.className = 'mg-result'; resultEl.innerHTML = '';
    titleEl.textContent = '🕹 ミニゲーム'; bestEl.textContent = '';
    body.className = 'mg-body menu';
    body.innerHTML = `<div class="mg-lead">どれも1回1〜2分。遊ぶと 🪙コイン と 🍬ハロウィンキャンディ(開催中)がもらえます！</div>
      <button class="mg-rankbtn" type="button">🏆 ランキングを見る</button><div class="mg-grid"></div>`;
    body.querySelector('.mg-rankbtn').addEventListener('click', ()=> openRanking(GAMES[0].id));
    const grid = body.querySelector('.mg-grid');
    const bestLine = (g)=>{ const sm = summary && summary[g.id]; return sm && sm.rank ? `${bestText(g)}(全体 ${sm.rank}位)` : bestText(g); };
    const bestEls = {};
    GAMES.forEach((g,i)=>{
      const card = $('button','mg-card', `<span class="mg-emo">${g.emoji}</span><span class="mg-name">${g.name}</span><span class="mg-desc">${g.desc}</span><span class="mg-best">${bestLine(g)}</span>`);
      card.type = 'button'; card.style.animationDelay = (i*0.05) + 's';
      card.addEventListener('click', ()=> startGame(g.id));
      grid.append(card); bestEls[g.id] = card.querySelector('.mg-best');
    });
    // ログイン中なら、自分の順位を取ってきて表示する
    if(CB().isLoggedIn && CB().isLoggedIn() && CB().api){
      CB().api('/api/mini/summary').then(d=>{
        summary = d.games; if(rankView || current) return;
        GAMES.forEach(g=>{ if(bestEls[g.id]) bestEls[g.id].textContent = bestLine(g); });
      }).catch(()=>{});
    }
  }

  // ---------- ランキング画面 ----------
  const fmtScore = (g, n)=> `${n}${g.unit}`;
  function openRanking(gameId){
    ensureRoot(); stopGame(); current = null; rankView = true;
    const g = GAMES.find(x=>x.id === gameId) || GAMES[0];
    root.classList.add('show'); resultEl.className = 'mg-result'; resultEl.innerHTML = '';
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
      let html = d.ranking.map((r,i)=>`<div class="mg-rankrow ${r.id===meId?'me':''} ${i<3?'top':''}"><span class="rk">${['🥇','🥈','🥉'][i] || (i+1)}</span><span class="nm">${r.id}</span><span class="sc">${fmtScore(g, r.score)}</span></div>`).join('');
      if(!d.ranking.length) html = '<div class="empty-hint">まだ記録がありません。一番乗りを目指そう！</div>';
      html += me ? `<div class="mg-rankme">あなた: ${me.rank ? `${me.rank}位 / ${fmtScore(g, me.best)}` : 'まだ記録なし'}</div>`
                 : `<div class="mg-rankme">ログインすると、あなたの記録がランキングに載ります</div>`;
      list.innerHTML = html;
    }).catch(err=>{ list.innerHTML = `<div class="empty-hint">${err.message || '読み込みに失敗しました'}</div>`; });
  }
  function startGame(id){
    ensureRoot(); stopGame(); rankView = false;
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
      <div class="mg-rankline" id="mgRankLine">${res.valid ? (CB().isLoggedIn && CB().isLoggedIn() ? '🏆 ランキングに記録中...' : '🏆 ログインするとランキングに載ります') : ''}</div>
      <div class="mg-btns"><button class="mg-btn" id="mgAgain" type="button">もう一度</button><button class="mg-btn ghost" id="mgMenu" type="button">メニューへ</button></div>
      <button class="mg-linkbtn" id="mgRank" type="button">🏆 ランキングを見る</button>
    </div>`;
    resultEl.querySelector('#mgAgain').addEventListener('click', ()=> startGame(g.id));
    resultEl.querySelector('#mgMenu').addEventListener('click', openMenu);
    resultEl.querySelector('#mgRank').addEventListener('click', ()=> openRanking(g.id));
    bestEl.textContent = bestText(g);
    // ランキングに記録して、順位を表示する
    if(res.valid && CB().isLoggedIn && CB().isLoggedIn() && CB().api){
      CB().api('/api/mini/score', 'POST', { game:g.id, score:res.score }).then(d=>{
        const line = resultEl.querySelector('#mgRankLine');
        if(d && d.rank){ if(summary) summary[g.id] = { ...(summary[g.id]||{}), best:d.best, rank:d.rank }; if(line) line.textContent = `🏆 全体 ${d.rank}位(自己ベスト ${d.best}${g.unit})`; }
        else if(line) line.textContent = '';
      }).catch(()=>{ const line = resultEl.querySelector('#mgRankLine'); if(line) line.textContent = ''; });
    }
  }

  window.CBMini = { open: openMenu, close, games: GAMES, _t: { slideLine, planSlide, neighbors, genMines } };
  const btn = document.getElementById('titleMiniBtn');
  if(btn) btn.addEventListener('click', openMenu);
})();

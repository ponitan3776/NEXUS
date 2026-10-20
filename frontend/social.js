/* =====================================================================
   🗳 投票 (v3.4)
   ・ゲスト以外のみんなが、出された質問に投票できる(やり直し可・終了後は不可)。ゲストは結果を見るだけ
   ・質問の作成/編集/終了/削除は管理者パネル(admin.js)から
   サーバー: GET /api/polls  /  POST /api/polls/<id>/vote {option}
   ===================================================================== */
(function(){
  'use strict';
  const CB = ()=> window.CB || {};
  const esc = (s)=> String(s == null ? '' : s).replace(/[&<>"]/g, c=>({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[c]));
  const mc = ()=> document.getElementById('modalContent');
  const mo = ()=> document.getElementById('modalOverlay');

  let polls = [];
  let timer = null;

  async function refresh(){
    try{ const d = await CB().api('/api/polls'); polls = (d && d.polls) || []; return true; }catch(e){ return false; }
  }
  // ロビーのバッジ用: まだ投票していない「受付中」の質問の数(ゲストは0)
  function unvotedCount(){
    if(!(CB().isLoggedIn && CB().isLoggedIn())) return 0;
    return polls.filter(p=> !p.closed && p.myVote == null).length;
  }
  const pct = (p, o)=> p.total ? Math.round(o.votes / p.total * 100) : 0;

  function pollHtml(p, canVote){
    const leader = Math.max(...p.options.map(o=>o.votes));
    return `<div class="poll-card ${p.closed ? 'closed' : ''}" data-pid="${p.id}">
      <div class="poll-q">${esc(p.question)}</div>
      <div class="poll-meta"><span class="poll-state ${p.closed ? 'off' : 'on'}">${p.closed ? '終了' : '受付中'}</span><span>${p.total}票</span>${p.myVote != null ? '<span class="poll-voted">✓ 投票済み</span>' : ''}</div>
      <div class="poll-opts">${p.options.map((o,i)=>{
        const mine = p.myVote === i, w = pct(p, o);
        return `<button type="button" class="poll-opt ${mine ? 'mine' : ''} ${o.votes === leader && p.total ? 'lead' : ''}" data-opt="${i}" ${canVote && !p.closed ? '' : 'disabled'} style="--p:${w}%">
          <span class="po-bar"></span>
          <span class="po-label">${mine ? '✓ ' : ''}${esc(o.text)}</span>
          <span class="po-val">${w}%<small>${o.votes}票</small></span>
        </button>`; }).join('')}</div>
      ${canVote && !p.closed ? `<div class="poll-hint">${p.myVote == null ? 'タップして投票' : '別の選択肢をタップすると、投票を変更できます'}</div>` : ''}
    </div>`;
  }

  function render(){
    const body = mc(); if(!body || body.dataset.mode !== 'polls') return;
    const logged = !!(CB().isLoggedIn && CB().isLoggedIn());
    let html = `<h2 style="color:var(--gold);">🗳 みんなの投票</h2>`;
    if(!logged) html += `<div class="hw-banner warn">ゲストは結果を見るだけです。投票するには、ログインしてください。</div>`;
    html += polls.length ? polls.map(p=>pollHtml(p, logged)).join('') : `<div class="empty-hint">いま出ている質問はありません。</div>`;
    html += `<div class="sub" style="margin-top:8px;">結果は自動で更新されます。</div>`;
    const keep = body.scrollTop;
    body.innerHTML = html;
    body.scrollTop = keep;
    body.querySelectorAll('.poll-card').forEach(card=>{
      card.querySelectorAll('.poll-opt:not([disabled])').forEach(btn=>{
        btn.addEventListener('click', ()=> vote(parseInt(card.dataset.pid), parseInt(btn.dataset.opt), btn));
      });
    });
  }

  async function vote(pid, opt, btn){
    const cur = polls.find(p=>p.id === pid);
    if(cur && cur.myVote === opt) return;
    btn.classList.add('busy');
    try{
      const d = await CB().api(`/api/polls/${pid}/vote`, 'POST', { option: opt });
      const i = polls.findIndex(p=>p.id === pid);
      if(i >= 0 && d && d.poll) polls[i] = d.poll;
      if(CB().sound) CB().sound('coin');
      if(CB().vibrate) CB().vibrate(15);
      render();
    }catch(err){
      alert(err.message || '投票に失敗しました');
      await refresh(); render();
    }
  }

  async function open(){
    const body = mc(); if(!body) return;
    body.dataset.mode = 'polls';
    body.innerHTML = `<h2 style="color:var(--gold);">🗳 みんなの投票</h2><div class="empty-hint">読み込み中...</div>`;
    mo().classList.add('show');
    await refresh(); render();
    clearInterval(timer);
    timer = setInterval(async ()=>{                                  // 開いている間は、結果を自動で更新
      if(!mo().classList.contains('show') || mc().dataset.mode !== 'polls'){ clearInterval(timer); timer = null; return; }
      if(await refresh()) render();
    }, 6000);
  }

  // ロビーの「投票」ボタン
  const btn = document.getElementById('titlePollBtn');
  if(btn) btn.addEventListener('click', ()=>{ if(CB().hideTitle) CB().hideTitle(); open(); });
  // バッジ用の定期更新
  refresh();
  setInterval(()=>{ if(CB().isLoggedIn && CB().isLoggedIn()) refresh(); }, 120000);

  window.CBSocial = { open, refresh, unvotedCount };
})();

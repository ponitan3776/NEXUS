/* =====================================================================
   🔧 管理者パネル v2 — コマンドを選ぶ → 項目を選んで実行(文字入力は最小限)
   ・ユーザーは一覧から選ぶ / 数字は「−・＋」と金額ボタン / 種類はボタンや選択肢 / メッセージは定型文ボタン
   ・文字でコマンドを打ちたいときは、いちばん下の「⌨ 直接入力」
   ・window.AdminUI.open() で開く(script.js の 🔧 管理 ボタンから)
   ===================================================================== */
(function(){
  'use strict';
  const CB = ()=> window.CB || {};
  const el = (tag, cls, html)=>{ const e = document.createElement(tag); if(cls) e.className = cls; if(html != null) e.innerHTML = html; return e; };
  const esc = (s)=> String(s == null ? '' : s).replace(/[&<>"]/g, c=>({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[c]));
  const fmt = (n)=> Number(n || 0).toLocaleString('ja-JP');
  const mc = ()=> document.getElementById('modalContent');
  const mo = ()=> document.getElementById('modalOverlay');
  const api = (path, method, body)=> CB().api(path, method, body);
  const ok = (t)=> '✅ ' + t;
  const ng = (e)=> '❌ ' + ((e && e.message) || e);

  /* ---------- 定型文・金額ボタン(タイピングを減らすため) ---------- */
  const MSG_TEMPLATES = ['いつもありがとうございます！', '不具合のお詫びです', 'イベント報酬です', 'お誕生日おめでとう！', 'ログインボーナスです', '今後ともよろしくお願いします'];
  const ANN_TEMPLATES = ['メンテナンスを行います', '新しいイベントを開催中です！', 'アップデートしました', 'ご協力ありがとうございます'];
  const POLL_Q_TEMPLATES = ['次に追加してほしいものは？', '今のイベントはどうですか？', '好きなスキンは？', 'ガチャの演出は好きですか？'];
  const POLL_OPT_TEMPLATES = [['はい', 'いいえ'], ['賛成', '反対'], ['A', 'B', 'C'], ['とても良い', '良い', 'ふつう', '悪い']];
  const P_COINS = [100, 500, 1000, 5000, 10000, 50000, 100000];
  const P_COINS_PM = [-10000, -1000, -100, 100, 1000, 10000];
  const P_SMALL = [10, 50, 100, 300, 500, 1000];
  const P_XP = [100, 500, 1000, 3000, 5000, 10000];
  const P_SCORE = [0, 1000, 10000, 100000, 1000000];
  const MODES = [['soft', 'soft'], ['baked', 'baked'], ['hard', 'hard'], ['extreme', 'extreme'], ['tetris', 'テトリス'], ['timeattack', 'タイムアタック']];
  const RECUR = [['once', '一度だけ'], ['daily', '毎日'], ['weekly', '毎週'], ['monthly', '毎月']];
  const WEEKDAYS = [['0', '日'], ['1', '月'], ['2', '火'], ['3', '水'], ['4', '木'], ['5', '金'], ['6', '土']];
  const HOURS = Array.from({ length:24 }, (_, i)=> [String(i), `${i}時`]);
  const MINUTES = [['0', '00分'], ['15', '15分'], ['30', '30分'], ['45', '45分']];

  /* ---------- コマンド一覧(項目の定義 + 実行内容) ---------- */
  const COMMANDS = [
    { id:'gift', group:'👤 ユーザー', icon:'🎁', name:'ギフトを送る', desc:'メッセージ付きで、コイン・イベント通貨・XPを贈る',
      fields:[
        { key:'to', type:'user', label:'送り先', all:true },
        { key:'message', type:'text', label:'手紙のメッセージ', rows:3, max:300, templates:MSG_TEMPLATES },
        { key:'coins', type:'number', label:'🪙 コイン', presets:P_COINS, step:100 },
        { key:'candies', type:'number', label:'🍬 イベント通貨', presets:P_SMALL, step:10 },
        { key:'bpXp', type:'number', label:'🎫 XP(バトルパス)', presets:P_XP, step:100 },
        { key:'eventXp', type:'number', label:'🏁 イベントXP(ロードの進行)', presets:P_SMALL, step:10 }
      ],
      summary:(v)=>{ const it = [v.coins && `🪙${fmt(v.coins)}`, v.candies && `🍬${fmt(v.candies)}`, v.bpXp && `🎫XP ${fmt(v.bpXp)}`, v.eventXp && `🏁イベントXP ${fmt(v.eventXp)}`].filter(Boolean);
        return `送り先: ${v.to === 'all' ? '全員' : (v.to || '(未選択)')} ／ 中身: ${it.length ? it.join(' ・ ') : '(未設定)'}`; },
      validate:(v)=> (!(v.coins || v.candies || v.bpXp || v.eventXp) ? '贈るアイテムを1つ以上、設定してください' : null),
      confirm:(v)=> v.to === 'all' ? '全員にギフトを送ります。よろしいですか？' : null,
      run: async(v)=>{ try{ const d = await api('/api/admin/gift', 'POST', { to:v.to, message:v.message, coins:v.coins, candies:v.candies, bpXp:v.bpXp, eventXp:v.eventXp });
        return ok(`ギフトを ${d.count}人 に送りました。受け取り側は、ログイン時/ゲームオーバー後に開封します。`); }catch(e){ return ng(e); } } },
    { id:'giftlist', group:'👤 ユーザー', icon:'📜', name:'ギフト履歴', desc:'送ったギフトの受け取り状況と、取り消し', view:'gifthist' },
    { id:'addcoins', group:'👤 ユーザー', icon:'🪙', name:'コインを増やす・減らす', desc:'いまの所持コインに加算(マイナスで減算)',
      fields:[ { key:'user', type:'user', label:'対象のユーザー' }, { key:'amount', type:'number', label:'増減するコイン', presets:P_COINS_PM, step:100, min:-1000000000000 } ],
      validate:(v)=> (!v.amount ? '0以外の数を入れてください' : null),
      run:(v)=> CB().adminCommand(`/addcoins ${v.user} ${v.amount}`) },
    { id:'setcoins', group:'👤 ユーザー', icon:'💰', name:'コインをちょうどにする', desc:'所持コインを指定の数に設定',
      fields:[ { key:'user', type:'user', label:'対象のユーザー' }, { key:'amount', type:'number', label:'コイン', presets:[0, ...P_COINS], step:100 } ],
      run:(v)=> CB().adminCommand(`/setcoins ${v.user} ${v.amount}`) },
    { id:'setscore', group:'👤 ユーザー', icon:'🏆', name:'スコアを設定', desc:'モードごとのベストスコアを設定',
      fields:[ { key:'user', type:'user', label:'対象のユーザー' }, { key:'mode', type:'choice', label:'モード', options:MODES }, { key:'score', type:'number', label:'スコア', presets:P_SCORE, step:100 } ],
      run:(v)=> CB().adminCommand(`/setscore ${v.user} ${v.mode} ${v.score}`) },
    { id:'search', group:'👤 ユーザー', icon:'🔍', name:'ユーザー情報を見る', desc:'ベストスコア・コイン・最終ログインなど',
      fields:[ { key:'user', type:'user', label:'対象のユーザー' } ], runLabel:'調べる',
      run:(v)=> CB().adminCommand(`/search ${v.user}`) },
    { id:'ban', group:'👤 ユーザー', icon:'🚫', name:'BAN / BAN解除', desc:'ユーザーのBANを切り替える',
      fields:[ { key:'user', type:'user', label:'対象のユーザー' }, { key:'act', type:'choice', label:'操作', options:[['ban', '🚫 BANする'], ['unban', '✅ BANを解除']], def:'ban' } ],
      confirm:(v)=> v.act === 'ban' ? `${v.user} をBANします。よろしいですか？` : null,
      run:(v)=> CB().adminCommand(`/${v.act} ${v.user}`) },
    { id:'resetuser', group:'👤 ユーザー', icon:'♻️', name:'ユーザーをリセット', desc:'スコア・コイン・スキンを初期化(取り消し不可)', danger:true,
      fields:[ { key:'user', type:'user', label:'対象のユーザー' } ],
      confirm:(v)=> `${v.user} のデータを初期化します。取り消せません。`, run:(v)=> CB().adminCommand(`/resetuser ${v.user}`) },
    { id:'listusers', group:'👤 ユーザー', icon:'👥', name:'ユーザー一覧(上位20)', desc:'ベストスコア順', fields:[], runLabel:'表示', run:()=> CB().adminCommand('/listusers') },

    { id:'announce', group:'📢 お知らせ・投票', icon:'📢', name:'お知らせを配信', desc:'全員に表示されるお知らせ',
      fields:[ { key:'text', type:'text', label:'お知らせの内容', rows:2, max:200, templates:ANN_TEMPLATES } ],
      confirm:()=> '全員にお知らせを配信します。', run:(v)=> CB().adminCommand(`/announce ${v.text.replace(/\s+/g, ' ')}`) },
    { id:'polls', group:'📢 お知らせ・投票', icon:'🗳', name:'投票を管理', desc:'質問の作成・編集・終了・削除・票のリセット', view:'polls' },

    { id:'eventadd', group:'⏰ 自動報酬イベント', icon:'➕', name:'自動報酬を追加', desc:'ランキング順位の人へ、決まった時間にコインを自動配布',
      fields:[
        { key:'rec', type:'choice', label:'いつ', options:RECUR, def:'daily' },
        { key:'date', type:'date', label:'日付', show:(v)=> v.rec === 'once' },
        { key:'weekday', type:'choice', label:'曜日', options:WEEKDAYS, def:'1', show:(v)=> v.rec === 'weekly' },
        { key:'day', type:'number', label:'毎月の日付(1〜31)', presets:[1, 10, 15, 20, 25], step:1, min:1, max:31, def:1, show:(v)=> v.rec === 'monthly' },
        { key:'hour', type:'select', label:'時(日本時間)', options:HOURS, def:'20' },
        { key:'minute', type:'select', label:'分', options:MINUTES, def:'0' },
        { key:'mode', type:'choice', label:'対象ランキング', options:MODES, def:'baked' },
        { key:'rank', type:'number', label:'何位の人に配る?', presets:[1, 2, 3, 5, 10], step:1, min:1, def:1 },
        { key:'coins', type:'number', label:'配るコイン', presets:P_COINS, step:100, def:500 }
      ],
      validate:(v)=> (v.rec === 'once' && !v.date ? '日付を選んでください' : null),
      run:(v)=>{ let y = 0, m = 0, d = 0;
        if(v.rec === 'once'){ [y, m, d] = v.date.split('-').map(Number); }
        else if(v.rec === 'weekly'){ d = Number(v.weekday); } else if(v.rec === 'monthly'){ d = Number(v.day); }
        return CB().adminCommand(`/eventadd ${v.rec} ${v.mode} ${v.rank} ${v.coins} ${y} ${m} ${d} ${v.hour} ${v.minute}`); } },
    { id:'eventlist', group:'⏰ 自動報酬イベント', icon:'📋', name:'登録済みの一覧', desc:'登録されている自動報酬イベントを表示', fields:[], runLabel:'表示', run:()=> CB().adminCommand('/eventlist') },
    { id:'eventremove', group:'⏰ 自動報酬イベント', icon:'🗑', name:'自動報酬を削除', desc:'IDを指定して削除(IDは「登録済みの一覧」で確認)',
      fields:[ { key:'id', type:'number', label:'イベントID', presets:[1, 2, 3, 4, 5], step:1, min:1, def:1 } ],
      confirm:(v)=> `イベント ${v.id} を削除します。`, run:(v)=> CB().adminCommand(`/eventremove ${v.id}`) },

    { id:'discordtest', group:'🖥 サーバー', icon:'📨', name:'外部通知の接続テスト', desc:'通知用Webhookの設定と、送信できるかを確認', fields:[], runLabel:'テスト', run:()=> CB().adminCommand('/discordtest') },
    { id:'stats', group:'🖥 サーバー', icon:'📊', name:'サーバー統計', desc:'ユーザー数・総コイン・総プレイ時間', fields:[], runLabel:'表示', run:()=> CB().adminCommand('/stats') },
    { id:'safety', group:'🖥 サーバー', icon:'🛡', name:'セーフティモード', desc:'管理者アカウントの強制セーフティモードを切り替え',
      fields:[ { key:'mode', type:'choice', label:'設定', options:[['status', '状態を見る'], ['on', 'ONにする'], ['off', 'OFFにする']], def:'status' } ],
      run:(v)=> CB().adminCommand(v.mode === 'status' ? '/safety' : `/safety ${v.mode}`) },
    { id:'blocks', group:'🖥 サーバー', icon:'🧩', name:'ブロック出現設定', desc:'出現させないブロックの形を選ぶ', view:'blocks' },
    { id:'resetquests', group:'🖥 サーバー', icon:'🔁', name:'クエストをリセット', desc:'全ユーザーのクエスト進捗を初期化', danger:true, fields:[],
      confirm:()=> '全ユーザーのクエスト進捗をリセットします。', run:()=> CB().adminCommand('/resetquests') },
    { id:'setplaytime', group:'🖥 サーバー', icon:'⏱', name:'自分のプレイ時間を設定', desc:'管理者自身のプレイ時間(秒)',
      fields:[ { key:'sec', type:'number', label:'秒', presets:[0, 600, 3600, 36000], step:60 } ], run:(v)=> CB().adminCommand(`/setplaytime ${v.sec}`) },

    { id:'raw', group:'⌨ 上級者向け', icon:'⌨', name:'直接入力', desc:'コマンドを文字で入力して実行(例: /stats)',
      fields:[ { key:'cmd', type:'text', label:'コマンド', rows:1, max:300 } ], run:(v)=> CB().adminCommand(v.cmd.trim()) }
  ];

  /* ---------- 状態 ---------- */
  const formState = {};          // コマンドごとに入力値を覚える(ユーザー選択から戻っても消えない)
  let menuQuery = '';

  function defaults(cmd){
    const v = {};
    (cmd.fields || []).forEach(f=>{
      if(f.def !== undefined) v[f.key] = f.def;
      else if(f.type === 'number') v[f.key] = Math.max(f.min || 0, 0);
      else if(f.type === 'choice' || f.type === 'select') v[f.key] = f.options[0][0];
      else if(f.type === 'list') v[f.key] = Array.from({ length:f.min || 2 }, ()=>'');
      else if(f.type === 'toggle') v[f.key] = false;
      else v[f.key] = '';
    });
    return v;
  }
  function begin(){
    const root = mc(); root.dataset.mode = 'admin'; root.innerHTML = '';
    mo().classList.add('show');
    return root;
  }
  const backBtn = (label, fn)=>{ const b = el('button', 'adm-back', `‹ ${label}`); b.type = 'button'; b.addEventListener('click', fn); return b; };
  const chip = (text, on, fn)=>{ const b = el('button', 'adm-chip' + (on ? ' on' : ''), esc(text)); b.type = 'button'; b.addEventListener('click', fn); return b; };

  /* ---------- メニュー(コマンド一覧) ---------- */
  function renderMenu(){
    const root = begin();
    root.append(el('h2', 'adm-h', '🔧 管理者コマンド'));
    root.append(el('div', 'sub', 'やりたいことを選んでください。入力はボタンと選択肢でできます。'));
    const search = el('input', 'adm-search'); search.type = 'search'; search.placeholder = '🔍 さがす(例: ギフト)'; search.value = menuQuery;
    root.append(search);
    const list = el('div', 'adm-menu'); root.append(list);
    function paint(){
      const q = search.value.trim().toLowerCase(); menuQuery = search.value; list.innerHTML = '';
      const groups = [...new Set(COMMANDS.map(c=>c.group))];
      let any = false;
      groups.forEach(g=>{
        const cs = COMMANDS.filter(c=> c.group === g && (!q || (c.name + c.desc + c.id).toLowerCase().includes(q)));
        if(!cs.length) return; any = true;
        list.append(el('div', 'adm-group', esc(g)));
        const grid = el('div', 'adm-grid');
        cs.forEach(c=>{
          const b = el('button', 'adm-card' + (c.danger ? ' danger' : ''), `<span class="ac-ic">${c.icon}</span><span class="ac-name">${esc(c.name)}</span><span class="ac-desc">${esc(c.desc)}</span>`);
          b.type = 'button'; b.addEventListener('click', ()=> openCommand(c)); grid.append(b);
        });
        list.append(grid);
      });
      if(!any) list.append(el('div', 'empty-hint', '見つかりません'));
    }
    search.addEventListener('input', paint); paint();
  }

  function openCommand(cmd){
    if(cmd.view === 'polls') return renderPolls();
    if(cmd.view === 'gifthist') return renderGiftHistory();
    if(cmd.view === 'blocks') return CB().openAdminBlocks && CB().openAdminBlocks();
    renderForm(cmd);
  }

  /* ---------- 入力フォーム ---------- */
  function validateAll(cmd, v){
    for(const f of (cmd.fields || [])){
      if(f.show && !f.show(v)) continue;
      if(f.type === 'user' && !v[f.key]) return `「${f.label}」を選んでください`;
      if(f.type === 'text' && !String(v[f.key] || '').trim()) return `「${f.label}」を入力してください`;
      if(f.type === 'number' && f.max != null && v[f.key] > f.max) return `「${f.label}」は ${fmt(f.max)} 以下にしてください`;
      if(f.type === 'number' && f.min != null && v[f.key] < f.min) return `「${f.label}」は ${fmt(f.min)} 以上にしてください`;
    }
    return cmd.validate ? cmd.validate(v) : null;
  }

  function buildField(f, v, cmd, onChange){
    const wrap = el('div', 'adm-field'); wrap.dataset.key = f.key;
    wrap.append(el('div', 'adm-label', esc(f.label)));
    if(f.type === 'user'){
      const b = el('button', 'adm-userbtn'); b.type = 'button';
      const label = v[f.key] === 'all' ? '全員' : v[f.key];
      b.innerHTML = v[f.key] ? `👤 <b>${esc(label)}</b><span>変更 ▾</span>` : '👤 ユーザーを選ぶ ▾';
      b.classList.toggle('empty', !v[f.key]);
      b.addEventListener('click', ()=> renderUserPicker(cmd, f));
      wrap.append(b);
    } else if(f.type === 'number'){
      const min = f.min != null ? f.min : 0, max = f.max != null ? f.max : 1e12, step = f.step || 1;
      const row = el('div', 'adm-num'); const minus = el('button', 'adm-step', '−'), plus = el('button', 'adm-step', '＋'), inp = el('input');
      minus.type = plus.type = 'button'; inp.type = 'number'; inp.inputMode = 'numeric'; inp.value = v[f.key];
      const set = (n)=>{ n = Math.max(min, Math.min(max, Math.round(Number(n) || 0))); v[f.key] = n; inp.value = n; onChange(); };
      minus.addEventListener('click', ()=> set(v[f.key] - step)); plus.addEventListener('click', ()=> set(v[f.key] + step));
      inp.addEventListener('input', ()=>{ v[f.key] = Math.max(min, Math.min(max, Math.round(Number(inp.value) || 0))); onChange(); });
      row.append(minus, inp, plus); wrap.append(row);
      if(f.presets){ const pr = el('div', 'adm-presets'); f.presets.forEach(p=> pr.append(chip((p > 0 && min < 0 ? '+' : '') + fmt(p), false, ()=> set(p)))); wrap.append(pr); }
    } else if(f.type === 'choice'){
      const row = el('div', 'adm-chips');
      f.options.forEach(([val, label])=>{ row.append(chip(label, v[f.key] === val, ()=>{ v[f.key] = val; [...row.children].forEach((c,i)=> c.classList.toggle('on', f.options[i][0] === val)); onChange(); })); });
      wrap.append(row);
    } else if(f.type === 'select'){
      const s = el('select', 'adm-select'); f.options.forEach(([val, label])=>{ const o = el('option'); o.value = val; o.textContent = label; if(v[f.key] === val) o.selected = true; s.append(o); });
      s.addEventListener('change', ()=>{ v[f.key] = s.value; onChange(); }); wrap.append(s);
    } else if(f.type === 'date'){
      const d = el('input', 'adm-date'); d.type = 'date'; d.value = v[f.key] || ''; d.addEventListener('change', ()=>{ v[f.key] = d.value; onChange(); }); wrap.append(d);
    } else if(f.type === 'text'){
      const ta = el(f.rows > 1 ? 'textarea' : 'input', 'adm-text'); if(f.rows > 1) ta.rows = f.rows; ta.maxLength = f.max || 300; ta.value = v[f.key] || '';
      ta.addEventListener('input', ()=>{ v[f.key] = ta.value; onChange(); }); wrap.append(ta);
      if(f.templates){ const pr = el('div', 'adm-presets'); f.templates.forEach(t=> pr.append(chip(t, false, ()=>{ ta.value = t; v[f.key] = t; onChange(); }))); wrap.append(pr); }
    }
    return wrap;
  }

  function renderForm(cmd){
    const v = formState[cmd.id] || (formState[cmd.id] = defaults(cmd));
    const root = begin();
    root.append(backBtn('コマンド一覧', renderMenu));
    root.append(el('h2', 'adm-h', `${cmd.icon} ${esc(cmd.name)}`));
    root.append(el('div', 'sub', esc(cmd.desc)));
    const form = el('div', 'adm-form'); root.append(form);
    const sum = el('div', 'adm-summary'); const out = el('div', 'adm-result'); out.style.display = 'none';
    const fields = (cmd.fields || []).map(f=>({ f, wrap:null }));
    function refresh(){
      fields.forEach(x=>{ if(x.f.show) x.wrap.style.display = x.f.show(v) ? '' : 'none'; });
      sum.textContent = cmd.summary ? cmd.summary(v) : ''; sum.style.display = cmd.summary ? '' : 'none';
    }
    fields.forEach(x=>{ x.wrap = buildField(x.f, v, cmd, refresh); form.append(x.wrap); });
    const runBtn = el('button', 'primary-btn adm-run' + (cmd.danger ? ' danger' : ''), esc(cmd.runLabel || '実行')); runBtn.type = 'button';
    root.append(sum, runBtn, out);
    refresh();
    let armed = false, armTimer = null;
    const showOut = (text, kind)=>{ out.style.display = ''; out.className = 'adm-result ' + kind; out.textContent = text; };
    runBtn.addEventListener('click', async ()=>{
      const err = validateAll(cmd, v);
      if(err){ showOut('⚠ ' + err, 'ng'); return; }
      const need = cmd.confirm ? cmd.confirm(v) : null;
      if(need && !armed){                                              // 危険な操作は「もう一度押して実行」
        armed = true; runBtn.textContent = '⚠ もう一度押して実行'; showOut('⚠ ' + need, 'warn');
        clearTimeout(armTimer); armTimer = setTimeout(()=>{ armed = false; runBtn.textContent = cmd.runLabel || '実行'; }, 4500); return;
      }
      armed = false; clearTimeout(armTimer); runBtn.disabled = true; runBtn.textContent = '⏳ 実行中...';
      let res; try{ res = await cmd.run(v); }catch(e){ res = ng(e); }
      runBtn.disabled = false; runBtn.textContent = cmd.runLabel || '実行';
      res = String(res || '');
      showOut(res, res.startsWith('❌') ? 'ng' : 'ok');
      if(!res.startsWith('❌') && CB().sound) CB().sound('coin');
    });
  }

  /* ---------- ユーザーを選ぶ ---------- */
  function renderUserPicker(cmd, f){
    const root = begin();
    root.append(backBtn('戻る', ()=> renderForm(cmd)));
    root.append(el('h2', 'adm-h', '👤 ユーザーを選ぶ'));
    const search = el('input', 'adm-search'); search.type = 'search'; search.placeholder = '🔍 IDで絞り込み(入力は任意)'; root.append(search);
    if(f.all){ const all = el('button', 'adm-user all', '<span class="au-id">🌍 全員</span><span class="au-sub">BANされていない全ユーザー</span>'); all.type = 'button';
      all.addEventListener('click', ()=>{ formState[cmd.id][f.key] = 'all'; renderForm(cmd); }); root.append(all); }
    const list = el('div', 'adm-users'); root.append(list);
    let t = null, seq = 0;
    async function load(q){
      const my = ++seq; list.innerHTML = '<div class="empty-hint">読み込み中...</div>';
      try{
        const d = await api('/api/admin/users?q=' + encodeURIComponent(q || ''));
        if(my !== seq) return;
        list.innerHTML = '';
        if(!d.users.length){ list.innerHTML = '<div class="empty-hint">該当するユーザーがいません</div>'; return; }
        d.users.forEach(u=>{
          const b = el('button', 'adm-user', `<span class="au-id">${esc(u.id)}${u.banned ? ' <em>BAN中</em>' : ''}</span><span class="au-sub">🏆 ${fmt(u.bestScore)} ／ 🪙 ${fmt(u.coins)}</span>`);
          b.type = 'button'; b.addEventListener('click', ()=>{ formState[cmd.id][f.key] = u.id; renderForm(cmd); }); list.append(b);
        });
      }catch(e){ if(my === seq) list.innerHTML = `<div class="empty-hint">${esc(e.message)}</div>`; }
    }
    search.addEventListener('input', ()=>{ clearTimeout(t); t = setTimeout(()=> load(search.value.trim()), 250); });
    load('');
  }

  /* ---------- 投票を管理 ---------- */
  async function renderPolls(){
    const root = begin();
    root.append(backBtn('コマンド一覧', renderMenu));
    root.append(el('h2', 'adm-h', '🗳 投票を管理'));
    const add = el('button', 'primary-btn', '＋ 新しい質問をつくる'); add.type = 'button'; add.addEventListener('click', ()=> renderPollForm(null)); root.append(add);
    const list = el('div', 'adm-polllist', '<div class="empty-hint">読み込み中...</div>'); root.append(list);
    let polls = [];
    try{ polls = (await api('/api/polls')).polls || []; }catch(e){ list.innerHTML = `<div class="empty-hint">${esc(e.message)}</div>`; return; }
    list.innerHTML = polls.length ? '' : '<div class="empty-hint">まだ質問がありません</div>';
    polls.forEach(p=>{
      const card = el('div', 'adm-poll' + (p.closed ? ' closed' : ''));
      card.append(el('div', 'ap-q', esc(p.question)));
      card.append(el('div', 'ap-meta', `${p.closed ? '🔒 終了' : '🟢 受付中'} ／ 計${p.total}票 ／ ` + p.options.map(o=>`${esc(o.text)} ${o.votes}`).join(' ・ ')));
      const act = el('div', 'ap-act');
      const mk = (label, fn, cls)=>{ const b = el('button', 'adm-mini ' + (cls || ''), label); b.type = 'button'; b.addEventListener('click', fn); act.append(b); return b; };
      mk('👀 投票の詳細', ()=> renderPollVoters(p));
      mk('✏️ 編集', ()=> renderPollForm(p));
      mk(p.closed ? '▶ 再開' : '⏹ 終了', async ()=>{ try{ await api('/api/admin/poll/close', 'POST', { id:p.id, closed:!p.closed }); renderPolls(); }catch(e){ alert(e.message); } });
      mk('🧹 票をリセット', async function(){ if(!confirmTap(this, '本当にリセット')) return; try{ await api('/api/admin/poll/reset', 'POST', { id:p.id }); renderPolls(); }catch(e){ alert(e.message); } });
      mk('🗑 削除', async function(){ if(!confirmTap(this, '本当に削除')) return; try{ await api('/api/admin/poll/delete', 'POST', { id:p.id }); renderPolls(); }catch(e){ alert(e.message); } }, 'danger');
      card.append(act); list.append(card);
    });
  }
  /* ---------- 投票の詳細: どのアカウントが、どれに投票したか ---------- */
  async function renderPollVoters(p){
    const root = begin();
    root.append(backBtn('投票の管理', renderPolls));
    root.append(el('h2', 'adm-h', '👀 投票の詳細'));
    root.append(el('div', 'ap-q', esc(p.question)));
    const find = el('input', 'adm-voter-find'); find.type = 'search'; find.placeholder = '🔍 アカウントで探す(何に投票したか表示)'; find.autocomplete = 'off';
    const found = el('div', 'adm-voter-found'); const box = el('div', 'adm-voters', '<div class="empty-hint">読み込み中...</div>');
    root.append(find, found, box);
    let d;
    try{ d = await api(`/api/admin/poll/${p.id}/voters`); }catch(e){ box.innerHTML = `<div class="empty-hint">${esc(e.message)}</div>`; return; }
    const when = (iso)=>{ if(!iso) return ''; const t = new Date(iso.endsWith('Z') || /[+-]\d\d:?\d\d$/.test(iso) ? iso : iso + 'Z');
      return isNaN(t) ? '' : t.toLocaleString('ja-JP', { month:'numeric', day:'numeric', hour:'2-digit', minute:'2-digit', timeZone:'Asia/Tokyo' }); };
    root.insertBefore(el('div', 'ap-meta', `${d.closed ? '🔒 終了' : '🟢 受付中'} ／ 計${d.total}票(時刻は日本時間)`), find);
    box.innerHTML = '';
    d.options.forEach((o, i)=>{
      const card = el('div', 'adm-vopt');
      card.append(el('div', 'avo-h', `<span class="avo-t">${i + 1}. ${esc(o.text)}</span><b>${o.voters.length}票</b>`));
      const list = el('div', 'avo-list');
      if(!o.voters.length) list.append(el('span', 'avo-none', 'まだ誰も投票していません'));
      o.voters.forEach(v=>{ const c = el('span', 'avo-chip', `${esc(v.id)}<small>${esc(when(v.at))}</small>`); c.dataset.uid = v.id.toLowerCase(); list.append(c); });
      card.append(list); box.append(card);
    });
    find.addEventListener('input', ()=>{
      const q = find.value.trim().toLowerCase(); found.innerHTML = '';
      box.querySelectorAll('.avo-chip').forEach(c=> c.classList.toggle('hit', !!q && c.dataset.uid.includes(q)));
      if(!q) return;
      const hits = [];
      d.options.forEach((o, i)=> o.voters.forEach(v=>{ if(v.id.toLowerCase().includes(q)) hits.push(`<b>${esc(v.id)}</b> → ${i + 1}. ${esc(o.text)}`); }));
      found.innerHTML = hits.length ? hits.slice(0, 10).join('<br>') : '投票していない、または見つかりません';
    });
  }
  // ボタンを2回押さないと実行されない(押し間違い防止)。1回目はラベルが変わるだけ
  function confirmTap(btn, label){
    if(btn.dataset.armed === '1') return true;
    btn.dataset.armed = '1'; const old = btn.textContent; btn.textContent = '⚠ ' + label;
    setTimeout(()=>{ btn.dataset.armed = ''; btn.textContent = old; }, 3500);
    return false;
  }

  function renderPollForm(poll){
    const root = begin();
    root.append(backBtn('投票の一覧', renderPolls));
    root.append(el('h2', 'adm-h', poll ? '✏️ 質問を編集' : '＋ 新しい質問'));
    const st = { q: poll ? poll.question : '', opts: poll ? poll.options.map(o=>o.text) : ['', ''] };
    // 質問
    const qf = el('div', 'adm-field'); qf.append(el('div', 'adm-label', '質問'));
    const qi = el('textarea', 'adm-text'); qi.rows = 2; qi.maxLength = 120; qi.value = st.q; qi.addEventListener('input', ()=>{ st.q = qi.value; }); qf.append(qi);
    const qt = el('div', 'adm-presets'); POLL_Q_TEMPLATES.forEach(t=> qt.append(chip(t, false, ()=>{ qi.value = t; st.q = t; }))); qf.append(qt); root.append(qf);
    // 選択肢
    const of = el('div', 'adm-field'); of.append(el('div', 'adm-label', '選択肢(2〜8個)'));
    const box = el('div', 'adm-list'); of.append(box);
    const tt = el('div', 'adm-presets'); POLL_OPT_TEMPLATES.forEach(t=> tt.append(chip(t.join(' / '), false, ()=>{ st.opts = t.slice(); paint(); })));
    of.append(el('div', 'adm-sublabel', 'よく使う選択肢(タップでセット)')); of.append(tt); root.append(of);
    function paint(){
      box.innerHTML = '';
      st.opts.forEach((t, i)=>{
        const r = el('div', 'adm-listrow'); const inp = el('input'); inp.placeholder = `選択肢${i + 1}`; inp.maxLength = 40; inp.value = t;
        inp.addEventListener('input', ()=>{ st.opts[i] = inp.value; });
        const rm = el('button', 'adm-step', '✕'); rm.type = 'button'; rm.addEventListener('click', ()=>{ if(st.opts.length > 2){ st.opts.splice(i, 1); paint(); } });
        r.append(inp, rm); box.append(r);
      });
      if(st.opts.length < 8){ const a = el('button', 'adm-mini', '＋ 選択肢を追加'); a.type = 'button'; a.addEventListener('click', ()=>{ st.opts.push(''); paint(); }); box.append(a); }
    }
    paint();
    if(poll && poll.total > 0) root.append(el('div', 'adm-note', '⚠ すでに票があります。選択肢の数を減らすと、消した選択肢への票は消えます。'));
    const out = el('div', 'adm-result'); out.style.display = 'none';
    const save = el('button', 'primary-btn adm-run', poll ? '保存する' : '作成する'); save.type = 'button';
    save.addEventListener('click', async ()=>{
      save.disabled = true;
      try{
        const body = { question: st.q, options: st.opts };
        if(poll){ body.id = poll.id; await api('/api/admin/poll/update', 'POST', body); } else await api('/api/admin/poll/create', 'POST', body);
        if(CB().sound) CB().sound('coin');
        renderPolls();
      }catch(e){ out.style.display = ''; out.className = 'adm-result ng'; out.textContent = '❌ ' + e.message; save.disabled = false; }
    });
    root.append(save, out);
  }

  /* ---------- ギフト履歴 ---------- */
  async function renderGiftHistory(){
    const root = begin();
    root.append(backBtn('コマンド一覧', renderMenu));
    root.append(el('h2', 'adm-h', '📜 ギフト履歴'));
    const list = el('div', 'adm-polllist', '<div class="empty-hint">読み込み中...</div>'); root.append(list);
    try{
      const d = await api('/api/admin/gifts');
      list.innerHTML = d.gifts.length ? '' : '<div class="empty-hint">まだギフトを送っていません</div>';
      d.gifts.forEach(g=>{
        const items = [g.coins && `🪙${fmt(g.coins)}`, g.candies && `🍬${fmt(g.candies)}`, g.bpXp && `🎫${fmt(g.bpXp)}`, g.eventXp && `🏁${fmt(g.eventXp)}`].filter(Boolean).join(' ');
        const card = el('div', 'adm-poll');
        card.append(el('div', 'ap-q', `${g.to === 'all' ? '🌍 全員' : '👤 ' + esc(g.to)} ← ${items}`));
        card.append(el('div', 'ap-meta', `「${esc(String(g.message).slice(0, 40))}」 ／ 受け取り ${g.claimed}/${g.total}`));
        if(g.claimed < g.total){
          const act = el('div', 'ap-act'); const b = el('button', 'adm-mini danger', '🚫 未受け取り分を取り消す'); b.type = 'button';
          b.addEventListener('click', async function(){ if(!confirmTap(this, '本当に取り消す')) return; try{ await api('/api/admin/gift/cancel', 'POST', { batch:g.batch }); renderGiftHistory(); }catch(e){ alert(e.message); } });
          act.append(b); card.append(act);
        }
        list.append(card);
      });
    }catch(e){ list.innerHTML = `<div class="empty-hint">${esc(e.message)}</div>`; }
  }

  window.AdminUI = { open: renderMenu, _commands: COMMANDS };
})();

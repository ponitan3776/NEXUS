(function(){

// バックエンドのURLは config.js で設定する(GitHub Pagesでもここを触らずに済む)
const API_BASE_URL = String((window.CANDYBLAST_CONFIG && window.CANDYBLAST_CONFIG.API_BASE_URL) || 'https://pinkyburst.onrender.com').replace(/\/+$/, '');

// ★管理者アカウントを 'admin' から 'spirit' へ移行(バックエンドのADMIN_USER_IDと合わせること)
const ADMIN_USER_ID = 'spirit';

// ===================== 🎵 音楽ライブラリ =====================
  // 曲を追加するときは、この配列に1行足すだけ！
  // ファイルは frontend/bgm/ の中に置く
  const MUSIC_LIBRARY = [
    { title:'月光 第1楽章', artist:'ベートーヴェン', file:'moonlight.mp3', category:'クラシック', emoji:'🌙' },
    { title:'月が綺麗ねと言われたい！', artist:'柿崎ユウタ', file:'beautifulmoon.mp3', category:'その他', emoji:'🌙' },
    { title:'マーシャル・マキシマイザー', artist:'柊マグネタイト', file:'marshallmaximizer.mp3', category:'その他', emoji:'🎰' },
    { title:'お前うんち俺もうんち', artist:'須和しわす', file:'poop.mp3', category:'クラシック', emoji:'💩' },
    { title:'我期待的不是', artist:'張妙格', file:'china.mp3', category:'その他', emoji:'❄️' },

    // 追加例:
    // { title:'〇〇', artist:'〇〇', file:'xxx.mp3', category:'ゲーム', emoji:'🎮' },
  ];
  const MUSIC_CATEGORIES = ['すべて', 'クラシック', 'ゲーム', '作業用', 'その他'];

  // ===================== 永続化ストレージ(localStorageベース) =====================
  // このアプリはRender上の通常のWebページとして動作するため、
  // (Claudeアーティファクト専用の window.storage ではなく)標準の localStorage を使う。
  // 呼び出し側のコードは変えずに済むよう、同じインターフェースのラッパーを用意する。
  const appStorage = {
    async get(key){
      try{
        const value = localStorage.getItem(key);
        if(value === null) return null;
        return { key, value, shared:false };
      }catch(err){ return null; }
    },
    async set(key, value){
      try{
        localStorage.setItem(key, value);
        return { key, value, shared:false };
      }catch(err){ return null; }
    },
    async delete(key){
      try{
        localStorage.removeItem(key);
        return { key, deleted:true, shared:false };
      }catch(err){ return null; }
    }
  };

  // ===================== Cookie操作(ログイン状態の保存に使用) =====================
  function setCookie(name, value, days){
    const expires = new Date(Date.now() + days*24*60*60*1000).toUTCString();
    document.cookie = `${name}=${encodeURIComponent(value)}; expires=${expires}; path=/; SameSite=Lax`;
  }
  function getCookie(name){
    const match = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
    return match ? decodeURIComponent(match[1]) : null;
  }
  function deleteCookie(name){
    document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; SameSite=Lax`;
  }

  // ===================== ズーム無効化 =====================
  document.addEventListener('gesturestart', function(e) { e.preventDefault(); });
  document.addEventListener('gesturechange', function(e) { e.preventDefault(); });
  document.addEventListener('gestureend', function(e) { e.preventDefault(); });

  // ===================== ダブルタップズーム・ピンチズーム完全防止(iOS Safari対策) =====================
  let _lastTouchEndTime = 0;
  document.addEventListener('touchend', function(e){
    const now = Date.now();
    if(now - _lastTouchEndTime <= 350){
      e.preventDefault();
    }
    _lastTouchEndTime = now;
  }, { passive: false });

  document.addEventListener('touchstart', function(e){
    if(e.touches.length > 1) e.preventDefault();
  }, { passive: false });

  document.addEventListener('touchmove', function(e){
    if(e.touches.length > 1) e.preventDefault();
  }, { passive: false });

  document.addEventListener('dblclick', function(e){
    e.preventDefault();
  }, { passive: false });

// ===================== 戻るボタン =====================
  document.getElementById('backButton').addEventListener('click', function(e) {
    e.preventDefault();
    showTitleScreen();
  });

  // ===================== ゲーム本体 =====================
  let SIZE = 8;
  const COLORS = [
    {bg:'linear-gradient(135deg,#FF8B8B,#FF6B6B)'},
    {bg:'linear-gradient(135deg,#5FE3B3,#3DDC97)'},
    {bg:'linear-gradient(135deg,#6FB0FF,#4D96FF)'},
    {bg:'linear-gradient(135deg,#C9A8FF,#B18CFF)'},
    {bg:'linear-gradient(135deg,#FF95C9,#FF6FB5)'},
    {bg:'linear-gradient(135deg,#E1F065,#C6E62D)'},
    {bg:'linear-gradient(135deg,#FFE270,#FFD93D)'}
  ];

  const MODES = {
    soft:    { label:'柔らかい', emoji:'🍮' },
    baked:   { label:'焼成',     emoji:'🍪' },
    hard:    { label:'硬い',     emoji:'🍬' },
    extreme: { label:'激硬',     emoji:'🧊' }
  };
  let currentMode = 'baked';

  const MODE_COIN_MULT = { soft:0.5, baked:1.0, hard:1.5, extreme:3.0 };
  function sizeCoinMult(size){ return 8 / size; }
  function coinMultiplier(mode, size){
    const m = mode || currentMode, s = (m==='extreme') ? 8 : (size || SIZE);
    return MODE_COIN_MULT[m] * sizeCoinMult(s);
  }

// ===================== 🤖 テトリス AI難易度 =====================
  const AI_DIFFICULTIES = {
    easy: {
      label: '😊 簡単',
      desc: 'AIがミスを連発。のんびり遊べます。',
      speed: 320,        // ★1アクション(回転/移動/落下)あたりの間隔(ms)
      randomChance: 0.7,
      weightScale: 0.5,
      noise: 2.5,      // 評価値(おおむね-10〜+1)に対するゆらぎ。大きいほど判断がブレる
      think: 650,        // 新しいピースを見てから動き出すまでの「考える時間」(ms)
      slip: 0.2,         // 操作ミス(ずれて落とす/迷って戻る)の確率
      holdUse: 0,        // ホールドを使う確率
      hardDrop: 0.45     // 最後にハードドロップする確率(残りはソフトドロップで落とす)
    },
    normal: {
      label: '🙂 普通',
      desc: 'AIがたまにミスをします。',
      speed: 190,
      randomChance: 0.35,
      weightScale: 0.8,
      noise: 1.0,
      think: 420, slip: 0.09, holdUse: 0.15, hardDrop: 0.7
    },
    hard: {
      label: '😤 難しい',
      desc: 'AIはほぼミスをしません。',
      speed: 110,
      randomChance: 0.1,
      weightScale: 1.0,
      noise: 0.35,
      think: 260, slip: 0.035, holdUse: 0.6, hardDrop: 0.9
    },
    modern: {
      label: '🔥 現代最強',
      desc: '高速・完璧な判断。人間には厳しい。',
      speed: 60,
      randomChance: 0,
      weightScale: 1.0,
      noise: 0,
      think: 110, slip: 0.01, holdUse: 1, hardDrop: 1
    },
    history: {
      label: '👑 史上最強',
      desc: '1手先読みで最強。もう勝てません。',
      speed: 0,
      randomChance: 0,
      weightScale: 1.0,
      noise: 0,
      think: 40, slip: 0, holdUse: 1, hardDrop: 1,
      lookahead: true   // 1手先読みを有効化
    }
  };

  // テトリス関連のモード設定
  let tetrisSubMode = 'solo';    // 'solo' | 'vs' | 'sprint'(40ライン) | 'ultra'(2分)
  let aiDifficulty = 'normal';   // AI_DIFFICULTIES のキー
  let tetrisVsMode = false;      // 実行時フラグ: VS AIモードかどうか

  // ===================== スキン =====================
  // ===================== 背景画像(お好みの写真を背景に設定) =====================
  const STORAGE_BG_IMAGE = 'candyblast-bg-image-v1';
  let customBgDataUrl = null;

  function renderBgTab(){
    return `
      <div class="sub" style="margin-bottom:10px;">好きな写真を背景に設定できます。ブロックやパネルは前面にはっきり表示されるので、プレイに支障はありません。</div>
      <div style="width:100%; aspect-ratio:16/9; border-radius:14px; overflow:hidden; background:var(--panel);
        display:flex; align-items:center; justify-content:center; margin-bottom:12px; border:1px solid rgba(255,255,255,0.08);">
        ${customBgDataUrl
          ? `<img src="${customBgDataUrl}" style="width:100%; height:100%; object-fit:cover;">`
          : `<span class="sub">現在: デフォルト背景</span>`}
      </div>
      <input type="file" id="bgFileInput" accept="image/*" style="display:none;">
      <button class="primary-btn" id="bgPickBtn">🖼️ 画像を選択する</button>
      ${customBgDataUrl ? `<button class="ghost-btn" id="bgResetBtn">デフォルトに戻す</button>` : ''}
      <div class="sub" id="bgStatus" style="margin-top:8px;"></div>
    `;
  }

  function applyCustomBackground(dataUrl){
    if(dataUrl){
      document.body.style.backgroundImage =
        `linear-gradient(rgba(8,4,12,0.55), rgba(8,4,12,0.55)), url(${dataUrl})`;
      document.body.style.backgroundSize = 'cover';
      document.body.style.backgroundPosition = 'center';
      document.body.style.backgroundAttachment = 'fixed';
    } else {
      document.body.style.backgroundImage = '';
      document.body.style.backgroundSize = '';
      document.body.style.backgroundPosition = '';
      document.body.style.backgroundAttachment = '';
    }
  }

  function setCustomBackgroundFromFile(file){
    return new Promise((resolve, reject)=>{
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('read failed'));
      reader.onload = () => {
        const img = new Image();
        img.onerror = () => reject(new Error('image failed'));
        img.onload = () => {
          const maxW = 1000;
          const scale = Math.min(1, maxW / img.width);
          const canvas = document.createElement('canvas');
          canvas.width = Math.round(img.width * scale);
          canvas.height = Math.round(img.height * scale);
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          const dataUrl = canvas.toDataURL('image/jpeg', 0.72);
          customBgDataUrl = dataUrl;
          applyCustomBackground(dataUrl);
          appStorage.set(STORAGE_BG_IMAGE, dataUrl, false).then(()=>resolve()).catch(reject);
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  async function resetCustomBackground(){
    customBgDataUrl = null;
    applyCustomBackground(null);
    try{ await appStorage.delete(STORAGE_BG_IMAGE, false); }catch(err){}
  }

  async function loadCustomBackground(){
    try{
      const res = await appStorage.get(STORAGE_BG_IMAGE, false);
      if(res && res.value){
        customBgDataUrl = res.value;
        applyCustomBackground(customBgDataUrl);
      }
    }catch(err){}
  }

  const PATTERN_LAYERS = {
  stripe: 'repeating-linear-gradient(45deg, rgba(255,255,255,0.32) 0 3px, transparent 3px 9px)',
  dot: 'radial-gradient(circle at 3px 3px, rgba(255,255,255,0.55) 1.6px, transparent 1.8px) 0 0/9px 9px',
  grid: 'repeating-linear-gradient(0deg, rgba(255,255,255,0.26) 0 1.4px, transparent 1.4px 8px), repeating-linear-gradient(90deg, rgba(255,255,255,0.26) 0 1.4px, transparent 1.4px 8px)',
  wave: 'repeating-linear-gradient(-45deg, rgba(255,255,255,0.28) 0 2px, transparent 2px 10px)',
  zigzag: 'repeating-linear-gradient(45deg, rgba(255,255,255,0.3) 0 3px, transparent 3px 6px), repeating-linear-gradient(-45deg, rgba(255,255,255,0.3) 0 3px, transparent 3px 6px)',
  diamond: 'repeating-linear-gradient(60deg, rgba(255,255,255,0.24) 0 2px, transparent 2px 9px), repeating-linear-gradient(-60deg, rgba(255,255,255,0.24) 0 2px, transparent 2px 9px)',

  // ===== 🌟 新柄パターン =====
  // チェッカー: conic-gradientの4象限で市松模様
  checker: 'conic-gradient(rgba(255,255,255,0.32) 90deg, transparent 90deg 180deg, rgba(255,255,255,0.32) 180deg 270deg, transparent 270deg) 0 0/12px 12px',
  // キラキラ: 大小2つの点を互い違いに配置
  sparkle: 'radial-gradient(circle at 50% 50%, rgba(255,255,255,0.95) 0.9px, transparent 1.6px) 0 0/14px 14px, radial-gradient(circle at 50% 50%, rgba(255,255,255,0.55) 0.6px, transparent 1.3px) 7px 7px/14px 14px',
  // 迷彩: 不規則な楕円ブロブを4つ重ねる
  camo: 'radial-gradient(ellipse 7px 5px at 20% 30%, rgba(255,255,255,0.22) 50%, transparent 51%), radial-gradient(ellipse 5px 4px at 70% 65%, rgba(0,0,0,0.18) 50%, transparent 51%), radial-gradient(ellipse 4px 5px at 40% 80%, rgba(255,255,255,0.16) 50%, transparent 51%), radial-gradient(ellipse 5px 3px at 85% 20%, rgba(0,0,0,0.14) 50%, transparent 51%)',
  // 大理石: 斜めの走査線を多重化
  marble: 'repeating-linear-gradient(115deg, rgba(255,255,255,0.24) 0 1px, transparent 1px 4px, rgba(0,0,0,0.12) 4px 5px, transparent 5px 11px)',
  // 雨: 角度の違う細い縦線を2層重ねる
  rain: 'repeating-linear-gradient(95deg, rgba(255,255,255,0.38) 0 1px, transparent 1px 7px), repeating-linear-gradient(85deg, rgba(255,255,255,0.2) 0 1px, transparent 1px 11px)',
  // レンガ: 縦横の目地を入れる
  brick: 'repeating-linear-gradient(0deg, rgba(0,0,0,0.24) 0 1px, transparent 1px 8px), repeating-linear-gradient(90deg, rgba(0,0,0,0.24) 0 1px, transparent 1px 14px)',
  // 泡: 大小の円を3つ散らす
  bubble: 'radial-gradient(circle at 25% 30%, rgba(255,255,255,0.55) 1.2px, transparent 2.2px), radial-gradient(circle at 75% 70%, rgba(255,255,255,0.4) 1px, transparent 2px), radial-gradient(circle at 55% 15%, rgba(255,255,255,0.3) 0.8px, transparent 1.8px)',
  // タータン: 縦横の太線+斜めの細線でチェック柄
  tartan: 'repeating-linear-gradient(0deg, rgba(255,255,255,0.22) 0 3px, transparent 3px 12px), repeating-linear-gradient(90deg, rgba(255,255,255,0.22) 0 3px, transparent 3px 12px), repeating-linear-gradient(45deg, rgba(0,0,0,0.12) 0 1px, transparent 1px 6px)',
  // ハーフトーン: 網点印刷風のドット
  halftone: 'radial-gradient(circle at 50% 50%, rgba(255,255,255,0.42) 1.6px, transparent 2.1px) 0 0/8px 8px',
  // ハニカム: 60度ずつの円錐グラデーションで蜂の巣風
  honeycomb: 'conic-gradient(from 30deg, transparent 0 60deg, rgba(255,255,255,0.26) 60deg 120deg, transparent 120deg 180deg, rgba(255,255,255,0.26) 180deg 240deg, transparent 240deg 300deg, rgba(255,255,255,0.26) 300deg 360deg) 0 0/10px 8px',
  // 竹: 節のような横線+細い縦線
  bamboo: 'repeating-linear-gradient(0deg, rgba(0,0,0,0.22) 0 1px, transparent 1px 14px), repeating-linear-gradient(90deg, rgba(255,255,255,0.2) 0 2px, transparent 2px 16px)',
  // 鱗: 45度の斜め線+横線で魚の鱗風
  scale: 'repeating-linear-gradient(90deg, transparent 0 4px, rgba(255,255,255,0.2) 4px 6px, transparent 6px 12px), repeating-linear-gradient(45deg, rgba(255,255,255,0.25) 0 1px, transparent 1px 8px)',
  // 十字: プラス記号を敷き詰める
  cross: 'linear-gradient(rgba(255,255,255,0.35), rgba(255,255,255,0.35)) 50% 50%/2px 10px no-repeat, linear-gradient(rgba(255,255,255,0.35), rgba(255,255,255,0.35)) 50% 50%/10px 2px no-repeat, radial-gradient(circle at 50% 50%, transparent 4px, transparent 5px) 0 0/12px 12px'
};
const PATTERN_LABELS = {
  stripe:'ストライプ', dot:'ドット', grid:'グリッド', wave:'ウェーブ', zigzag:'ジグザグ', diamond:'ダイヤ柄',
  checker:'チェッカー', sparkle:'キラキラ', camo:'迷彩', marble:'大理石', rain:'雨', brick:'レンガ',
  bubble:'泡', tartan:'タータン', halftone:'ハーフトーン', honeycomb:'ハニカム', bamboo:'竹',
  scale:'鱗', cross:'十字'
};

  const SKINS = [
    { id:'default', name:'ミッドナイトキャンディ', price:0, desc:'定番のパープル×ゴールドの夜空テーマ。',
      vars:{ '--bg-deep':'#1a1233','--bg-deep2':'#241a45','--panel':'#2c2054','--panel-light':'#382a68',
        '--gold':'#FFD93D','--coral':'#FF6B6B','--mint':'#3DDC97','--blue':'#4D96FF','--purple':'#B18CFF',
        '--pink':'#FF6FB5','--lime':'#C6E62D','--text':'#F5F3FF','--text-dim':'#B7ADDA' },
      titleGrad:'linear-gradient(90deg, #FFD93D, #FF6FB5)',
      colors:[
        {bg:'linear-gradient(135deg,#FF8B8B,#FF6B6B)'},{bg:'linear-gradient(135deg,#5FE3B3,#3DDC97)'},
        {bg:'linear-gradient(135deg,#6FB0FF,#4D96FF)'},{bg:'linear-gradient(135deg,#C9A8FF,#B18CFF)'},
        {bg:'linear-gradient(135deg,#FF95C9,#FF6FB5)'},{bg:'linear-gradient(135deg,#E1F065,#C6E62D)'},
        {bg:'linear-gradient(135deg,#FFE270,#FFD93D)'}
      ] },
    { id:'sunset', name:'サンセットソーダ', price:800, desc:'夕焼けとクリームソーダの暖色パレット。',
      vars:{ '--bg-deep':'#2b1024','--bg-deep2':'#4a1730','--panel':'#5c2038','--panel-light':'#742a44',
        '--gold':'#FFB74D','--coral':'#FF6B4A','--mint':'#FFD97D','--blue':'#FF8F6B','--purple':'#FF9AA8',
        '--pink':'#FF5E8E','--lime':'#FFDD6B','--text':'#FFF3E8','--text-dim':'#E3AFAF' },
      titleGrad:'linear-gradient(90deg,#FFB74D,#FF5E8E)',
      colors:[
        {bg:'linear-gradient(135deg,#FFB199,#FF7B54)'},{bg:'linear-gradient(135deg,#FFD97D,#FFB74D)'},
        {bg:'linear-gradient(135deg,#FF9AA8,#FF5E8E)'},{bg:'linear-gradient(135deg,#FFCF6B,#FF9A3C)'},
        {bg:'linear-gradient(135deg,#FF8AAE,#E8497A)'},{bg:'linear-gradient(135deg,#FFE29A,#FFC15E)'},
        {bg:'linear-gradient(135deg,#FF7E67,#E8503A)'}
      ] },
    { id:'ocean', name:'ディープオーシャン', price:1000, desc:'深海の静けさをまとったブルー×ティール。',
      vars:{ '--bg-deep':'#07161f','--bg-deep2':'#0c2733','--panel':'#123444','--panel-light':'#1a4557',
        '--gold':'#4DE0E0','--coral':'#FF8A65','--mint':'#3DDCC0','--blue':'#4DA6FF','--purple':'#6FA8DC',
        '--pink':'#5FC9E8','--lime':'#7FE0C6','--text':'#EAFBFF','--text-dim':'#8FC4D6' },
      titleGrad:'linear-gradient(90deg,#4DE0E0,#4DA6FF)',
      colors:[
        {bg:'linear-gradient(135deg,#6FE3D8,#3DDCC0)'},{bg:'linear-gradient(135deg,#6FB0FF,#3E7EDB)'},
        {bg:'linear-gradient(135deg,#7FE0C6,#39B893)'},{bg:'linear-gradient(135deg,#8FD3FF,#4DA6FF)'},
        {bg:'linear-gradient(135deg,#5FC9E8,#2E9BC2)'},{bg:'linear-gradient(135deg,#4DE0E0,#20B2B2)'},
        {bg:'linear-gradient(135deg,#A0F0E6,#5FD6C4)'}
      ] },
    { id:'neon', name:'ネオンナイト', price:1400, desc:'漆黒に浮かぶ蛍光カラーのサイバーテーマ。',
      vars:{ '--bg-deep':'#08060f','--bg-deep2':'#120a24','--panel':'#1c1030','--panel-light':'#28163f',
        '--gold':'#F5FF3D','--coral':'#FF3DBB','--mint':'#3DFFD5','--blue':'#3DAFFF','--purple':'#B93DFF',
        '--pink':'#FF3DBB','--lime':'#C6FF3D','--text':'#F2F0FF','--text-dim':'#9C8FCC' },
      titleGrad:'linear-gradient(90deg,#F5FF3D,#FF3DBB)',
      colors:[
        {bg:'linear-gradient(135deg,#FF6DD9,#FF3DBB)'},{bg:'linear-gradient(135deg,#5DFFE0,#3DFFD5)'},
        {bg:'linear-gradient(135deg,#6DC3FF,#3DAFFF)'},{bg:'linear-gradient(135deg,#CE7DFF,#B93DFF)'},
        {bg:'linear-gradient(135deg,#FF7DCF,#FF3DBB)'},{bg:'linear-gradient(135deg,#E0FF6D,#C6FF3D)'},
        {bg:'linear-gradient(135deg,#FBFF6D,#F5FF3D)'}
      ] },
    { id:'sakura', name:'さくらパステル', price:1200, desc:'春の花びらのようなやわらかいピンク×白。',
      vars:{ '--bg-deep':'#2a1a22','--bg-deep2':'#3d2530','--panel':'#4a2c3a','--panel-light':'#5c3849',
        '--gold':'#FFC1CC','--coral':'#FF9EB5','--mint':'#C8F0DD','--blue':'#B8D8F0','--purple':'#D9C1EA',
        '--pink':'#FFB3D1','--lime':'#E8F0B8','--text':'#FFF6F8','--text-dim':'#D9AFC0' },
      titleGrad:'linear-gradient(90deg,#FFC1CC,#D9C1EA)',
      colors:[
        {bg:'linear-gradient(135deg,#FFD1DC,#FF9EB5)'},{bg:'linear-gradient(135deg,#D6F5E3,#C8F0DD)'},
        {bg:'linear-gradient(135deg,#D2E7FA,#B8D8F0)'},{bg:'linear-gradient(135deg,#E9D8F5,#D9C1EA)'},
        {bg:'linear-gradient(135deg,#FFC7E0,#FFB3D1)'},{bg:'linear-gradient(135deg,#F1F5C6,#E8F0B8)'},
        {bg:'linear-gradient(135deg,#FFE3EA,#FFC1CC)'}
      ] },
    { id:'goldlux', name:'ゴールドラグジュアリー', price:2500, desc:'漆黒とゴールドの高級ジュエリーテーマ。',
      vars:{ '--bg-deep':'#0a0a0a','--bg-deep2':'#161412','--panel':'#211c16','--panel-light':'#332b1f',
        '--gold':'#F5D57A','--coral':'#E8A33D','--mint':'#D4B26A','--blue':'#C9A24A','--purple':'#B8934A',
        '--pink':'#F0C97A','--lime':'#E0C05A','--text':'#FBF3E0','--text-dim':'#B8A582' },
      titleGrad:'linear-gradient(90deg,#F5D57A,#E8A33D)',
      colors:[
        {bg:'linear-gradient(135deg,#F5D57A,#D4A94A)'},{bg:'linear-gradient(135deg,#F0C060,#D89B2E)'},
        {bg:'linear-gradient(135deg,#E8B84A,#C79430)'},{bg:'linear-gradient(135deg,#F5E0A0,#E0BA5A)'},
        {bg:'linear-gradient(135deg,#D9A94E,#B8873A)'},{bg:'linear-gradient(135deg,#F0D890,#DDB758)'},
        {bg:'linear-gradient(135deg,#EFCB74,#C99A3E)'}
      ] },
    { id:'emerald', name:'エメラルドヴェール', price:1600, desc:'深緑のジャングルに宿る宝石の輝き。',
      vars:{ '--bg-deep':'#04140f','--bg-deep2':'#082018','--panel':'#0e3226','--panel-light':'#154436',
        '--gold':'#3DFFA8','--coral':'#5CFF7A','--mint':'#3DDCA0','--blue':'#4DFFC8','--purple':'#7DFFB0',
        '--pink':'#8CFFD1','--lime':'#B6FF6B','--text':'#E9FFF5','--text-dim':'#8FC7AE' },
      titleGrad:'linear-gradient(90deg,#3DFFA8,#B6FF6B)',
      colors:[
        {bg:'linear-gradient(135deg,#5CFFB0,#20D18A)'},{bg:'linear-gradient(135deg,#8CFFD1,#3DDCA0)'},
        {bg:'linear-gradient(135deg,#4DFFC8,#20B58F)'},{bg:'linear-gradient(135deg,#B6FF6B,#7CD936)'},
        {bg:'linear-gradient(135deg,#7DFFB0,#2FBE7C)'},{bg:'linear-gradient(135deg,#D0FFA0,#9EE85A)'},
        {bg:'linear-gradient(135deg,#3DFFA8,#0FAE72)'}
      ] },
    { id:'galaxy', name:'ギャラクシードリーム', price:1800, desc:'渦巻く銀河と星屑をまとった幻想パレット。',
      vars:{ '--bg-deep':'#05041a','--bg-deep2':'#0c0930','--panel':'#150f45','--panel-light':'#1e1660',
        '--gold':'#C8A2FF','--coral':'#FF6EC7','--mint':'#7FE7FF','--blue':'#6E8CFF','--purple':'#B36EFF',
        '--pink':'#FF6EC7','--lime':'#9E7FFF','--text':'#F1ECFF','--text-dim':'#9C8FD6' },
      titleGrad:'linear-gradient(90deg,#C8A2FF,#FF6EC7)',
      colors:[
        {bg:'linear-gradient(135deg,#FF9EE0,#FF6EC7)'},{bg:'linear-gradient(135deg,#9EE7FF,#7FE7FF)'},
        {bg:'linear-gradient(135deg,#9EB0FF,#6E8CFF)'},{bg:'linear-gradient(135deg,#DDB0FF,#B36EFF)'},
        {bg:'linear-gradient(135deg,#FF9EE0,#E86EDB)'},{bg:'linear-gradient(135deg,#C6B0FF,#9E7FFF)'},
        {bg:'linear-gradient(135deg,#E8CFFF,#C8A2FF)'}
      ] },
    { id:'volcano', name:'ヴォルケーノブレイズ', price:1300, desc:'噴火するマグマの熱と灰の黒を纏う。',
      vars:{ '--bg-deep':'#140503','--bg-deep2':'#240906','--panel':'#3a0f08','--panel-light':'#54160c',
        '--gold':'#FFB627','--coral':'#FF4500','--mint':'#FF7A3D','--blue':'#FF9040','--purple':'#FF5E2E',
        '--pink':'#FF7A3D','--lime':'#FFD23D','--text':'#FFF1E0','--text-dim':'#D69880' },
      titleGrad:'linear-gradient(90deg,#FFB627,#FF4500)',
      colors:[
        {bg:'linear-gradient(135deg,#FF7A3D,#FF4500)'},{bg:'linear-gradient(135deg,#FFD23D,#FFB627)'},
        {bg:'linear-gradient(135deg,#FF9040,#E8380A)'},{bg:'linear-gradient(135deg,#FF5E2E,#C22E0C)'},
        {bg:'linear-gradient(135deg,#FFC15E,#FF8A1E)'},{bg:'linear-gradient(135deg,#FF3D3D,#B31C1C)'},
        {bg:'linear-gradient(135deg,#FFA23D,#E86A0A)'}
      ] },
    { id:'frost', name:'アークティックフロスト', price:1500, desc:'極寒のオーロラと氷結晶の透明感。',
      vars:{ '--bg-deep':'#031420','--bg-deep2':'#062331','--panel':'#0b3548','--panel-light':'#124861',
        '--gold':'#B7F5FF','--coral':'#7DE8FF','--mint':'#9CFFF0','--blue':'#5AC8FF','--purple':'#A0E0FF',
        '--pink':'#C9F5FF','--lime':'#B6FFEA','--text':'#EEFCFF','--text-dim':'#88C0D6' },
      titleGrad:'linear-gradient(90deg,#B7F5FF,#5AC8FF)',
      colors:[
        {bg:'linear-gradient(135deg,#D6FBFF,#9CFFF0)'},{bg:'linear-gradient(135deg,#9CE0FF,#5AC8FF)'},
        {bg:'linear-gradient(135deg,#B6FFEA,#6FE8C8)'},{bg:'linear-gradient(135deg,#C9E8FF,#7DA8FF)'},
        {bg:'linear-gradient(135deg,#A0E0FF,#4FA9E8)'},{bg:'linear-gradient(135deg,#E0FBFF,#B7F5FF)'},
        {bg:'linear-gradient(135deg,#7DE8FF,#33B8DB)'}
      ] },
    { id:'royal', name:'ロイヤルアメジスト', price:2200, desc:'王家の紫水晶と銀細工の格式高いテーマ。',
      vars:{ '--bg-deep':'#100519','--bg-deep2':'#1c0a2c','--panel':'#2b1042','--panel-light':'#3c1858',
        '--gold':'#D8B4FE','--coral':'#E879F9','--mint':'#C4B5FD','--blue':'#A78BFA','--purple':'#9333EA',
        '--pink':'#E879F9','--lime':'#C4B5FD','--text':'#F5EEFF','--text-dim':'#B79CDB' },
      titleGrad:'linear-gradient(90deg,#D8B4FE,#E879F9)',
      colors:[
        {bg:'linear-gradient(135deg,#E4C8FF,#C084FC)'},{bg:'linear-gradient(135deg,#F0ABFC,#E879F9)'},
        {bg:'linear-gradient(135deg,#C4B5FD,#A78BFA)'},{bg:'linear-gradient(135deg,#D9C4FF,#9333EA)'},
        {bg:'linear-gradient(135deg,#EAD0FF,#B366F0)'},{bg:'linear-gradient(135deg,#F5D9FF,#D8B4FE)'},
        {bg:'linear-gradient(135deg,#BFA0F5,#8B4FE0)'}
      ] },
    { id:'candyland', name:'キャンディランド祭典', price:1000, desc:'遊園地の光と綿菓子のようなにぎやかなポップ配色。',
      vars:{ '--bg-deep':'#1a0e2e','--bg-deep2':'#2a1642','--panel':'#391d57','--panel-light':'#4a2670',
        '--gold':'#FFE156','--coral':'#FF5E7C','--mint':'#5CFFCB','--blue':'#5CB8FF','--purple':'#C25CFF',
        '--pink':'#FF5CC8','--lime':'#CBFF5C','--text':'#FFFAF0','--text-dim':'#C9A8E0' },
      titleGrad:'linear-gradient(90deg,#FFE156,#FF5CC8)',
      colors:[
        {bg:'linear-gradient(135deg,#FF8FA3,#FF5E7C)'},{bg:'linear-gradient(135deg,#7CFFDD,#5CFFCB)'},
        {bg:'linear-gradient(135deg,#8FCDFF,#5CB8FF)'},{bg:'linear-gradient(135deg,#DA8FFF,#C25CFF)'},
        {bg:'linear-gradient(135deg,#FF8FE0,#FF5CC8)'},{bg:'linear-gradient(135deg,#E3FF8F,#CBFF5C)'},
        {bg:'linear-gradient(135deg,#FFEC8F,#FFE156)'}
      ] },
    { id:'obsidian', name:'オブシディアンヴェノム', price:2000, desc:'黒曜石の闇に猛毒の緑が走る、上級者向けダークテーマ。',
      vars:{ '--bg-deep':'#020202','--bg-deep2':'#0a0a0a','--panel':'#131313','--panel-light':'#1e1e1e',
        '--gold':'#39FF14','--coral':'#FF073A','--mint':'#39FF14','--blue':'#00FFFF','--purple':'#8B00FF',
        '--pink':'#FF073A','--lime':'#CCFF00','--text':'#F0FFF0','--text-dim':'#6E8C6E' },
      titleGrad:'linear-gradient(90deg,#39FF14,#00FFFF)',
      colors:[
        {bg:'linear-gradient(135deg,#39FF14,#1EA80D)'},{bg:'linear-gradient(135deg,#CCFF00,#8FB800)'},
        {bg:'linear-gradient(135deg,#00FFFF,#00A8A8)'},{bg:'linear-gradient(135deg,#8B00FF,#5A00A8)'},
        {bg:'linear-gradient(135deg,#FF073A,#A80426)'},{bg:'linear-gradient(135deg,#39FF88,#0DB859)'},
        {bg:'linear-gradient(135deg,#CFFF39,#94D40D)'}
      ] },
    { id:'sakuraroyale', name:'桜皇家ゴールド', price:3000, desc:'金箔と桜吹雪をあしらった、極めて豪華な限定テーマ。',
      vars:{ '--bg-deep':'#170a10','--bg-deep2':'#26111a','--panel':'#391a27','--panel-light':'#4d2434',
        '--gold':'#FFD700','--coral':'#FF7FA6','--mint':'#FFE9B0','--blue':'#FFC94D','--purple':'#E0A9C4',
        '--pink':'#FF9EC4','--lime':'#FFE066','--text':'#FFF6E9','--text-dim':'#D9AFC0' },
      titleGrad:'linear-gradient(90deg,#FFD700,#FF9EC4)',
      colors:[
        {bg:'linear-gradient(135deg,#FFE066,#FFD700)'},{bg:'linear-gradient(135deg,#FFC0DA,#FF9EC4)'},
        {bg:'linear-gradient(135deg,#FFE9B0,#FFC94D)'},{bg:'linear-gradient(135deg,#FFB8D6,#FF7FA6)'},
        {bg:'linear-gradient(135deg,#F5D6E4,#E0A9C4)'},{bg:'linear-gradient(135deg,#FFF0C6,#FFDD8A)'},
        {bg:'linear-gradient(135deg,#FFD9E8,#FFB0CE)'}
      ] },
    { id:'mintchoco', name:'ミントチョコレート', price:900, desc:'ミントの爽やかさとビターチョコの甘さの組み合わせ。',
      vars:{ '--bg-deep':'#1a120a','--bg-deep2':'#241a10','--panel':'#332415','--panel-light':'#453120',
        '--gold':'#C68642','--coral':'#A6673A','--mint':'#5FDDA8','--blue':'#7FC9A0','--purple':'#8B5A2B',
        '--pink':'#D9A679','--lime':'#8FE0B0','--text':'#FFF6EC','--text-dim':'#C9A88A' },
      titleGrad:'linear-gradient(90deg,#5FDDA8,#C68642)',
      colors:[
        {bg:'linear-gradient(135deg,#7FE8BC,#5FDDA8)'},{bg:'linear-gradient(135deg,#D9A679,#C68642)'},
        {bg:'linear-gradient(135deg,#8FE0B0,#4FC090)'},{bg:'linear-gradient(135deg,#B8845A,#8B5A2B)'},
        {bg:'linear-gradient(135deg,#9FE8C6,#6FCCA0)'},{bg:'linear-gradient(135deg,#E0B98A,#A6673A)'},
        {bg:'linear-gradient(135deg,#6FDDB0,#3FAE82)'}
      ] },
    { id:'lavender', name:'ラベンダーミルク', price:1100, desc:'ラベンダー畑とミルクのようなやさしい紫パステル。',
      vars:{ '--bg-deep':'#1c1526','--bg-deep2':'#2a1f3b','--panel':'#372a4d','--panel-light':'#473763',
        '--gold':'#D4B8FF','--coral':'#FFB8E0','--mint':'#C6D4FF','--blue':'#B0A8FF','--purple':'#9D7FE8',
        '--pink':'#E8B8FF','--lime':'#D0C6FF','--text':'#F5F0FF','--text-dim':'#B8A8D6' },
      titleGrad:'linear-gradient(90deg,#D4B8FF,#FFB8E0)',
      colors:[
        {bg:'linear-gradient(135deg,#E4D0FF,#D4B8FF)'},{bg:'linear-gradient(135deg,#FFD0EC,#FFB8E0)'},
        {bg:'linear-gradient(135deg,#D8E0FF,#C6D4FF)'},{bg:'linear-gradient(135deg,#C6BEFF,#B0A8FF)'},
        {bg:'linear-gradient(135deg,#B79DF0,#9D7FE8)'},{bg:'linear-gradient(135deg,#F0CCFF,#E8B8FF)'},
        {bg:'linear-gradient(135deg,#E0D8FF,#D0C6FF)'}
      ] },
    { id:'cherry', name:'チェリーソーダ', price:1300, desc:'ルビーのように濃いチェリーレッドの大人な一皿。',
      vars:{ '--bg-deep':'#1a0508','--bg-deep2':'#2c0810','--panel':'#3f0d18','--panel-light':'#571322',
        '--gold':'#FF4D6D','--coral':'#E8102E','--mint':'#FF7A94','--blue':'#FF3355','--purple':'#C4102C',
        '--pink':'#FF6B85','--lime':'#FF9EAE','--text':'#FFF0F2','--text-dim':'#D68A96' },
      titleGrad:'linear-gradient(90deg,#FF4D6D,#E8102E)',
      colors:[
        {bg:'linear-gradient(135deg,#FF7A94,#FF4D6D)'},{bg:'linear-gradient(135deg,#FF5070,#E8102E)'},
        {bg:'linear-gradient(135deg,#FF9EAE,#FF6B85)'},{bg:'linear-gradient(135deg,#FF4560,#C4102C)'},
        {bg:'linear-gradient(135deg,#FF849A,#F02E48)'},{bg:'linear-gradient(135deg,#FFB0BE,#FF7A94)'},
        {bg:'linear-gradient(135deg,#F03350,#A80D22)'}
      ] },
    { id:'citrus', name:'シトラスポップ', price:950, desc:'オレンジとレモンがはじけるビタミンカラー全開。',
      vars:{ '--bg-deep':'#1f1503','--bg-deep2':'#2e2005','--panel':'#412d08','--panel-light':'#553c0c',
        '--gold':'#FFC800','--coral':'#FF8C00','--mint':'#FFE066','--blue':'#FFA800','--purple':'#FFB627',
        '--pink':'#FFD23D','--lime':'#D4FF00','--text':'#FFFAE8','--text-dim':'#D6C088' },
      titleGrad:'linear-gradient(90deg,#FFC800,#FF8C00)',
      colors:[
        {bg:'linear-gradient(135deg,#FFDA4D,#FFC800)'},{bg:'linear-gradient(135deg,#FFAA4D,#FF8C00)'},
        {bg:'linear-gradient(135deg,#FFEB8A,#FFE066)'},{bg:'linear-gradient(135deg,#FFC15E,#FFA800)'},
        {bg:'linear-gradient(135deg,#FFCB5E,#FFB627)'},{bg:'linear-gradient(135deg,#FFE070,#FFD23D)'},
        {bg:'linear-gradient(135deg,#E8FF5E,#D4FF00)'}
      ] },
    { id:'monochrome', name:'モノクロームスタイル', price:1700, desc:'白と黒だけで魅せる、洗練されたミニマルテーマ。',
      vars:{ '--bg-deep':'#0a0a0a','--bg-deep2':'#161616','--panel':'#232323','--panel-light':'#333333',
        '--gold':'#E8E8E8','--coral':'#B0B0B0','--mint':'#D0D0D0','--blue':'#909090','--purple':'#C0C0C0',
        '--pink':'#A8A8A8','--lime':'#F0F0F0','--text':'#FFFFFF','--text-dim':'#999999' },
      titleGrad:'linear-gradient(90deg,#F0F0F0,#909090)',
      colors:[
        {bg:'linear-gradient(135deg,#F5F5F5,#D8D8D8)'},{bg:'linear-gradient(135deg,#C0C0C0,#9A9A9A)'},
        {bg:'linear-gradient(135deg,#D8D8D8,#B0B0B0)'},{bg:'linear-gradient(135deg,#A8A8A8,#787878)'},
        {bg:'linear-gradient(135deg,#CACACA,#A0A0A0)'},{bg:'linear-gradient(135deg,#E8E8E8,#C8C8C8)'},
        {bg:'linear-gradient(135deg,#909090,#606060)'}
      ] },
    { id:'aurora', name:'オーロラヴェール', price:2000, desc:'極北の夜空に揺らめくオーロラの神秘的な光。',
      vars:{ '--bg-deep':'#020f14','--bg-deep2':'#051e26','--panel':'#0a2e38','--panel-light':'#0f404d',
        '--gold':'#7FFFD4','--coral':'#FF7FE0','--mint':'#5CFFB8','--blue':'#5CC8FF','--purple':'#8A7FFF',
        '--pink':'#B87FFF','--lime':'#B0FF5C','--text':'#EAFFFC','--text-dim':'#7FC2C4' },
      titleGrad:'linear-gradient(90deg,#7FFFD4,#B87FFF)',
      colors:[
        {bg:'linear-gradient(135deg,#9EFFE0,#5CFFB8)'},{bg:'linear-gradient(135deg,#FFA8EC,#FF7FE0)'},
        {bg:'linear-gradient(135deg,#8ADCFF,#5CC8FF)'},{bg:'linear-gradient(135deg,#ADA3FF,#8A7FFF)'},
        {bg:'linear-gradient(135deg,#D0A8FF,#B87FFF)'},{bg:'linear-gradient(135deg,#CBFF8A,#B0FF5C)'},
        {bg:'linear-gradient(135deg,#A0FFE8,#7FFFD4)'}
      ] }
  ];

  // ===================== 🎰 ガチャ限定スキン(購入不可、ガチャでのみ入手可能。最も作り込んだスキン) =====================
  const GACHA_SKINS = [
    { id:'gacha_cosmicdragon', name:'🐉 コズミックドラゴン', price:0, gacha:true, gachaEffect:true,
      desc:'銀河の彼方より舞い降りし竜の鱗。虹色の輝きが盤面全体を包み込む、ガチャ限定の至宝。',
      vars:{ '--bg-deep':'#050318','--bg-deep2':'#0d0630','--panel':'#160b45','--panel-light':'#241259',
        '--gold':'#FFD700','--coral':'#FF3DBE','--mint':'#3DFFD0','--blue':'#3D8BFF','--purple':'#8A3DFF',
        '--pink':'#FF3DBE','--lime':'#B0FF3D','--text':'#F5F0FF','--text-dim':'#A995D9' },
      titleGrad:'linear-gradient(90deg,#FFD700,#FF3DBE,#3D8BFF)',
      colors:[
        {bg:'linear-gradient(135deg,#FFD700 0%,#FF9D3D 35%,#FF3DBE 70%,#8A3DFF 100%)'},
        {bg:'linear-gradient(135deg,#3DFFD0 0%,#3D8BFF 50%,#8A3DFF 100%)'},
        {bg:'linear-gradient(135deg,#FF3DBE 0%,#B03DFF 50%,#3D8BFF 100%)'},
        {bg:'linear-gradient(135deg,#3D8BFF 0%,#3DFFD0 50%,#B0FF3D 100%)'},
        {bg:'linear-gradient(135deg,#FFD700 0%,#FF3DBE 50%,#8A3DFF 100%)'},
        {bg:'linear-gradient(135deg,#B0FF3D 0%,#3DFFD0 50%,#3D8BFF 100%)'},
        {bg:'linear-gradient(135deg,#8A3DFF 0%,#FF3DBE 50%,#FFD700 100%)'}
      ] },
    { id:'gacha_celestialphoenix', name:'🔥 セレスティアルフェニックス', price:0, gacha:true, gachaEffect:true,
      desc:'天空を焦がして舞い上がる不死鳥の炎。触れれば燃え尽きるほどの熱を秘めた、ガチャ限定の伝説。',
      vars:{ '--bg-deep':'#1a0500','--bg-deep2':'#2e0a00','--panel':'#451400','--panel-light':'#5c1e00',
        '--gold':'#FFEC3D','--coral':'#FF4500','--mint':'#FFB03D','--blue':'#FF7A3D','--purple':'#FF2D55',
        '--pink':'#FF6B3D','--lime':'#FFD93D','--text':'#FFF6E9','--text-dim':'#D9A87F' },
      titleGrad:'linear-gradient(90deg,#FFEC3D,#FF4500,#FF2D55)',
      colors:[
        {bg:'linear-gradient(135deg,#FFEC3D 0%,#FFB03D 40%,#FF4500 80%,#FF2D55 100%)'},
        {bg:'linear-gradient(135deg,#FFD93D 0%,#FF7A3D 50%,#FF4500 100%)'},
        {bg:'linear-gradient(135deg,#FF4500 0%,#FF2D55 50%,#B0003D 100%)'},
        {bg:'linear-gradient(135deg,#FFEC3D 0%,#FF6B3D 50%,#FF2D55 100%)'},
        {bg:'linear-gradient(135deg,#FFB03D 0%,#FF4500 50%,#FF2D55 100%)'},
        {bg:'linear-gradient(135deg,#FFF6D0 0%,#FFEC3D 40%,#FF7A3D 100%)'},
        {bg:'linear-gradient(135deg,#FF2D55 0%,#FF4500 50%,#FFB03D 100%)'}
      ] },
    { id:'gacha_voidempress', name:'👑 ヴォイドエンプレス', price:0, gacha:true, gachaEffect:true,
      desc:'虚無を統べる女帝の威光。漆黒と紫銀の輝きが交差する、静謐にして絶対的な支配の証。',
      vars:{ '--bg-deep':'#020005','--bg-deep2':'#0a0512','--panel':'#150a26','--panel-light':'#221238',
        '--gold':'#E8D9FF','--coral':'#D63DFF','--mint':'#C9C9FF','--blue':'#7D3DFF','--purple':'#B03DFF',
        '--pink':'#FF3DDB','--lime':'#C9A8FF','--text':'#F5F0FF','--text-dim':'#9080B8' },
      titleGrad:'linear-gradient(90deg,#E8D9FF,#B03DFF,#D63DFF)',
      colors:[
        {bg:'linear-gradient(135deg,#E8D9FF 0%,#C9A8FF 40%,#B03DFF 80%,#3D0A5C 100%)'},
        {bg:'linear-gradient(135deg,#7D3DFF 0%,#3D0A5C 50%,#0A0018 100%)'},
        {bg:'linear-gradient(135deg,#D63DFF 0%,#B03DFF 50%,#5C0A8A 100%)'},
        {bg:'linear-gradient(135deg,#C9C9FF 0%,#7D3DFF 50%,#2E0050 100%)'},
        {bg:'linear-gradient(135deg,#FF3DDB 0%,#B03DFF 50%,#3D0A5C 100%)'},
        {bg:'linear-gradient(135deg,#E8D9FF 0%,#D63DFF 50%,#5C0A8A 100%)'},
        {bg:'linear-gradient(135deg,#3D0A5C 0%,#7D3DFF 50%,#E8D9FF 100%)'}
      ] },

{ id:'gacha_abyssleviathan', name:'🌊 アビス・リヴァイアサン', price:0, gacha:true, gachaEffect:true,
      desc:'深淵の底より姿を現す海の覇王。その身に宿す大海の力は、見る者の魂を呑み込む。',
      vars:{ '--bg-deep':'#020a14','--bg-deep2':'#041426','--panel':'#062240','--panel-light':'#09305c',
        '--gold':'#5CFFE0','--coral':'#00D4FF','--mint':'#3DFFE0','--blue':'#0099FF','--purple':'#5C6EFF',
        '--pink':'#3DDFFF','--lime':'#7FFFE0','--text':'#E0FBFF','--text-dim':'#7FA8C9' },
      titleGrad:'linear-gradient(90deg,#5CFFE0,#0099FF,#5C6EFF)',
      colors:[
        {bg:'linear-gradient(135deg,#00D4FF 0%,#0099FF 40%,#062240 100%)'},
        {bg:'linear-gradient(135deg,#5CFFE0 0%,#00D4FF 50%,#0099FF 100%)'},
        {bg:'linear-gradient(135deg,#3DDFFF 0%,#5C6EFF 50%,#062240 100%)'},
        {bg:'linear-gradient(135deg,#7FFFE0 0%,#3DFFE0 50%,#0099FF 100%)'},
        {bg:'linear-gradient(135deg,#0099FF 0%,#3DDFFF 50%,#5CFFE0 100%)'},
        {bg:'linear-gradient(135deg,#5C6EFF 0%,#0099FF 50%,#00D4FF 100%)'},
        {bg:'linear-gradient(135deg,#00D4FF 0%,#5CFFE0 50%,#3DDFFF 100%)'}
      ] },
    { id:'gacha_thunderlord', name:'⚡ サンダーロード', price:0, gacha:true, gachaEffect:true,
      desc:'天を裂き、地を焦がす雷霆の支配者。その一撃は神々さえも打ち倒す。',
      vars:{ '--bg-deep':'#0a0518','--bg-deep2':'#140a2e','--panel':'#1f1048','--panel-light':'#2e1a66',
        '--gold':'#FFE838','--coral':'#FFB800','--mint':'#FFEB66','--blue':'#B066FF','--purple':'#8833FF',
        '--pink':'#FFD93D','--lime':'#FFE838','--text':'#FFF8E0','--text-dim':'#B8A0D9' },
      titleGrad:'linear-gradient(90deg,#FFE838,#B066FF,#8833FF)',
      colors:[
        {bg:'linear-gradient(135deg,#FFE838 0%,#FFB800 40%,#8833FF 100%)'},
        {bg:'linear-gradient(135deg,#FFF8E0 0%,#FFE838 50%,#B066FF 100%)'},
        {bg:'linear-gradient(135deg,#B066FF 0%,#8833FF 50%,#1f1048 100%)'},
        {bg:'linear-gradient(135deg,#FFD93D 0%,#FFB800 50%,#8833FF 100%)'},
        {bg:'linear-gradient(135deg,#FFEB66 0%,#FFE838 50%,#B066FF 100%)'},
        {bg:'linear-gradient(135deg,#8833FF 0%,#B066FF 50%,#FFE838 100%)'},
        {bg:'linear-gradient(135deg,#FFE838 0%,#FFB800 50%,#B066FF 100%)'}
      ] },
    { id:'gacha_celestialblossom', name:'🌸 セレスティアル・ブロッサム', price:0, gacha:true, gachaEffect:true,
      desc:'天界の庭園に咲き誇る聖なる花。その花びらに触れた者は、永遠の祝福を受けるという。',
      vars:{ '--bg-deep':'#1a0a18','--bg-deep2':'#2e1228','--panel':'#451c3a','--panel-light':'#5c2850',
        '--gold':'#FFD9A8','--coral':'#FFA8D9','--mint':'#FFE0F0','--blue':'#E0A8FF','--purple':'#C87FE8',
        '--pink':'#FFA8D9','--lime':'#FFEBE0','--text':'#FFF5F8','--text-dim':'#D9A8C8' },
      titleGrad:'linear-gradient(90deg,#FFD9A8,#FFA8D9,#E0A8FF)',
      colors:[
        {bg:'linear-gradient(135deg,#FFE5F0 0%,#FFA8D9 40%,#E0A8FF 100%)'},
        {bg:'linear-gradient(135deg,#FFF5E0 0%,#FFD9A8 50%,#FFA8D9 100%)'},
        {bg:'linear-gradient(135deg,#FFA8D9 0%,#E0A8FF 50%,#C87FE8 100%)'},
        {bg:'linear-gradient(135deg,#FFEBE0 0%,#FFE5F0 50%,#E0A8FF 100%)'},
        {bg:'linear-gradient(135deg,#FFD9A8 0%,#FFA8D9 50%,#C87FE8 100%)'},
        {bg:'linear-gradient(135deg,#E0A8FF 0%,#C87FE8 50%,#FFD9A8 100%)'},
        {bg:'linear-gradient(135deg,#FFE5F0 0%,#E0A8FF 50%,#FFD9A8 100%)'}
      ] },

{ id:'gacha_eternalclockwork', name:'⚙️ エターナルクロックワーク', price:0, gacha:true, gachaEffect:true,
      desc:'時を統べる歯車の神。その機構は永遠の刻を刻み続ける、ガチャ限定の至高。',
      vars:{ '--bg-deep':'#0a0806','--bg-deep2':'#16120c','--panel':'#221c14','--panel-light':'#342b1f',
        '--gold':'#FFD060','--coral':'#C8803D','--mint':'#E8C060','--blue':'#A88850','--purple':'#C0A060',
        '--pink':'#E8B860','--lime':'#D8C060','--text':'#FFF0D0','--text-dim':'#B89860' },
      titleGrad:'linear-gradient(90deg,#FFD060,#C8803D,#8A6020)',
      colors:[
        {bg:'linear-gradient(135deg,#FFE080 0%,#D8A040 40%,#8A6020 100%)'},
        {bg:'linear-gradient(135deg,#E8C060 0%,#B08030 50%,#604820 100%)'},
        {bg:'linear-gradient(135deg,#F0C870 0%,#C89040 50%,#8A6830 100%)'},
        {bg:'linear-gradient(135deg,#D8A850 0%,#A07830 50%,#504020 100%)'},
        {bg:'linear-gradient(135deg,#FFF0B0 0%,#FFD060 50%,#A87830 100%)'},
        {bg:'linear-gradient(135deg,#C0A060 0%,#8A6830 50%,#4A3820 100%)'},
        {bg:'linear-gradient(135deg,#FFE898 0%,#E8B050 50%,#B07830 100%)'}
      ] },
    { id:'gacha_prismaticqueen', name:'💎 プリズマティッククイーン', price:0, gacha:true, gachaEffect:true,
      desc:'プリズムのように七色に輝く女王の宝冠。見る角度で姿を変える、ガチャ限定の至宝。',
      vars:{ '--bg-deep':'#0a0518','--bg-deep2':'#160a28','--panel':'#221444','--panel-light':'#34205c',
        '--gold':'#FFD0FF','--coral':'#FF60D0','--mint':'#A0FFFF','--blue':'#80A0FF','--purple':'#D080FF',
        '--pink':'#FF80E0','--lime':'#D0FFA0','--text':'#FFF8FF','--text-dim':'#B8A0D8' },
      titleGrad:'linear-gradient(90deg,#FFD0FF,#A0FFFF,#D080FF)',
      colors:[
        {bg:'linear-gradient(135deg,#FFD0FF 0%,#FF80D0 50%,#A060FF 100%)'},
        {bg:'linear-gradient(135deg,#A0FFFF 0%,#80C8FF 50%,#D080FF 100%)'},
        {bg:'linear-gradient(135deg,#D0FFA0 0%,#A0F0D0 50%,#80C8FF 100%)'},
        {bg:'linear-gradient(135deg,#FFB0E8 0%,#D080FF 50%,#8090FF 100%)'},
        {bg:'linear-gradient(135deg,#FFE0A0 0%,#FFA8C0 50%,#FF80E0 100%)'},
        {bg:'linear-gradient(135deg,#B0FFD8 0%,#A0E8F0 50%,#D080FF 100%)'},
        {bg:'linear-gradient(135deg,#F0B0FF 0%,#D090FF 50%,#A0A8FF 100%)'}
      ] }
  ];

  // ===================== 🆕 追加スキン（テーマ拡張15種） =====================
  SKINS.push(
    { id:'stardust', name:'スターダスト', price:900, desc:'夜空に瞬く無数の星屑を集めたような、きらめくダークブルー。',
      vars:{ '--bg-deep':'#07061a','--bg-deep2':'#0e0c30','--panel':'#181350','--panel-light':'#241d6e',
        '--gold':'#FFE066','--coral':'#FF8FA3','--mint':'#8FE3FF','--blue':'#6E8CFF','--purple':'#B18CFF',
        '--pink':'#FFA8D9','--lime':'#E1F065','--text':'#F5F3FF','--text-dim':'#A8A0D9' },
      titleGrad:'linear-gradient(90deg,#FFE066,#6E8CFF)',
      colors:[
        {bg:'linear-gradient(135deg,#FFE066,#FFC93D)'},{bg:'linear-gradient(135deg,#8FE3FF,#4DB6FF)'},
        {bg:'linear-gradient(135deg,#B18CFF,#7C5CFF)'},{bg:'linear-gradient(135deg,#FFA8D9,#FF6FB5)'},
        {bg:'linear-gradient(135deg,#8FFFCF,#3DDC97)'},{bg:'linear-gradient(135deg,#FFB88F,#FF7A3D)'},
        {bg:'linear-gradient(135deg,#E1F065,#A8D93D)'}
      ] },
    { id:'moonlight', name:'ムーンライトソナタ', price:1100, desc:'静かな夜に響く月光の調べ。銀色に煌めく幻想的なパレット。',
      vars:{ '--bg-deep':'#0a0e22','--bg-deep2':'#141a38','--panel':'#1e2652','--panel-light':'#2b3570',
        '--gold':'#E0E8FF','--coral':'#9BB0FF','--mint':'#C8D8FF','--blue':'#7A92F0','--purple':'#A8B8FF',
        '--pink':'#D8C8FF','--lime':'#B8D8FF','--text':'#F0F4FF','--text-dim':'#8A96C8' },
      titleGrad:'linear-gradient(90deg,#E0E8FF,#7A92F0)',
      colors:[
        {bg:'linear-gradient(135deg,#F0F4FF,#C8D8FF)'},{bg:'linear-gradient(135deg,#B8C8FF,#7A92F0)'},
        {bg:'linear-gradient(135deg,#D8C8FF,#A8A0E8)'},{bg:'linear-gradient(135deg,#A8E0FF,#6FB0E8)'},
        {bg:'linear-gradient(135deg,#E8E0FF,#A8B8FF)'},{bg:'linear-gradient(135deg,#C8F0FF,#7CC8E8)'},
        {bg:'linear-gradient(135deg,#D0D8FF,#8A96C8)'}
      ] },
    { id:'desert', name:'デザートミラージュ', price:1000, desc:'蜃気楼の向こうに広がる灼熱の砂漠と夕陽のオレンジ。',
      vars:{ '--bg-deep':'#2a1a0c','--bg-deep2':'#3e2712','--panel':'#55341a','--panel-light':'#704625',
        '--gold':'#FFB84D','--coral':'#FF7043','--mint':'#FFD9A0','--blue':'#FFAB6B','--purple':'#E88A4A',
        '--pink':'#FF9070','--lime':'#F0C060','--text':'#FFF4E0','--text-dim':'#C9A67F' },
      titleGrad:'linear-gradient(90deg,#FFB84D,#FF7043)',
      colors:[
        {bg:'linear-gradient(135deg,#FFC97A,#F09A3D)'},{bg:'linear-gradient(135deg,#FF9070,#E85A3D)'},
        {bg:'linear-gradient(135deg,#FFE0A0,#E8B860)'},{bg:'linear-gradient(135deg,#FFAB6B,#D98040)'},
        {bg:'linear-gradient(135deg,#E8A870,#B87040)'},{bg:'linear-gradient(135deg,#FFD060,#E8A030)'},
        {bg:'linear-gradient(135deg,#C08A50,#905A30)'}
      ] },
    { id:'forest', name:'フォレストブリーズ', price:950, desc:'木漏れ日が差し込む深い森の緑と、土の温もりを感じるナチュラルカラー。',
      vars:{ '--bg-deep':'#0c1a0c','--bg-deep2':'#152a15','--panel':'#1e3d1e','--panel-light':'#2a522a',
        '--gold':'#A8E060','--coral':'#D89050','--mint':'#6FD86F','--blue':'#7FD8A0','--purple':'#A8C870',
        '--pink':'#E0C888','--lime':'#C8E870','--text':'#F0FFE8','--text-dim':'#8AB88A' },
      titleGrad:'linear-gradient(90deg,#A8E060,#6FD86F)',
      colors:[
        {bg:'linear-gradient(135deg,#B8E88A,#7FC850)'},{bg:'linear-gradient(135deg,#70D870,#40A840)'},
        {bg:'linear-gradient(135deg,#A0D8A0,#60A860)'},{bg:'linear-gradient(135deg,#D8C080,#A89040)'},
        {bg:'linear-gradient(135deg,#88D8A8,#50A870)'},{bg:'linear-gradient(135deg,#C8E888,#90C850)'},
        {bg:'linear-gradient(135deg,#A8B870,#708040)'}
      ] },
    { id:'crystalcave', name:'クリスタルケイブ', price:1400, desc:'地底深くに輝く紫水晶と蒼い結晶が織りなす、神秘の洞窟。',
      vars:{ '--bg-deep':'#0a0520','--bg-deep2':'#160a36','--panel':'#221450','--panel-light':'#321e6e',
        '--gold':'#B0E0FF','--coral':'#E070FF','--mint':'#80E0FF','--blue':'#6FB8FF','--purple':'#A870FF',
        '--pink':'#D880FF','--lime':'#A0E8FF','--text':'#F5F0FF','--text-dim':'#9C8AC8' },
      titleGrad:'linear-gradient(90deg,#B0E0FF,#A870FF)',
      colors:[
        {bg:'linear-gradient(135deg,#C8E8FF,#80B8E8)'},{bg:'linear-gradient(135deg,#D8A8FF,#A870E8)'},
        {bg:'linear-gradient(135deg,#A0D8FF,#5090E0)'},{bg:'linear-gradient(135deg,#E0B8FF,#B080E8)'},
        {bg:'linear-gradient(135deg,#90D8E8,#4090B8)'},{bg:'linear-gradient(135deg,#C8B0FF,#9070E0)'},
        {bg:'linear-gradient(135deg,#B0E8D8,#60B8A8)'}
      ] },
    { id:'cybercity', name:'サイバーシティ2099', price:1700, desc:'ネオンが瞬く未来都市の夜景。電脳空間のサイバーパンク配色。',
      vars:{ '--bg-deep':'#05001a','--bg-deep2':'#0a0530','--panel':'#150a45','--panel-light':'#20125c',
        '--gold':'#00F0FF','--coral':'#FF00A8','--mint':'#00FFA8','--blue':'#00A8FF','--purple':'#A800FF',
        '--pink':'#FF00A8','--lime':'#A8FF00','--text':'#F0F8FF','--text-dim':'#7090B8' },
      titleGrad:'linear-gradient(90deg,#00F0FF,#FF00A8)',
      colors:[
        {bg:'linear-gradient(135deg,#00F0FF,#0088A8)'},{bg:'linear-gradient(135deg,#FF00A8,#A80060)'},
        {bg:'linear-gradient(135deg,#00FFA8,#00A870)'},{bg:'linear-gradient(135deg,#A800FF,#6000A8)'},
        {bg:'linear-gradient(135deg,#A8FF00,#70A800)'},{bg:'linear-gradient(135deg,#FF8000,#A85000)'},
        {bg:'linear-gradient(135deg,#00A8FF,#0068A8)'}
      ] },
    { id:'fireworks', name:'花火大会', price:1300, desc:'夏の夜空を彩る大輪の花火。暗闇に弾ける鮮やかな色彩。',
      vars:{ '--bg-deep':'#0a0a14','--bg-deep2':'#15152a','--panel':'#1f1f40','--panel-light':'#2e2e5c',
        '--gold':'#FFE060','--coral':'#FF5080','--mint':'#60FFC0','--blue':'#60A8FF','--purple':'#C060FF',
        '--pink':'#FF60C0','--lime':'#C0FF60','--text':'#FFFFFF','--text-dim':'#A8A8C8' },
      titleGrad:'linear-gradient(90deg,#FFE060,#FF5080)',
      colors:[
        {bg:'linear-gradient(135deg,#FFE060,#FFA020)'},{bg:'linear-gradient(135deg,#FF5080,#D02060)'},
        {bg:'linear-gradient(135deg,#60FFC0,#20B080)'},{bg:'linear-gradient(135deg,#60A8FF,#2060C0)'},
        {bg:'linear-gradient(135deg,#C060FF,#8030C0)'},{bg:'linear-gradient(135deg,#FF60C0,#C02080)'},
        {bg:'linear-gradient(135deg,#C0FF60,#80C020)'}
      ] },
    { id:'pirate', name:'パイレーツコーブ', price:1200, desc:'海賊の隠れ家に眠る黄金と、深い海の青。冒険心をくすぐる配色。',
      vars:{ '--bg-deep':'#0a1418','--bg-deep2':'#141f28','--panel':'#1e2e3a','--panel-light':'#2c4250',
        '--gold':'#E8C060','--coral':'#C8804A','--mint':'#60C8B8','--blue':'#4A90B8','--purple':'#8A7050',
        '--pink':'#C89070','--lime':'#A8C060','--text':'#F0EDE0','--text-dim':'#9A9080' },
      titleGrad:'linear-gradient(90deg,#E8C060,#4A90B8)',
      colors:[
        {bg:'linear-gradient(135deg,#E8C060,#B89030)'},{bg:'linear-gradient(135deg,#60C8B8,#30A898)'},
        {bg:'linear-gradient(135deg,#4A90B8,#206890)'},{bg:'linear-gradient(135deg,#C8804A,#905020)'},
        {bg:'linear-gradient(135deg,#8A7050,#5A4830)'},{bg:'linear-gradient(135deg,#A8C060,#709030)'},
        {bg:'linear-gradient(135deg,#C89070,#906040)'}
      ] },
    { id:'ninja', name:'シノビシャドウ', price:1350, desc:'闇に溶け込む忍者の黒装束と、緋色の帯。静寂に満ちた和のダークテーマ。',
      vars:{ '--bg-deep':'#0a0606','--bg-deep2':'#150a0a','--panel':'#201010','--panel-light':'#301818',
        '--gold':'#C8A060','--coral':'#D83030','--mint':'#70A890','--blue':'#506890','--purple':'#705070',
        '--pink':'#C06080','--lime':'#A8A060','--text':'#F0E8E0','--text-dim':'#907878' },
      titleGrad:'linear-gradient(90deg,#D83030,#C8A060)',
      colors:[
        {bg:'linear-gradient(135deg,#D83030,#901818)'},{bg:'linear-gradient(135deg,#2a2a2a,#0a0a0a)'},
        {bg:'linear-gradient(135deg,#506890,#283850)'},{bg:'linear-gradient(135deg,#C8A060,#8A6030)'},
        {bg:'linear-gradient(135deg,#705070,#403040)'},{bg:'linear-gradient(135deg,#70A890,#387058)'},
        {bg:'linear-gradient(135deg,#A8A060,#707030)'}
      ] },
    { id:'hotspring', name:'湯けむり温泉', price:1000, desc:'湯気の立ち上る露天風呂と、夕暮れの空。心安らぐ和みの配色。',
      vars:{ '--bg-deep':'#2a1f18','--bg-deep2':'#3d2c22','--panel':'#503a2c','--panel-light':'#6a503c',
        '--gold':'#F0C890','--coral':'#E89070','--mint':'#D8C8B0','--blue':'#A8A8B8','--purple':'#C0A0A0',
        '--pink':'#E8A8A0','--lime':'#D0C080','--text':'#FFF4E8','--text-dim':'#C0A890' },
      titleGrad:'linear-gradient(90deg,#F0C890,#E89070)',
      colors:[
        {bg:'linear-gradient(135deg,#F0C890,#C89860)'},{bg:'linear-gradient(135deg,#E89070,#B86040)'},
        {bg:'linear-gradient(135deg,#A8A8B8,#788898)'},{bg:'linear-gradient(135deg,#C0A0A0,#907080)'},
        {bg:'linear-gradient(135deg,#D8C8B0,#A89880)'},{bg:'linear-gradient(135deg,#E8A8A0,#B87068)'},
        {bg:'linear-gradient(135deg,#D0C080,#908840)'}
      ] },
    { id:'retrogame', name:'レトロゲームボーイ', price:1100, desc:'8ビットの懐かしさ。モノクローム液晶のグリーン一色。',
      vars:{ '--bg-deep':'#0a1408','--bg-deep2':'#14240c','--panel':'#1e3a10','--panel-light':'#2e5518',
        '--gold':'#A8E060','--coral':'#70B830','--mint':'#B8E880','--blue':'#88C850','--purple':'#90D840',
        '--pink':'#A0E058','--lime':'#C8F088','--text':'#E8FFD8','--text-dim':'#88A870' },
      titleGrad:'linear-gradient(90deg,#A8E060,#70B830)',
      colors:[
        {bg:'linear-gradient(135deg,#C8F088,#90C850)'},{bg:'linear-gradient(135deg,#A8E060,#70B830)'},
        {bg:'linear-gradient(135deg,#B8E880,#80C048)'},{bg:'linear-gradient(135deg,#88C850,#509020)'},
        {bg:'linear-gradient(135deg,#A0E058,#689830)'},{bg:'linear-gradient(135deg,#90D840,#588810)'},
        {bg:'linear-gradient(135deg,#D8FFA0,#A8E060)'}
      ] },
    { id:'pasteldream', name:'パステルドリーム', price:1000, desc:'雲の上を歩くような、ふわふわで夢見心地のパステルカラー。',
      vars:{ '--bg-deep':'#2a1e30','--bg-deep2':'#3d2c44','--panel':'#503a58','--panel-light':'#6a506e',
        '--gold':'#FFD8E8','--coral':'#FFB0C8','--mint':'#C8E8FF','--blue':'#B0C8FF','--purple':'#D8B8F0',
        '--pink':'#FFB8D8','--lime':'#E0F0C0','--text':'#FFF8FF','--text-dim':'#C0A8C8' },
      titleGrad:'linear-gradient(90deg,#FFD8E8,#B0C8FF)',
      colors:[
        {bg:'linear-gradient(135deg,#FFD8E8,#FFA8C8)'},{bg:'linear-gradient(135deg,#C8E8FF,#90C0F0)'},
        {bg:'linear-gradient(135deg,#D8B8F0,#B080E0)'},{bg:'linear-gradient(135deg,#C8F0E0,#90D0C0)'},
        {bg:'linear-gradient(135deg,#FFE8C8,#FFC890)'},{bg:'linear-gradient(135deg,#E0F0C0,#B0D080)'},
        {bg:'linear-gradient(135deg,#FFC8E0,#F090B8)'}
      ] },
    { id:'hologram', name:'ホログラムシフト', price:2000, desc:'光の角度で色が変わる、オーロラのような虹色の輝き。',
      vars:{ '--bg-deep':'#0a0a18','--bg-deep2':'#14142c','--panel':'#202040','--panel-light':'#2e2e60',
        '--gold':'#FFE0F0','--coral':'#FF80D0','--mint':'#A0F0FF','--blue':'#80B0FF','--purple':'#D080FF',
        '--pink':'#FF90E0','--lime':'#D0FFA0','--text':'#F8F0FF','--text-dim':'#A8A0C8' },
      titleGrad:'linear-gradient(90deg,#FFE0F0,#A0F0FF,#D080FF)',
      colors:[
        {bg:'linear-gradient(135deg,#FFE0F0 0%,#FFA8D0 50%,#D080FF 100%)'},
        {bg:'linear-gradient(135deg,#A0F0FF 0%,#80C0FF 50%,#B080FF 100%)'},
        {bg:'linear-gradient(135deg,#D0FFA0 0%,#A0E8C8 50%,#80D0FF 100%)'},
        {bg:'linear-gradient(135deg,#FFB0E8 0%,#D080FF 50%,#8090FF 100%)'},
        {bg:'linear-gradient(135deg,#FFE080 0%,#FFA8A0 50%,#FF80D0 100%)'},
        {bg:'linear-gradient(135deg,#A0FFD8 0%,#80E0F0 50%,#B080FF 100%)'},
        {bg:'linear-gradient(135deg,#F0A8FF 0%,#C080F0 50%,#80A8FF 100%)'}
      ] },
    { id:'rainbowroad', name:'レインボーロード', price:2200, desc:'虹色に輝く夢の道。すべての色が主役のカラフルテーマ。',
      vars:{ '--bg-deep':'#0a0a14','--bg-deep2':'#14142a','--panel':'#1f1f40','--panel-light':'#2e2e5c',
        '--gold':'#FFD93D','--coral':'#FF4444','--mint':'#44FF88','--blue':'#4488FF','--purple':'#AA44FF',
        '--pink':'#FF44AA','--lime':'#AAFF44','--text':'#FFFFFF','--text-dim':'#B8B8D8' },
      titleGrad:'linear-gradient(90deg,#FF4444,#FFD93D,#44FF88,#4488FF,#AA44FF)',
      colors:[
        {bg:'linear-gradient(135deg,#FF6B6B,#E83030)'},{bg:'linear-gradient(135deg,#FFD93D,#E8B020)'},
        {bg:'linear-gradient(135deg,#6BFF9C,#20C860)'},{bg:'linear-gradient(135deg,#6BB8FF,#2078E8)'},
        {bg:'linear-gradient(135deg,#C87BFF,#8030E8)'},{bg:'linear-gradient(135deg,#FF7BC8,#E830A0)'},
        {bg:'linear-gradient(135deg,#C8FF6B,#88C820)'}
      ] },
    { id:'snowfield', name:'スノーフィールド', price:1050, desc:'一面に広がる純白の雪原と、澄み切った冬空の青。',
      vars:{ '--bg-deep':'#1a2030','--bg-deep2':'#253044','--panel':'#324258','--panel-light':'#485a74',
        '--gold':'#E0F0FF','--coral':'#A8D0FF','--mint':'#FFFFFF','--blue':'#80B8E8','--purple':'#B8D0F0',
        '--pink':'#E0E8FF','--lime':'#D0E8FF','--text':'#FFFFFF','--text-dim':'#A8B8D0' },
      titleGrad:'linear-gradient(90deg,#E0F0FF,#80B8E8)',
      colors:[
        {bg:'linear-gradient(135deg,#FFFFFF,#D0E8FF)'},{bg:'linear-gradient(135deg,#B8D8F8,#80B0E8)'},
        {bg:'linear-gradient(135deg,#E0F0FF,#A8C8F0)'},{bg:'linear-gradient(135deg,#C8E0FF,#8FB8E8)'},
        {bg:'linear-gradient(135deg,#F0F8FF,#C0D8F0)'},{bg:'linear-gradient(135deg,#D8E8FF,#A0B8D8)'},
        {bg:'linear-gradient(135deg,#E8F4FF,#B0C8E8)'}
      ] }
  );

  // ===================== 🆕 アニメーションスキン(色や模様ではなく「動き」で新しい視点を持たせた特別枠) =====================
  // これまでのスキンは全て静止したグラデーションだったが、ここではブロック自体が
  // 常時アニメーションする(animType で描画方法が変わる)。単なる色替えでは出せない
  // 「生きている」ような質感を狙った、既存スキンとは全く違う切り口の追加。
  SKINS.push(
    { id:'chromaflow', name:'💫 クロマフロー', price:2400, animType:'pan',
      desc:'色が絶えず流れ続ける、生きているようなキャンディ。ブロックの中で虹色がゆらめき続ける。',
      vars:{ '--bg-deep':'#0a0518','--bg-deep2':'#160a2c','--panel':'#221446','--panel-light':'#32205e',
        '--gold':'#FFD166','--coral':'#FF6B9D','--mint':'#4DFFC8','--blue':'#4D9DFF','--purple':'#B166FF',
        '--pink':'#FF6BC8','--lime':'#C8FF4D','--text':'#F5F3FF','--text-dim':'#A89AD9' },
      titleGrad:'linear-gradient(90deg,#FFD166,#FF6BC8,#4D9DFF)',
      colors:[
        {bg:'linear-gradient(120deg,#FF6B9D 0%,#FFD166 25%,#4DFFC8 50%,#4D9DFF 75%,#B166FF 100%)'},
        {bg:'linear-gradient(120deg,#4DFFC8 0%,#4D9DFF 25%,#B166FF 50%,#FF6BC8 75%,#FFD166 100%)'},
        {bg:'linear-gradient(120deg,#B166FF 0%,#FF6BC8 25%,#FFD166 50%,#4DFFC8 75%,#4D9DFF 100%)'},
        {bg:'linear-gradient(120deg,#FFD166 0%,#4DFFC8 25%,#4D9DFF 50%,#B166FF 75%,#FF6B9D 100%)'},
        {bg:'linear-gradient(120deg,#4D9DFF 0%,#B166FF 25%,#FF6BC8 50%,#FFD166 75%,#4DFFC8 100%)'},
        {bg:'linear-gradient(120deg,#FF6BC8 0%,#4DFFC8 25%,#FFD166 50%,#FF6B9D 75%,#B166FF 100%)'},
        {bg:'linear-gradient(120deg,#C8FF4D 0%,#4D9DFF 25%,#FF6B9D 50%,#FFD166 75%,#4DFFC8 100%)'}
      ] },
    { id:'heartbeat', name:'💗 ハートビート・キャンディ', price:2000, animType:'pulse',
      desc:'鼓動のようにドクドクと明滅する、生命感あふれるスキン。じっと見ると少しドキドキする。',
      vars:{ '--bg-deep':'#1a050c','--bg-deep2':'#2c0a18','--panel':'#461428','--panel-light':'#5e2038',
        '--gold':'#FFC1D9','--coral':'#FF4D6D','--mint':'#FF8FA8','--blue':'#FF6B8F','--purple':'#FF3D5C',
        '--pink':'#FF6B9D','--lime':'#FFB8C8','--text':'#FFF0F4','--text-dim':'#D98AA0' },
      titleGrad:'linear-gradient(90deg,#FF4D6D,#FFC1D9)',
      colors:[
        {bg:'linear-gradient(135deg,#FF8FA8,#FF4D6D)'},{bg:'linear-gradient(135deg,#FF6B8F,#E8305A)'},
        {bg:'linear-gradient(135deg,#FFB8C8,#FF6B9D)'},{bg:'linear-gradient(135deg,#FF3D5C,#C81840)'},
        {bg:'linear-gradient(135deg,#FFC1D9,#FF8FB0)'},{bg:'linear-gradient(135deg,#FF4D6D,#D82048)'},
        {bg:'linear-gradient(135deg,#FF7090,#E83060)'}
      ] },
    { id:'prismspin', name:'🌀 プリズムスピン', price:2600, animType:'hue',
      desc:'虹色が渦を巻くように色相そのものが回転し続ける、めまぐるしいスキン。',
      vars:{ '--bg-deep':'#08081a','--bg-deep2':'#101030','--panel':'#1a1a48','--panel-light':'#26266a',
        '--gold':'#FFD966','--coral':'#FF6666','--mint':'#66FFCC','--blue':'#6699FF','--purple':'#B366FF',
        '--pink':'#FF66CC','--lime':'#CCFF66','--text':'#F5F5FF','--text-dim':'#9C9CD9' },
      titleGrad:'linear-gradient(90deg,#FF6666,#FFD966,#66FFCC,#6699FF,#B366FF)',
      colors:[
        {bg:'linear-gradient(135deg,#FF6666,#FFD966)'},{bg:'linear-gradient(135deg,#FFD966,#66FFCC)'},
        {bg:'linear-gradient(135deg,#66FFCC,#6699FF)'},{bg:'linear-gradient(135deg,#6699FF,#B366FF)'},
        {bg:'linear-gradient(135deg,#B366FF,#FF66CC)'},{bg:'linear-gradient(135deg,#FF66CC,#FF6666)'},
        {bg:'linear-gradient(135deg,#CCFF66,#66FFCC)'}
      ] }
  );

  SKINS.push(...GACHA_SKINS);

  // ===================== 🎃 ハロウィン限定スキン(期間限定ガチャ/ロード/交換所でのみ入手。購入不可) =====================
  // ※スキンのデータ自体はずっと残る(入手済みのスキンはイベント終了後も使える)。入手経路だけがサーバーの期間設定で閉じる。
  const hwc = (pairs)=>pairs.map(([a,b])=>({bg:`linear-gradient(135deg,${a},${b})`}));
  const HALLOWEEN_SKINS = [
    { id:'hween_pumpkinking', name:'🎃 パンプキンキング', price:0, gacha:true, event:'halloween', gachaEffect:true,
      desc:'畑を支配するカボチャの王。燃えるようなオレンジと王冠の金色が盤面を照らす、ハロウィンガチャ最上級のスキン。',
      vars:{ '--bg-deep':'#120600','--bg-deep2':'#2a0e00','--panel':'#3d1704','--panel-light':'#561f06',
        '--gold':'#FFC02E','--coral':'#FF6A00','--mint':'#FFD98A','--blue':'#FF9A3D','--purple':'#C25BFF',
        '--pink':'#FF7A3D','--lime':'#F2E34A','--text':'#FFF4E4','--text-dim':'#D9A878' },
      titleGrad:'linear-gradient(90deg,#FFC02E,#FF6A00,#C25BFF)',
      colors:hwc([['#FFC02E','#FF6A00'],['#FF8A3D','#E04A00'],['#FFD98A','#FFA43D'],['#C25BFF','#7A2BD9'],['#FF6A00','#B83A00'],['#F2E34A','#FFB020'],['#FF9A3D','#FF4A00']]) },
    { id:'hween_vampire', name:'🧛 ヴァンパイアロード', price:0, gacha:true, event:'halloween', gachaEffect:true,
      desc:'深紅の夜に君臨する吸血鬼の貴族。黒いビロードと血のようなルビーが織りなす、気高く危険な配色。',
      vars:{ '--bg-deep':'#0b0207','--bg-deep2':'#1e040f','--panel':'#2f0818','--panel-light':'#45102a',
        '--gold':'#E8C27A','--coral':'#D01A45','--mint':'#FF6B8B','--blue':'#9A3B70','--purple':'#7B2CBF',
        '--pink':'#E0457B','--lime':'#E8C27A','--text':'#FFEFF2','--text-dim':'#C99AAA' },
      titleGrad:'linear-gradient(90deg,#E8C27A,#D01A45,#7B2CBF)',
      colors:hwc([['#D01A45','#7A0A26'],['#E8C27A','#B8893A'],['#FF6B8B','#D01A45'],['#7B2CBF','#4A1280'],['#E0457B','#A01A55'],['#9A3B70','#5A1A45'],['#FF8FA6','#E0457B']]) },
    { id:'hween_ghostparade', name:'👻 ゴーストパレード', price:0, gacha:true, event:'halloween', animType:'pulse',
      desc:'月夜にふわふわ漂うおばけの行列。ブロックがほんのり明滅し続ける、幻想的なアニメーションスキン。',
      vars:{ '--bg-deep':'#070f16','--bg-deep2':'#0e1f2c','--panel':'#16303f','--panel-light':'#1f4358',
        '--gold':'#BFF5FF','--coral':'#A78BFA','--mint':'#7FFFD4','--blue':'#7FB8FF','--purple':'#B8A4FF',
        '--pink':'#E0B8FF','--lime':'#C8FFE6','--text':'#F0FBFF','--text-dim':'#8FB8C8' },
      titleGrad:'linear-gradient(90deg,#BFF5FF,#B8A4FF,#7FFFD4)',
      colors:hwc([['#E6F9FF','#9FDDF2'],['#D9CCFF','#A78BFA'],['#BFFFEA','#7FFFD4'],['#CFE5FF','#7FB8FF'],['#F3DDFF','#C98CFF'],['#FFFFFF','#BFE8F5'],['#C8FFE6','#8FF0C8']]) },
    { id:'hween_witchbrew', name:'🔮 ウィッチブリュー', price:0, gacha:true, event:'halloween',
      desc:'魔女の大鍋でぐつぐつ煮えるポーション。毒々しいライムグリーンと妖しい紫が渦を巻く。',
      vars:{ '--bg-deep':'#0d0620','--bg-deep2':'#1b0b3a','--panel':'#2a1255','--panel-light':'#3b1a73',
        '--gold':'#B8FF3D','--coral':'#FF4FD8','--mint':'#3DFFA8','--blue':'#7A5CFF','--purple':'#B14DFF',
        '--pink':'#FF4FD8','--lime':'#B8FF3D','--text':'#F6EEFF','--text-dim':'#AE95D9' },
      titleGrad:'linear-gradient(90deg,#B8FF3D,#B14DFF,#FF4FD8)',
      colors:hwc([['#B8FF3D','#6FD000'],['#B14DFF','#6A1FC2'],['#FF4FD8','#B82A9A'],['#3DFFA8','#12B878'],['#7A5CFF','#4A2FC2'],['#D6FF7A','#9AE000'],['#E08CFF','#A83DE0']]) },
    { id:'hween_blackcat', name:'🐈‍⬛ ブラックキャットムーン', price:0, gacha:true, event:'halloween',
      desc:'満月を見上げる黒猫の瞳。漆黒の闇に、金色の月明かりと小さな星々が浮かぶ。',
      vars:{ '--bg-deep':'#050507','--bg-deep2':'#0d0d18','--panel':'#171729','--panel-light':'#222240',
        '--gold':'#FFE066','--coral':'#FF8A00','--mint':'#FFF3B0','--blue':'#6C7BFF','--purple':'#8A6CFF',
        '--pink':'#FFB36C','--lime':'#FFE066','--text':'#FFFBEA','--text-dim':'#A9A7C9' },
      titleGrad:'linear-gradient(90deg,#FFE066,#FF8A00,#8A6CFF)',
      colors:hwc([['#FFE066','#E0A800'],['#FF8A00','#C25A00'],['#FFF3B0','#FFD84D'],['#6C7BFF','#3A45C2'],['#8A6CFF','#5638C2'],['#FFB36C','#E07A1A'],['#3A3A5A','#1A1A30']]) },
    { id:'hween_candycorn', name:'🍬 キャンディコーン', price:0, gacha:true, event:'halloween',
      desc:'ハロウィン定番のお菓子。黄・橙・白の三色ストライプがポップに映える。',
      vars:{ '--bg-deep':'#1a0c05','--bg-deep2':'#2e1608','--panel':'#4a230d','--panel-light':'#65310f',
        '--gold':'#FFE14D','--coral':'#FF8A1F','--mint':'#FFF4C2','--blue':'#FFB347','--purple':'#E08A5C',
        '--pink':'#FF9F5C','--lime':'#FFE14D','--text':'#FFF8E8','--text-dim':'#D9B58A' },
      titleGrad:'linear-gradient(90deg,#FFE14D,#FF8A1F,#FFF4C2)',
      colors:hwc([['#FFE14D','#F2B800'],['#FF8A1F','#D95F00'],['#FFF4C2','#FFD98A'],['#FFB347','#E08A1F'],['#FFFFFF','#FFE9B0'],['#FF9F5C','#E0702A'],['#F2CC30','#D9A000']]) },
    { id:'hween_moonlight', name:'🌕 ムーンライト・マナー', price:0, gacha:true, event:'halloween', gachaEffect:true,
      desc:'月明かりに浮かぶ古い洋館。深い藍色と銀の光に包まれる、ハロウィンロード20段目の報酬。',
      vars:{ '--bg-deep':'#050a1a','--bg-deep2':'#0b1536','--panel':'#14224f','--panel-light':'#1d3070',
        '--gold':'#E6ECFF','--coral':'#8FA8FF','--mint':'#9FE8FF','--blue':'#5C7CFF','--purple':'#9C8CFF',
        '--pink':'#C0B0FF','--lime':'#CFE8FF','--text':'#F2F5FF','--text-dim':'#8F9CCF' },
      titleGrad:'linear-gradient(90deg,#E6ECFF,#8FA8FF,#9C8CFF)',
      colors:hwc([['#E6ECFF','#A8B8F0'],['#8FA8FF','#4A62D9'],['#9FE8FF','#5CB8E0'],['#5C7CFF','#2A3FB8'],['#9C8CFF','#5C48D9'],['#C0B0FF','#8A78E0'],['#CFE8FF','#8FB8E0']]) },
    { id:'hween_eternalnight', name:'🕯 エターナルナイト', price:0, gacha:true, event:'halloween', gachaEffect:true,
      desc:'終わらない夜に灯るろうそくの炎。紫黒と金の最高級スキン。ハロウィンロード40段目(完走)の記念報酬。',
      vars:{ '--bg-deep':'#07030f','--bg-deep2':'#14082a','--panel':'#221044','--panel-light':'#321764',
        '--gold':'#FFD36B','--coral':'#FF7A3D','--mint':'#FFB86B','--blue':'#8A5CFF','--purple':'#B14DFF',
        '--pink':'#FF5CA8','--lime':'#FFD36B','--text':'#FFF4E4','--text-dim':'#B8A0D9' },
      titleGrad:'linear-gradient(90deg,#FFD36B,#FF7A3D,#B14DFF)',
      colors:hwc([['#FFD36B','#E0A020'],['#FF7A3D','#C24A00'],['#B14DFF','#6A1FC2'],['#FF5CA8','#C22A70'],['#8A5CFF','#4A2FC2'],['#FFB86B','#E07A1A'],['#E0A0FF','#9A4DE0']]) },
    { id:'hween_spiderweb', name:'🕸 スパイダーウェブ', price:0, gacha:true, event:'halloween',
      desc:'銀の蜘蛛の巣が張る古い屋根裏。モノクロームに紫のアクセントが効いた、交換所限定スキン。',
      vars:{ '--bg-deep':'#09090d','--bg-deep2':'#14141c','--panel':'#22222e','--panel-light':'#30303f',
        '--gold':'#D8D8E8','--coral':'#B08CFF','--mint':'#C8C8D8','--blue':'#8A8AA8','--purple':'#9A6CFF',
        '--pink':'#C8A8FF','--lime':'#E8E8F4','--text':'#F4F4FA','--text-dim':'#9A9AB0' },
      titleGrad:'linear-gradient(90deg,#E8E8F4,#9A6CFF,#8A8AA8)',
      colors:hwc([['#E8E8F4','#B0B0C8'],['#B08CFF','#6A44C2'],['#C8C8D8','#8A8AA8'],['#9A6CFF','#5A38C2'],['#D8D8E8','#9A9AB8'],['#C8A8FF','#8A64E0'],['#F4F4FA','#C0C0D8']]) },
    { id:'hween_batswarm', name:'🦇 バットスウォーム', price:0, gacha:true, event:'halloween', animType:'pan',
      desc:'夜空を埋め尽くすコウモリの群れ。紫と赤のグラデーションが流れ続ける、交換所限定のアニメーションスキン。',
      vars:{ '--bg-deep':'#08030f','--bg-deep2':'#150822','--panel':'#24103c','--panel-light':'#341856',
        '--gold':'#FF9A6B','--coral':'#E0245A','--mint':'#C25BFF','--blue':'#6A4CFF','--purple':'#9A3DFF',
        '--pink':'#FF3D8A','--lime':'#FFB86B','--text':'#F8EEFF','--text-dim':'#AC90D0' },
      titleGrad:'linear-gradient(90deg,#FF9A6B,#E0245A,#9A3DFF)',
      colors:hwc([['#E0245A','#7A0F30'],['#9A3DFF','#4A1580'],['#FF3D8A','#A01A55'],['#6A4CFF','#2F1FA0'],['#FF9A6B','#D0502A'],['#C25BFF','#7A2BD9'],['#2A1A3E','#12081E']]) }
  ];
  const HALLOWEEN_SKIN_IDS = HALLOWEEN_SKINS.map(x=>x.id);
  // ハロウィン開催中、標準スキンを装備している人に自動で適用される配色(黒紫 × 金 × カボチャ色)
  const HW_DEFAULT_VARS = { '--bg-deep':'#0a0613','--bg-deep2':'#170b2b','--panel':'#231238','--panel-light':'#34194f',
    '--gold':'#F4C95D','--coral':'#FF7A2F','--mint':'#8BE9B0','--blue':'#7BA9FF','--purple':'#B58CFF',
    '--pink':'#FF7AB6','--lime':'#C8E34A','--text':'#FBF3E8','--text-dim':'#B9A6D6' };
  const HW_TITLE_GRAD = 'linear-gradient(90deg,#F4C95D,#FF7A2F,#B58CFF)';
  SKINS.push(...HALLOWEEN_SKINS);

  // ===================== 模様入りスキンを自動生成（既存パレット×パターンの組み合わせ）=====================
  // 通常スキンより高価に設定し、ボードの各ブロックに柄（ストライプ・ドットなど）を重ねて描画する
  (function generatePatternedSkins(){
    // アニメーションスキンは「動き」自体が個性なので、柄バリエーションの自動生成対象からは除外する
    const plainSkins = SKINS.filter(s=>!s.gacha && !s.animType);
    const patternKeys = Object.keys(PATTERN_LAYERS);
    const N = patternKeys.length;

    plainSkins.forEach((base, i)=>{
      // 各スキンに2種の柄バリエーションを付与（プライマリ + セカンダリ）
      const primaryIdx = i % N;
      const secondaryIdx = (i * 3 + 7) % N;   // 別の柄が当たるよう黄金角風のずらし
      const seen = new Set();

      [primaryIdx, secondaryIdx].forEach((idx)=>{
        const patternKey = patternKeys[idx];
        if(seen.has(patternKey)) return;
        seen.add(patternKey);

        SKINS.push({
          id: `${base.id}-${patternKey}`,
          name: `${base.name}（${PATTERN_LABELS[patternKey]}柄）`,
          price: Math.round(base.price * 2.3 + 600),
          desc: `${base.desc} ブロックに${PATTERN_LABELS[patternKey]}模様をあしらった特別バージョン。`,
          vars: base.vars,
          titleGrad: base.titleGrad,
          colors: base.colors,
          pattern: patternKey
        });
      });
    });
  })();
  let ownedSkins = ['default'];
  let equippedSkin = 'default';

  const SHAPES = [
    [[0,0]],[[0,0]],
    [[0,0],[0,1]],[[0,0],[0,1]],
    [[0,0],[1,0]],[[0,0],[1,0]],
    [[0,0],[0,1],[0,2]],[[0,0],[1,0],[2,0]],
    [[0,0],[1,0],[1,1]],[[0,0],[0,1],[1,0]],[[0,0],[0,1],[1,1]],[[0,1],[1,0],[1,1]],
    [[0,0],[0,1],[0,2],[0,3]],[[0,0],[1,0],[2,0],[3,0]],
    [[0,0],[0,1],[1,0],[1,1]],[[0,0],[0,1],[1,0],[1,1]],
    [[0,0],[0,1],[0,2],[1,1]],[[1,0],[1,1],[1,2],[0,1]],
    [[0,0],[1,0],[2,0],[1,1]],[[0,1],[1,1],[2,1],[1,0]],
    [[0,0],[1,0],[2,0],[2,1]],[[0,1],[1,1],[2,1],[2,0]],
    [[0,1],[0,2],[1,0],[1,1]],[[0,0],[0,1],[1,1],[1,2]],
    [[0,1],[1,0],[1,1],[1,2],[2,1]],
    [[0,0],[0,1],[0,2],[0,3],[0,4]],[[0,0],[1,0],[2,0],[3,0],[4,0]],
    [[0,0],[0,1],[0,2],[1,0],[1,1],[1,2],[2,0],[2,1],[2,2]]
  ];

  const boardEl = document.getElementById('board');
  const boardWrapEl = document.getElementById('board-wrap');
  const trayEl = document.getElementById('tray');
  const tetrisWrapEl = document.getElementById('tetris-wrap');
  const tetrisBoardEl = document.getElementById('tetrisBoard');
  const tetrisNextEl = document.getElementById('tetrisNext');
  const tetrisLevelEl = document.getElementById('tetrisLevel');
  const tetrisLinesEl = document.getElementById('tetrisLines');
  const tetrisComboTextEl = document.getElementById('tetrisComboText');
  const tBtnLeftEl = document.getElementById('tBtnLeft');
  const tBtnRightEl = document.getElementById('tBtnRight');
  const tBtnRotateEl = document.getElementById('tBtnRotate');
  const tBtnSoftEl = document.getElementById('tBtnSoft');
  const tBtnHardEl = document.getElementById('tBtnHard');
  const tBtnHoldEl = document.getElementById('tBtnHold');
  const tetrisHoldBoxEl = document.getElementById('tetrisHoldBox');
  const tetrisHelpBtnEl = document.getElementById('tetrisHelpBtn');
  const tetrisHelpPanelEl = document.getElementById('tetrisHelpPanel');
  const ghostEl = document.getElementById('ghost');
  const scoreValEl = document.getElementById('scoreVal');
  const bestValEl = document.getElementById('bestVal');
  const coinValEl = document.getElementById('coinVal');
  const timeAttackCardEl = document.getElementById('timeAttackCard');
  const timeAttackValEl = document.getElementById('timeAttackVal');
  const comboTextEl = document.getElementById('comboText');
  const overlayEl = document.getElementById('overlay');
  const finalScoreEl = document.getElementById('finalScore');
  const newBestNoteEl = document.getElementById('newBestNote');
  const coinEarnedNoteEl = document.getElementById('coinEarnedNote');
  const duelResultNoteEl = document.getElementById('duelResultNote');
  const restartBtn = document.getElementById('restartBtn');
  const soundBtn = document.getElementById('soundBtn');
  const questBtn = document.getElementById('questBtn');
  const settingsBtn = document.getElementById('settingsBtn');
  const modeBadgeEl = document.getElementById('modeBadge');
  const accountBtn = document.getElementById('accountBtn');
  const rankingBtn = document.getElementById('rankingBtn');
  const adminPanelBtn = document.getElementById('adminPanelBtn');
  const chatBtn = document.getElementById('chatBtn');
  const friendsBtn = document.getElementById('friendsBtn');
  const friendsDot = document.getElementById('friendsDot');
  const friendsMentionBadge = document.getElementById('friendsMentionBadge');
  const chatDot = document.getElementById('chatDot');
  const chatMentionBadge = document.getElementById('chatMentionBadge');
  const modalOverlay = document.getElementById('modalOverlay');
  const modalContent = document.getElementById('modalContent');
  const modalClose = document.getElementById('modalClose');

  let board = [], cellEls = [], tray = [];
  let score = 0, best = 0, coins = 0, streak = 0, noClearStreak = 0;
  let soundOn = true;
  let soundVolume = 1;
  let darkMode = true;
  const STORAGE_APPSETTINGS = 'candyblast-appsettings-v1';
  async function loadAppSettings(){
    try{
      const res = await appStorage.get(STORAGE_APPSETTINGS, false);
      if(res && res.value){
        const parsed = JSON.parse(res.value);
        if(typeof parsed.soundVolume === 'number') soundVolume = parsed.soundVolume;
        if(typeof parsed.darkMode === 'boolean') darkMode = parsed.darkMode;
        if(typeof parsed.soundOn === 'boolean') soundOn = parsed.soundOn;
      }
    }catch(err){}
    applyDarkMode();
  }
  async function saveAppSettings(){
    try{ await appStorage.set(STORAGE_APPSETTINGS, JSON.stringify({soundVolume, darkMode, soundOn}), false); }catch(err){}
  }
  function applyDarkMode(){
    if(darkMode){
      document.documentElement.style.removeProperty('--bg-deep');
      document.documentElement.style.removeProperty('--bg-deep2');
      document.documentElement.style.removeProperty('--panel');
      document.documentElement.style.removeProperty('--panel-light');
      document.documentElement.style.removeProperty('--text');
      document.documentElement.style.removeProperty('--text-dim');
      applySkin(equippedSkin || 'default');
    } else {
      // ライトモード: 明るい配色に切り替え(ブロックの色自体はスキンのまま)
      document.documentElement.style.setProperty('--bg-deep', '#EDE7F6');
      document.documentElement.style.setProperty('--bg-deep2', '#F5F1FA');
      document.documentElement.style.setProperty('--panel', '#FFFFFF');
      document.documentElement.style.setProperty('--panel-light', '#F1EDF9');
      document.documentElement.style.setProperty('--text', '#2A1E38');
      document.documentElement.style.setProperty('--text-dim', '#8A7B9C');
    }
  }
  let dragState = null;

  let adminDisabledBlocks = [];
  let adminSafetyMode = false;

  const DAILY_STATS_DEFAULT = { linesCleared:0, piecesPlaced:0, combos:0, gamesPlayed:0, scoreEarned:0,
    bestSingleGameScore:0, tripleClearCount:0, maxComboStreak:0, hardModeGamesPlayed:0, maxNoClearStreak:0, bigPiecesPlaced:0 };
  let dailyStats = { ...DAILY_STATS_DEFAULT };
  let activeQuests = [];
  let questsCompletedCount = 0;

  let pendingMode = currentMode, pendingSize = SIZE;
  let authToken = null;
  const COOKIE_AUTH = 'candyblast_auth';
  async function saveAuthSession(token, id){
    try{ setCookie(COOKIE_AUTH, JSON.stringify({token, id}), 30); }catch(err){}
  }
  async function clearAuthSession(){
    try{ deleteCookie(COOKIE_AUTH); }catch(err){}
  }
  async function loadAuthSession(){
    try{
      const raw = getCookie(COOKIE_AUTH);
      if(raw){
        const parsed = JSON.parse(raw);
        return parsed.token ? parsed : null;
      }
    }catch(err){}
    return null;
  }
  // リロード後も安全にログイン状態を復元する。
  // トークンをローカルに保存し、起動時にサーバーへ検証リクエストを送って
  // 有効な場合のみ復元(無効/期限切れなら破棄してゲスト状態に戻す)。
  async function restoreSession(){
    const saved = await loadAuthSession();
    if(!saved) return false;
    authToken = saved.token;
    currentUserId = saved.id;
    try{
      const r = await fetch(`${API_BASE_URL}/api/sync`, { headers:{ 'Authorization':`Bearer ${authToken}` } });
      if(!r.ok) throw new Error('invalid session');
      const data = await r.json();
      applySyncData(data);
      updateAccountButton();
      startPlayTimeTracking();
      startUserSync();
      return true;
    }catch(err){
      authToken = null; currentUserId = null;
      await clearAuthSession();
      return false;
    }
  }
  let currentUserId = null;
  let playTime = 0;
  let playTimeInterval = null;

  // モード別ベストスコア
  let bestScores = { soft:0, baked:0, hard:0, extreme:0 };

  const STORAGE_BEST = 'candyblast-highscore';
  const STORAGE_BEST_SCORES = 'candyblast-bestScores-v1';
  const STORAGE_COINS = 'candyblast-coins';
  const STORAGE_QUESTS = 'candyblast-quests-v2';
  const STORAGE_SETTINGS = 'candyblast-settings-v1';
  const STORAGE_SKINS = 'candyblast-skins-v1';

  // ===================== ランキング用 =====================
  const RANKING_MODES = ['soft', 'baked', 'hard', 'extreme', 'tetris', 'timeattack'];
  const RANKING_MODE_LABELS = {
    soft: '🍮 柔らかい',
    baked: '🍪 焼成',
    hard: '🍬 硬い',
    extreme: '🧊 激硬',
    tetris: '🧱 テトリス',
    timeattack: '⏱ タイムアタック'
  };
  let currentRankingMode = 'soft';

  const RANKING_TYPES = ['score', 'coins', 'playtime'];
  const RANKING_TYPE_LABELS = {
    score: '🏆 スコア',
    coins: '🪙 コイン',
    playtime: '⏱️ プレイ時間'
  };
  let currentRankingType = 'score';
  let rankingPollInterval = null;
  let userSyncInterval = null;

  // ===================== ログイン中のユーザーデータをリアルタイム同期 =====================
  // 管理者コマンドでコインやスコアを変更されたときも、
  // 再ログインしなくても画面に反映されるように定期的にサーバーから取得する
  function startUserSync() {
    if (userSyncInterval) return;
    userSyncInterval = setInterval(() => { syncFromServer(); }, 5000);
  }
  function stopUserSync() {
    if (userSyncInterval) { clearInterval(userSyncInterval); userSyncInterval = null; }
  }

  function boardIndex(r,c){ return r*SIZE+c; }
  function todayKey(){ return new Date().toISOString().slice(0,10); }

  // ===================== プレイ時間計測 =====================
  function startPlayTimeTracking() {
    if (playTimeInterval) return;
    playTimeInterval = setInterval(() => { playTime++; }, 1000);
  }
  function stopPlayTimeTracking() {
    if (playTimeInterval) { clearInterval(playTimeInterval); playTimeInterval = null; }
  }
  function syncPlayTime() {
    if (!authToken) return;
    fetch(`${API_BASE_URL}/api/sync`, {
      method: 'POST',
      headers: { 'Content-Type':'application/json', 'Authorization':`Bearer ${authToken}` },
      body: JSON.stringify({ playTime })
    }).catch(() => {});
  }

  // ===================== ボード初期化 =====================
  function initBoard(){
    boardEl.innerHTML = ''; board = []; cellEls = [];
    const gap = SIZE<=8 ? 4 : (SIZE<=12 ? 3 : 2);
    const radius = SIZE<=8 ? 7 : (SIZE<=12 ? 5 : 3);
    boardEl.style.gridTemplateColumns = `repeat(${SIZE},1fr)`;
    boardEl.style.gridTemplateRows = `repeat(${SIZE},1fr)`;
    boardEl.style.gap = gap+'px';
    for(let r=0;r<SIZE;r++){
      for(let c=0;c<SIZE;c++){
        const cell = document.createElement('div');
        cell.className = 'cell';
        cell.style.borderRadius = radius+'px';
        boardEl.appendChild(cell);
        cellEls.push(cell);
        board.push({filled:false, colorIdx:-1});
      }
    }
  }

  function updateModeBadge(){
    if(currentMode==='tetris'){
      modeBadgeEl.textContent = ({ vs:'⚔️ テトリス VS AI', sprint:'🏁 テトリス スプリント', ultra:'⏳ テトリス ウルトラ', solo:'🧱 テトリス ソロ' })[tetrisRunMode] || '🧱 テトリス';
      return;
    }
    if(currentMode==='timeattack'){ modeBadgeEl.textContent = '⏱ タイムアタック'; return; }
    const m = MODES[currentMode];
    if(m) modeBadgeEl.textContent = `${m.emoji} ${m.label} · ${SIZE}×${SIZE}`;
  }

  // ===================== タイムアタックモード =====================
  const TIME_ATTACK_DURATION = 60; // 秒
  let timeAttackTimeLeft = 0;
  let timeAttackInterval = null;

  function updateTimeAttackDisplay(){
    const m = Math.floor(Math.max(0,timeAttackTimeLeft)/60);
    const s = Math.max(0,timeAttackTimeLeft) % 60;
    timeAttackValEl.textContent = `${m}:${String(s).padStart(2,'0')}`;
    timeAttackCardEl.classList.toggle('urgent', timeAttackTimeLeft<=10);
  }

  function stopTimeAttackTimer(){
    if(timeAttackInterval){ clearInterval(timeAttackInterval); timeAttackInterval = null; }
    timeAttackCardEl.style.display = 'none';
  }

  function startTimeAttackTimer(){
    stopTimeAttackTimer();
    timeAttackTimeLeft = TIME_ATTACK_DURATION;
    timeAttackCardEl.style.display = 'flex';
    updateTimeAttackDisplay();
    timeAttackInterval = setInterval(()=>{
      timeAttackTimeLeft--;
      updateTimeAttackDisplay();
      if(timeAttackTimeLeft<=5 && timeAttackTimeLeft>0) playSound('timer');
      if(timeAttackTimeLeft<=0){
        stopTimeAttackTimer();
        endGame();
      }
    }, 1000);
  }

  function startTimeAttackMode(){
    if(currentMode==='tetris') exitTetrisMode();
    currentMode = 'timeattack';
    SIZE = 8;
    saveSettings();
    updateModeBadge();
    overlayEl.classList.remove('show');
    score = 0; streak = 0; noClearStreak = 0;
    updateScoreUI();
    initBoard();
    fillTray();
    startTimeAttackTimer();
  }

  // ===================== 🆕 週替わりチャレンジ(ランダムな難易度・盤面サイズ、週1回) =====================
  async function fetchWeeklyChallenge(){
    try{
      const headers = {};
      if(authToken) headers['Authorization'] = `Bearer ${authToken}`;
      const r = await fetch(`${API_BASE_URL}/api/weekly-challenge`, { headers });
      return await r.json();
    }catch(err){ return null; }
  }

  async function openWeeklyChallengeModal(){
    modalContent.dataset.mode = 'weeklychallenge';
    modalContent.innerHTML = `<h2 style="color:var(--gold);">🎲 週替わりチャレンジ</h2><div class="empty-hint">読み込み中...</div>`;
    modalOverlay.classList.add('show');
    const data = await fetchWeeklyChallenge();
    if(!modalOverlay.classList.contains('show') || modalContent.dataset.mode!=='weeklychallenge') return;
    if(!data || !data.challenge){
      modalContent.innerHTML = `<h2 style="color:var(--gold);">🎲 週替わりチャレンジ</h2><div class="empty-hint">現在準備中です。しばらくお待ちください。</div>`;
      return;
    }
    const c = data.challenge;
    const modeLabel = (MODES[c.mode] && MODES[c.mode].label) || c.mode;
    let html = `<h2 style="color:var(--gold);">🎲 週替わりチャレンジ</h2>
      <div class="sub" style="margin-bottom:8px;">今週のお題: <b style="color:var(--mint);">${modeLabel} ${c.size}×${c.size}</b></div>
      <div class="sub">1人1回だけ挑戦できます。1位には🪙${formatNumber(c.reward)}コイン！</div>
      <div class="sub" style="color:var(--coral); font-weight:800; margin:6px 0 12px;">リセットまで: ${formatHMS(c.secondsUntilReset)}</div>`;
    if(!authToken){
      html += `<div class="empty-hint">挑戦するにはログインが必要です。</div>`;
    } else if(data.hasPlayed){
      html += `<div class="quest-item"><div class="qtitle">✅ 挑戦済み！ あなたのスコア: ${data.myScore}</div></div>`;
    } else {
      html += `<button class="primary-btn" id="weeklyChallengeStartBtn">🎲 挑戦する</button>`;
    }
    html += `<h3 style="color:var(--mint); margin:14px 0 8px;">🏆 ランキング TOP10</h3>`;
    if(!data.ranking || data.ranking.length===0){
      html += `<div class="empty-hint">まだ挑戦者がいません。一番乗りを目指そう！</div>`;
    } else {
      data.ranking.forEach((r,i)=>{
        html += `<div class="friend-item"><span class="fname">${i+1}. ${r.id}</span><span class="fsub">${r.score}点</span></div>`;
      });
    }
    modalContent.innerHTML = html;
    const startBtn = document.getElementById('weeklyChallengeStartBtn');
    if(startBtn) startBtn.addEventListener('click', ()=>{
      closeModal();
      startWeeklyChallenge(c);
    });
  }

  function startWeeklyChallenge(challenge){
    if(currentMode==='tetris') exitTetrisMode();
    if(currentMode==='timeattack') stopTimeAttackTimer();
    weeklyChallengeActive = true;
    weeklyChallengeInfo = challenge;
    currentMode = challenge.mode;
    SIZE = challenge.size;
    const modeLabel = (MODES[challenge.mode] && MODES[challenge.mode].label) || challenge.mode;
    modeBadgeEl.textContent = `🎲 週替わり: ${modeLabel} ${SIZE}×${SIZE}`;
    overlayEl.classList.remove('show');
    score = 0; streak = 0; noClearStreak = 0;
    scoreValEl.textContent = '0';
    initBoard();
    fillTray();
  }

  // ===================== 🎰 ガチャ(限定スキン、天井あり) =====================
  async function fetchGachaState(){
    if(!authToken) return null;
    try{
      const r = await fetch(`${API_BASE_URL}/api/gacha/state`, { headers:{ 'Authorization':`Bearer ${authToken}` } });
      if(!r.ok) return null;
      return await r.json();
    }catch(err){ return null; }
  }

  async function openGachaModal(){
    modalContent.dataset.mode = 'gacha';
    if(!authToken){
      modalContent.innerHTML = `<h2 style="color:var(--gold);">🎰 ガチャ</h2><div class="empty-hint">ログインするとガチャに挑戦できます。</div>`;
      modalOverlay.classList.add('show');
      return;
    }
    modalContent.innerHTML = `<h2 style="color:var(--gold);">🎰 ガチャ</h2><div class="empty-hint">読み込み中...</div>`;
    modalOverlay.classList.add('show');
    const state = await fetchGachaState();
    if(!modalOverlay.classList.contains('show') || modalContent.dataset.mode!=='gacha') return;
    renderGachaModal(state);
  }

  let gachaRateInfo = { ratePerSkin:0.01, rateTotal:0.08 };   // サーバーの排出率(表示用)。再描画でも保持する
  function renderGachaModal(state){
    if(state && state.rateTotal != null) gachaRateInfo = { ratePerSkin: state.ratePerSkin, rateTotal: state.rateTotal };
    if(!state){
      modalContent.innerHTML = `<h2 style="color:var(--gold);">🎰 ガチャ</h2><div class="empty-hint">読み込みに失敗しました。</div>`;
      return;
    }
    const pityPct = Math.min(100, Math.round((state.pityCounter / state.pityThreshold) * 100));
    const tickets = state.freeTickets || 0;
    const canOne = state.coins >= state.cost || tickets > 0;
    const ticketsFor10 = Math.min(tickets, 10);
    const coinsFor10 = (10 - ticketsFor10) * state.cost;
    const canTen = state.coins >= coinsFor10;
    const gachaSkinCards = GACHA_SKINS.map(s=>`
      <div class="skin-swatches" style="margin-bottom:2px;">${buildPatternedColors(s.colors).slice(0,4).map(c=>`<span class="swatch" style="background:${c.bg}"></span>`).join('')}</div>
    `).join('');
    let html = `
      <h2 style="color:var(--gold);">🎰 ガチャ</h2>
      <div class="sub" style="margin-bottom:8px;">1回 🪙${formatNumber(state.cost)}。ガチャ限定スキンが手に入ります(被った場合は🪙${formatNumber(500)}に還元)。</div>
      <div class="sub" style="margin-bottom:8px;">📊 排出率: 1スキンあたり ${(gachaRateInfo.ratePerSkin*100).toFixed(2).replace(/\.?0+$/,'')}% ／ 合計 ${(gachaRateInfo.rateTotal*100).toFixed(2).replace(/\.?0+$/,'')}%</div>
      <div class="quest-item" style="text-align:center;">
        <div class="qtitle">🐉🔥👑 ガチャ限定スキン</div>
        ${gachaSkinCards}
        <div class="sub" style="margin-top:6px;">天井: ${state.pityThreshold}回以内に必ず1つ獲得できます</div>
        <div class="quest-bar-bg" style="margin-top:8px;"><div class="quest-bar-fill" style="width:${pityPct}%"></div></div>
        <div class="sub" style="margin-top:4px;">天井まで: ${state.pityCounter} / ${state.pityThreshold}回</div>
      </div>
      <div class="sub" style="margin:8px 0; text-align:center;">🪙 所持: ${formatNumber(state.coins)}${state.freeTickets>0 ? ` ／ 🎫 無料チケット: ${state.freeTickets}枚` : ''}</div>
      <div style="display:flex; gap:8px;">
        <button class="primary-btn" data-gachacount="1" style="flex:1;" ${canOne?'':'disabled'}>
          ${tickets>0 ? '🎫 チケットで1回' : `🎰 1回 (🪙${formatNumber(state.cost)})`}
        </button>
        <button class="primary-btn" data-gachacount="10" style="flex:1;" ${canTen?'':'disabled'}>
          🎰 10連 (🪙${formatNumber(coinsFor10)}${ticketsFor10>0?` ＋🎫×${ticketsFor10}`:''})
        </button>
      </div>
      <div id="gachaResultArea" style="margin-top:10px;"></div>
    `;
    modalContent.innerHTML = html;
    modalContent.querySelectorAll('[data-gachacount]').forEach(b=>{
      b.addEventListener('click', ()=>performGachaPull(parseInt(b.dataset.gachacount)));
    });
  }

  function gachaSkinName(id){ return (SKINS.find(s=>s.id===id) || {}).name || id; }

  function gachaSingleResultHtml(r){
    if(r.resultType === 'win'){
      const skin = GACHA_SKINS.find(s=>s.id===r.skinId);
      return `
        <div class="quest-item" style="text-align:center; border:2px solid var(--gold);">
          <div class="qtitle" style="font-size:16px;">${r.pityTriggered?'🎯 天井達成！':'🎉 大当たり！'}</div>
          <div class="skin-swatches" style="justify-content:center; margin:8px 0;">${buildPatternedColors(skin.colors).map(c=>`<span class="swatch" style="background:${c.bg}"></span>`).join('')}</div>
          <div style="font-weight:800;">${skin.name} を獲得しました！</div>
        </div>`;
    }
    if(r.resultType === 'duplicate'){
      return `<div class="quest-item" style="text-align:center;">
        <div class="qtitle">${gachaSkinName(r.skinId)} が被りました…</div>
        <div class="sub">代わりに 🪙${formatNumber(r.coinsGained)} を獲得しました。</div>
      </div>`;
    }
    return `<div class="quest-item" style="text-align:center;">
      <div class="qtitle">残念、ハズレ…</div>
      <div class="sub">🪙${formatNumber(r.coinsGained)} を獲得しました。</div>
    </div>`;
  }

  function gachaMultiResultHtml(results){
    const wins = results.filter(r=>r.resultType==='win');
    const dups = results.filter(r=>r.resultType==='duplicate');
    const misses = results.filter(r=>r.resultType==='miss');
    const refund = results.reduce((sum,r)=>sum+(r.coinsGained||0), 0);
    const rows = results.map((r,i)=>{
      let label, style = '';
      if(r.resultType==='win'){
        label = `${r.pityTriggered?'🎯':'🎉'} ${gachaSkinName(r.skinId)} 獲得！`;
        style = 'color:var(--gold); font-weight:800;';
      } else if(r.resultType==='duplicate'){
        label = `🔁 ${gachaSkinName(r.skinId)} 被り (+🪙${formatNumber(r.coinsGained)})`;
      } else {
        label = `ハズレ (+🪙${formatNumber(r.coinsGained)})`;
        style = 'opacity:.7;';
      }
      return `<div class="sub" style="${style} text-align:left; margin:2px 0;">${i+1}. ${label}</div>`;
    }).join('');
    return `<div class="quest-item" style="text-align:center; ${wins.length?'border:2px solid var(--gold);':''}">
      <div class="qtitle" style="font-size:16px;">${wins.length?'🎉 ':''}10連結果</div>
      <div class="sub" style="margin:4px 0 8px;">大当たり ${wins.length} ／ 被り ${dups.length} ／ ハズレ ${misses.length} ／ 還元 🪙${formatNumber(refund)}</div>
      ${rows}
    </div>`;
  }

  async function performGachaPull(count){
    count = (count === 10) ? 10 : 1;
    const resultArea = document.getElementById('gachaResultArea');
    const btns = modalContent.querySelectorAll('[data-gachacount]');
    btns.forEach(b=>b.disabled = true);
    resultArea.innerHTML = `<div class="empty-hint">🎰 抽選中...</div>`;
    try{
      const res = await fetch(`${API_BASE_URL}/api/gacha/pull`, {
        method:'POST',
        headers:{ 'Content-Type':'application/json', 'Authorization':`Bearer ${authToken}` },
        body: JSON.stringify({ count })
      });
      const data = await res.json();
      if(!res.ok) throw new Error(data.error || '抽選に失敗しました');

      const results = (Array.isArray(data.results) && data.results.length) ? data.results : [data];
      ownedSkins = data.ownedSkins;
      saveSkinsData();
      if(results.some(r=>r.resultType==='win' || r.resultType==='duplicate')) playSound('coin');
      const resultHtml = (count === 1) ? gachaSingleResultHtml(results[0]) : gachaMultiResultHtml(results);

      coins = data.coins;
      updateCoinUI();
      renderGachaModal({
        coins: data.coins, totalPulls: data.totalPulls, pityCounter: data.pityCounter,
        pityThreshold: data.pityThreshold, cost: GACHA_COST_CLIENT, freeTickets: data.freeTickets, ownedSkins: data.ownedSkins
      });
      // 結果表示だけは再描画後も残したいので差し込み直す
      document.getElementById('gachaResultArea').innerHTML = resultHtml;
    }catch(err){
      resultArea.innerHTML = `<div class="empty-hint">${err.message}</div>`;
      btns.forEach(b=>b.disabled = false);
    }
  }
  const GACHA_COST_CLIENT = 2000; // サーバー側のGACHA_COSTと合わせておくための表示用フォールバック

  // ===================== 🎫 バトルパス(経験値でレベルアップ、報酬はループ、レベル上限なし) =====================
  async function fetchBattlePassState(){
    if(!authToken) return null;
    try{
      const r = await fetch(`${API_BASE_URL}/api/battlepass/state`, { headers:{ 'Authorization':`Bearer ${authToken}` } });
      if(!r.ok) return null;
      return await r.json();
    }catch(err){ return null; }
  }

  async function openBattlePassModal(){
    modalContent.dataset.mode = 'battlepass';
    if(!authToken){
      modalContent.innerHTML = `<h2 style="color:var(--gold);">🎫 バトルパス</h2><div class="empty-hint">ログインするとバトルパスに参加できます。</div>`;
      modalOverlay.classList.add('show');
      return;
    }
    modalContent.innerHTML = `<h2 style="color:var(--gold);">🎫 バトルパス</h2><div class="empty-hint">読み込み中...</div>`;
    modalOverlay.classList.add('show');
    const state = await fetchBattlePassState();
    if(!modalOverlay.classList.contains('show') || modalContent.dataset.mode!=='battlepass') return;
    renderBattlePassModal(state);
  }

  function battlePassRewardLabel(reward){
    if(reward.type==='coins') return `🪙 ${formatNumber(reward.amount)}コイン`;
    if(reward.type==='gacha_ticket') return `🎫 ガチャ無料チケット×${reward.amount}`;
    return '???';
  }

  function renderBattlePassModal(state, noticeHtml){
    if(!state){
      modalContent.innerHTML = `<h2 style="color:var(--gold);">🎫 バトルパス</h2><div class="empty-hint">読み込みに失敗しました。</div>`;
      return;
    }
    const pct = Math.round((state.xpIntoLevel / state.xpPerLevel) * 100);
    const unclaimed = state.rewards.filter(r=>!r.claimed);
    const totCoins = unclaimed.filter(r=>r.type==='coins').reduce((sum,r)=>sum+r.amount, 0);
    const totTickets = unclaimed.filter(r=>r.type==='gacha_ticket').reduce((sum,r)=>sum+r.amount, 0);
    let html = `
      <h2 style="color:var(--gold);">🎫 バトルパス</h2>
      <div class="sub" style="margin-bottom:8px;">ゲームをプレイして経験値を貯めよう。レベル上限はなく、報酬は10レベルごとにループします。</div>
      <div class="quest-item" style="text-align:center;">
        <div class="qtitle" style="font-size:20px;">Lv. ${state.level}</div>
        <div class="quest-bar-bg" style="margin-top:8px;"><div class="quest-bar-fill" style="width:${pct}%"></div></div>
        <div class="sub" style="margin-top:4px;">${state.xpIntoLevel} / ${state.xpPerLevel} XP</div>
      </div>
      ${noticeHtml || ''}
      <button class="primary-btn" id="bpClaimAllBtn" style="margin-top:10px;" ${unclaimed.length?'':'disabled'}>
        ${unclaimed.length
          ? `🎁 まとめて受け取る (${unclaimed.length}件: 🪙${formatNumber(totCoins)}${totTickets?` ＋🎫×${totTickets}`:''})`
          : '🎁 受け取れる報酬はありません'}
      </button>
      <h3 style="color:var(--mint); margin:14px 0 8px;">🎁 報酬一覧</h3>
    `;
    state.rewards.slice().reverse().forEach(r=>{
      html += `
        <div class="quest-item">
          <div class="quest-foot">
            <span>Lv.${r.level} — ${battlePassRewardLabel(r)}</span>
            <button class="claim-btn" data-bplevel="${r.level}" ${r.claimed?'disabled':''}>${r.claimed?'受取済み':'受け取る'}</button>
          </div>
        </div>`;
    });
    modalContent.innerHTML = html;
    modalContent.querySelectorAll('[data-bplevel]').forEach(btn=>{
      btn.addEventListener('click', ()=>claimBattlePassLevel(parseInt(btn.dataset.bplevel)));
    });
    const claimAllBtn = document.getElementById('bpClaimAllBtn');
    if(claimAllBtn) claimAllBtn.addEventListener('click', claimAllBattlePass);
  }

  async function claimAllBattlePass(){
    const btn = document.getElementById('bpClaimAllBtn');
    if(btn) btn.disabled = true;
    try{
      const res = await fetch(`${API_BASE_URL}/api/battlepass/claim-all`, {
        method:'POST',
        headers:{ 'Content-Type':'application/json', 'Authorization':`Bearer ${authToken}` }
      });
      const data = await res.json();
      if(!res.ok) throw new Error(data.error);
      coins = data.coins;
      updateCoinUI();
      playSound('coin');
      const state = await fetchBattlePassState();
      const notice = `<div class="quest-item" style="text-align:center; border:2px solid var(--gold); margin-top:10px;">
        <div class="qtitle">🎁 ${data.claimedCount}件まとめて受け取りました！</div>
        <div class="sub">🪙${formatNumber(data.totalCoins)}${data.totalTickets?` ／ 🎫 ガチャ無料チケット×${data.totalTickets}`:''}</div>
      </div>`;
      renderBattlePassModal(state, notice);
    }catch(err){
      alert(err.message);
      if(btn) btn.disabled = false;
    }
  }

  async function claimBattlePassLevel(level){
    try{
      const res = await fetch(`${API_BASE_URL}/api/battlepass/claim`, {
        method:'POST',
        headers:{ 'Content-Type':'application/json', 'Authorization':`Bearer ${authToken}` },
        body: JSON.stringify({ level })
      });
      const data = await res.json();
      if(!res.ok) throw new Error(data.error);
      coins = data.coins;
      updateCoinUI();
      playSound('coin');
      const state = await fetchBattlePassState();
      renderBattlePassModal(state);
    }catch(err){
      alert(err.message);
    }
  }

  // ゲームプレイに応じてバトルパスの経験値を加算する(スコア10点=1XP換算、サーバー側でも上限チェックあり)
  function grantBattlePassXp(scoreGained){
    if(!authToken || scoreGained<=0) return;
    const xp = Math.floor(scoreGained / 10);
    if(xp<=0) return;
    fetch(`${API_BASE_URL}/api/battlepass/addxp`, {
      method:'POST',
      headers:{ 'Content-Type':'application/json', 'Authorization':`Bearer ${authToken}` },
      body: JSON.stringify({ amount: xp })
    }).catch(()=>{});
  }

  function applyMode(mode, size){
    if(mode==='tetris'){
      enterTetrisMode();
      return;
    }
    if(mode==='timeattack'){
      startTimeAttackMode();
      return;
    }
    if(currentMode==='tetris') exitTetrisMode();
    if(currentMode==='timeattack') stopTimeAttackTimer();
    currentMode = MODES[mode] ? mode : 'baked';
    SIZE = (currentMode==='extreme') ? 8 : Math.min(18, Math.max(5, size||8));
    saveSettings();
    updateModeBadge();
    overlayEl.classList.remove('show');
    score = 0; streak = 0; noClearStreak = 0;
    updateScoreUI();
    initBoard();
    fillTray();
  }

  function randomShapeColor(shape){
    return { shape, colorIdx: Math.floor(Math.random()*COLORS.length), used:false };
  }

  function boardFullnessRatio(){
    let filled = 0;
    for(let i=0;i<board.length;i++) if(board[i].filled) filled++;
    return filled / board.length;
  }

  function countValidPlacements(shape, pool){
    const shapes = pool || SHAPES;
    let count = 0;
    for(let r=0;r<SIZE;r++){
      for(let c=0;c<SIZE;c++){
        if(canPlaceAt(shape, r, c)) count++;
      }
    }
    return count;
  }

  function pickAdaptiveShape(aggressive, pool){
    const shapes = pool || SHAPES;
    const fullness = boardFullnessRatio();
    const threshold = aggressive ? 0.12 : 0.4;
    const maxBias = aggressive ? 6.0 : 3.2;
    const biasPower = fullness < threshold ? (aggressive ? 1.4 : 0) : ((fullness - threshold) / (1 - threshold)) * maxBias;
    if(biasPower <= 0) return shapes[Math.floor(Math.random()*shapes.length)];
    let totalWeight = 0;
    const weights = shapes.map(shape=>{
      const validCount = countValidPlacements(shape, shapes);
      const sizeBonus = 1 / shape.length;
      const weight = Math.pow(validCount + 0.05, biasPower) * (1 + sizeBonus);
      totalWeight += weight;
      return weight;
    });
    let r = Math.random() * totalWeight;
    for(let i=0;i<shapes.length;i++){
      r -= weights[i];
      if(r <= 0) return shapes[i];
    }
    return shapes[shapes.length-1];
  }

  function pickWeightedBigShape(pool){
    const shapes = pool || SHAPES;
    let totalWeight = 0;
    const weights = shapes.map(shape=>{
      const w = Math.pow(shape.length, 2.2);
      totalWeight += w;
      return w;
    });
    let r = Math.random() * totalWeight;
    for(let i=0;i<shapes.length;i++){
      r -= weights[i];
      if(r <= 0) return shapes[i];
    }
    return shapes[shapes.length-1];
  }

  function pickShapeForMode(pool){
    const shapes = pool || SHAPES;
    if(currentMode==='soft') return pickAdaptiveShape(true, shapes);
    if(currentMode==='hard') return shapes[Math.floor(Math.random()*shapes.length)];
    if(currentMode==='extreme') return pickWeightedBigShape(shapes);
    return pickAdaptiveShape(false, shapes);
  }

function ensurePlayable(){
    // 全モードで「置けなくなったらゲームオーバー」に統一
    return;
}

  function fillTray(){
    let availableShapes = SHAPES;
    if (currentUserId === ADMIN_USER_ID && adminDisabledBlocks.length > 0) {
      availableShapes = SHAPES.filter((_, idx) => !adminDisabledBlocks.includes(idx));
      if (availableShapes.length === 0) availableShapes = SHAPES;
    }
    tray = [
      randomShapeColor(pickShapeForMode(availableShapes)),
      randomShapeColor(pickShapeForMode(availableShapes)),
      randomShapeColor(pickShapeForMode(availableShapes))
    ];
    ensurePlayable();
    renderTray();
    setTimeout(checkGameOver, 50);
  }

  function shapeBounds(shape){
    let maxR=0, maxC=0;
    shape.forEach(([r,c])=>{ maxR=Math.max(maxR,r); maxC=Math.max(maxC,c); });
    return {rows:maxR+1, cols:maxC+1};
  }

  function renderTray(){
    trayEl.innerHTML = '';
    tray.forEach((piece, idx)=>{
      const slot = document.createElement('div');
      slot.className = 'tray-slot';
      slot.dataset.idx = idx;
      if(!piece.used){
        const {rows, cols} = shapeBounds(piece.shape);
        const cellPx = Math.max(14, Math.min(24, Math.floor(68/Math.max(rows,cols))));
        const grid = document.createElement('div');
        grid.className = 'piece-grid';
        grid.style.gridTemplateColumns = `repeat(${cols}, ${cellPx}px)`;
        grid.style.gridTemplateRows = `repeat(${rows}, ${cellPx}px)`;
        for(let r=0;r<rows;r++){
          for(let c=0;c<cols;c++){
            const filled = piece.shape.some(([sr,sc])=>sr===r&&sc===c);
            const cd = document.createElement('div');
            cd.className = 'piece-cell' + (filled?'':' empty');
            if(filled) cd.style.background = COLORS[piece.colorIdx].bg;
            grid.appendChild(cd);
          }
        }
        slot.appendChild(grid);
        slot.addEventListener('pointerdown', (e)=>startDrag(e, idx));
      }
      trayEl.appendChild(slot);
    });
  }

  function canPlaceAt(shape, baseR, baseC){
    for(const [dr,dc] of shape){
      const r = baseR+dr, c = baseC+dc;
      if(r<0||r>=SIZE||c<0||c>=SIZE) return false;
      if(board[boardIndex(r,c)].filled) return false;
    }
    return true;
  }
  function anyValidPlacement(shape){
    if(!Array.isArray(shape) || shape.length===0) return false; // 空/不正な形状は「置ける場所なし」として扱う(以前はtrueになりゲームオーバーを妨げていた)
    for(let r=0;r<SIZE;r++) for(let c=0;c<SIZE;c++) if(canPlaceAt(shape,r,c)) return true;
    return false;
  }
  function checkGameOver(){
    try{
      if (currentUserId === ADMIN_USER_ID && adminSafetyMode) {
        if (tray.every(p => p.used)) fillTray();
        return;
      }
      const remaining = tray.filter(p=>!p.used);
      const stillPossible = remaining.some(p=>anyValidPlacement(p.shape));
      if(!stillPossible && remaining.length>0) endGame();
    }catch(err){
      // ここで例外が起きて握りつぶされると「盤面が埋まっているのにゲームオーバーにならない」
      // という不具合になるため、必ずログを残しつつ、安全側(ゲームオーバー扱い)に倒す
      console.error('checkGameOverでエラーが発生しました:', err);
      const remaining = (tray||[]).filter(p=>p && !p.used);
      if(remaining.length>0) endGame();
    }
  }

  // ===================== ドラッグ操作 =====================
  function startDrag(e, trayIdx){
    e.preventDefault();
    unlockAudio();
    const piece = tray[trayIdx];
    if(!piece || piece.used) return;
    const boardRect = boardEl.getBoundingClientRect();
    const cellSize = (boardRect.width - 16) / SIZE;
    const {rows, cols} = shapeBounds(piece.shape);
    dragState = { trayIdx, piece, cellSize, boardRect, grabDX: cellSize*0.5, grabDY: cellSize*0.5 + 46, lastValid:false, lastR:-1, lastC:-1 };
    const slot = trayEl.querySelector(`.tray-slot[data-idx="${trayIdx}"]`);
    if(slot) slot.classList.add('dragging-source');
    ghostEl.innerHTML = '';
    ghostEl.style.gridTemplateColumns = `repeat(${cols}, ${cellSize}px)`;
    ghostEl.style.gridTemplateRows = `repeat(${rows}, ${cellSize}px)`;
    for(let r=0;r<rows;r++){
      for(let c=0;c<cols;c++){
        const filled = piece.shape.some(([sr,sc])=>sr===r&&sc===c);
        const gd = document.createElement('div');
        gd.className = 'ghost-cell' + (filled?'':' empty');
        if(filled) gd.style.background = COLORS[piece.colorIdx].bg;
        ghostEl.appendChild(gd);
      }
    }
    ghostEl.style.display = 'grid';
    updateGhostPosition(e.clientX, e.clientY);
    document.addEventListener('pointermove', onDragMove);
    document.addEventListener('pointerup', onDragEnd);
  }

  function updateGhostPosition(x,y){
    ghostEl.style.left = (x - dragState.grabDX) + 'px';
    ghostEl.style.top = (y - dragState.grabDY) + 'px';
  }

  function onDragMove(e){
    if(!dragState) return;
    updateGhostPosition(e.clientX, e.clientY);
    const rect = dragState.boardRect, cs = dragState.cellSize;
    const relX = (e.clientX - dragState.grabDX) - (rect.left+8);
    const relY = (e.clientY - dragState.grabDY) - (rect.top+8);
    const baseC = Math.round(relX / cs), baseR = Math.round(relY / cs);
    const valid = canPlaceAt(dragState.piece.shape, baseR, baseC);
    clearPreview();
    dragState.piece.shape.forEach(([dr,dc])=>{
      const r=baseR+dr, c=baseC+dc;
      if(r>=0&&r<SIZE&&c>=0&&c<SIZE) cellEls[boardIndex(r,c)].classList.add(valid?'preview-ok':'preview-bad');
    });
    dragState.lastValid = valid; dragState.lastR = baseR; dragState.lastC = baseC;
  }
  function clearPreview(){ cellEls.forEach(cell=>cell.classList.remove('preview-ok','preview-bad')); }

  function onDragEnd(e){
    document.removeEventListener('pointermove', onDragMove);
    document.removeEventListener('pointerup', onDragEnd);
    if(!dragState) return;
    const {piece, trayIdx, lastValid, lastR, lastC} = dragState;
    clearPreview();
    ghostEl.style.display = 'none';
    const slot = trayEl.querySelector(`.tray-slot[data-idx="${trayIdx}"]`);
    if(slot) slot.classList.remove('dragging-source');
    if(lastValid) commitPlacement(piece, lastR, lastC, trayIdx);
    dragState = null;
  }

  function commitPlacement(piece, baseR, baseC, trayIdx){
    piece.shape.forEach(([dr,dc])=>{
      const r=baseR+dr, c=baseC+dc, idx = boardIndex(r,c);
      board[idx] = {filled:true, colorIdx:piece.colorIdx};
      const cellEl = cellEls[idx];
      cellEl.className = 'cell filled just-placed';
      cellEl.style.background = COLORS[piece.colorIdx].bg;
    });
    playSound('place');
    addScore(piece.shape.length * 10);
    dailyStats.piecesPlaced += 1;
    if(piece.shape.length >= 5) dailyStats.bigPiecesPlaced = (dailyStats.bigPiecesPlaced||0) + 1;
    tray[trayIdx].used = true;
    renderTray();
    setTimeout(()=>{ resolveLines(); }, 80);
  }

  function resolveLines(){
    const fullRows = [], fullCols = [];
    for(let r=0;r<SIZE;r++){ let full=true; for(let c=0;c<SIZE;c++) if(!board[boardIndex(r,c)].filled){ full=false; break; } if(full) fullRows.push(r); }
    for(let c=0;c<SIZE;c++){ let full=true; for(let r=0;r<SIZE;r++) if(!board[boardIndex(r,c)].filled){ full=false; break; } if(full) fullCols.push(c); }
    const linesCleared = fullRows.length + fullCols.length;
    if(linesCleared>0){
      streak++;
      noClearStreak = 0;
      dailyStats.linesCleared += linesCleared;
      dailyStats.maxComboStreak = Math.max(dailyStats.maxComboStreak||0, streak);
      if(linesCleared>=2) dailyStats.combos += 1;
      if(linesCleared>=3) dailyStats.tripleClearCount = (dailyStats.tripleClearCount||0) + 1;
      const cellsToClear = new Set();
      fullRows.forEach(r=>{ for(let c=0;c<SIZE;c++) cellsToClear.add(boardIndex(r,c)); });
      fullCols.forEach(c=>{ for(let r=0;r<SIZE;r++) cellsToClear.add(boardIndex(r,c)); });
      cellsToClear.forEach(idx=>{ cellEls[idx].classList.add('clearing'); spawnConfetti(cellEls[idx], linesCleared); });
      playSound('clear', linesCleared);
      // ===== コンボ倍率(連続でライン消去するほどスコア倍率が上がる。効果はスコア倍率のみ) =====
      const lineScore = linesCleared*100*linesCleared;
      const comboMultiplier = Math.min(4, 1 + (streak-1)*0.25);
      const totalLineScore = Math.round(lineScore * comboMultiplier);
      addScore(totalLineScore);
      showCombo(linesCleared, streak, comboMultiplier);
      updateQuestProgress();

      // 派手な演出: 大きめコンボでは画面シェイク＋衝撃波リング
      if(linesCleared>=2 || streak>=3){
        boardWrapEl.classList.remove('shake'); void boardWrapEl.offsetWidth; boardWrapEl.classList.add('shake');
        spawnShockRing();
      }

      const totalFilled = board.reduce((sum, cell) => sum + (cell.filled ? 1 : 0), 0);
      if (totalFilled === 0 && linesCleared > 0) {
        const bonus = linesCleared * 800 + 1500 + streak * 200;
        addScore(bonus);
        showComboText(`✨ 全消しボーナス +${bonus}点!`);
        spawnAllClearCelebration();
      }

      setTimeout(()=>{
        cellsToClear.forEach(idx=>{ board[idx] = {filled:false, colorIdx:-1}; cellEls[idx].className='cell'; cellEls[idx].style.background=''; });
        if(tray.every(p=>p.used)) fillTray(); else checkGameOver();
      }, 360);
    } else {
      streak = 0;
      noClearStreak++;
      dailyStats.maxNoClearStreak = Math.max(dailyStats.maxNoClearStreak||0, noClearStreak);
      if(tray.every(p=>p.used)) fillTray(); else checkGameOver();
    }
  }

  function showCombo(linesCleared, streakVal, multiplier){
    if(linesCleared<2 && streakVal<2) return;
    let msg = '';
    if(linesCleared>=2) msg = `COMBO x${linesCleared}!`;
    if(streakVal>=2) msg += (msg?'  ':'') + `🔥x${streakVal}`;
    if(multiplier && multiplier>1) msg += (msg?'  ':'') + `倍率×${multiplier.toFixed(2)}`;
    comboTextEl.textContent = msg;
    // 大きいコンボほど文字を派手に大きく・強調
    const bigness = Math.min(1.6, 1 + (Math.max(linesCleared,streakVal)-1)*0.12);
    comboTextEl.style.setProperty('--combo-scale', bigness);
    comboTextEl.className = 'combo-text show' + (Math.max(linesCleared,streakVal)>=4 ? ' mega' : '');
    setTimeout(() => { comboTextEl.className = 'combo-text'; }, 900);
  }

  function showComboText(msg){
    comboTextEl.textContent = msg;
    comboTextEl.className = 'combo-text bonus show mega';
    setTimeout(() => { comboTextEl.className = 'combo-text'; }, 900);
  }

  function spawnConfetti(cellEl, intensity){
    const rect = cellEl.getBoundingClientRect();
    const cx = rect.left+rect.width/2, cy = rect.top+rect.height/2;
    const count = 5 + Math.min(10, (intensity||1)*3);
    for(let i=0;i<count;i++){
      const p = document.createElement('div');
      p.className='confetti';
      p.style.background = COLORS[Math.floor(Math.random()*COLORS.length)].bg;
      p.style.left=cx+'px'; p.style.top=cy+'px';
      const size = 6 + Math.random()*6;
      p.style.width = size+'px'; p.style.height = size+'px';
      const angle=Math.random()*Math.PI*2, dist=40+Math.random()*(70+((intensity||1)*8));
      p.style.setProperty('--dx', Math.cos(angle)*dist+'px');
      p.style.setProperty('--dy', Math.sin(angle)*dist+'px');
      p.style.setProperty('--rot', (Math.random()*720-360)+'deg');
      p.style.animation=`confettiBurst ${0.5+Math.random()*0.3}s ease-out forwards`;
      document.body.appendChild(p);
      setTimeout(()=>p.remove(),900);
    }
  }

  function spawnShockRing(){
    if(!boardWrapEl) return;
    const ring = document.createElement('div');
    ring.className = 'shock-ring';
    boardWrapEl.appendChild(ring);
    setTimeout(()=>ring.remove(), 650);
  }

  // ===================== 全消し演出（画面フラッシュ＋大量紙吹雪＋星） =====================
  function spawnAllClearCelebration(){
    playSound('clear');
    const flash = document.createElement('div');
    flash.className = 'screen-flash';
    document.body.appendChild(flash);
    setTimeout(()=>flash.remove(), 600);

    const rect = boardWrapEl ? boardWrapEl.getBoundingClientRect() : {left:innerWidth/2, top:innerHeight/2, width:0, height:0};
    const cx = rect.left+rect.width/2, cy = rect.top+rect.height/2;
    const stars = ['✨','⭐','🍬','🎉','💫'];
    for(let i=0;i<28;i++){
      const s = document.createElement('div');
      s.className = 'star-particle';
      s.textContent = stars[Math.floor(Math.random()*stars.length)];
      const angle = Math.random()*Math.PI*2, dist = 60+Math.random()*220;
      s.style.setProperty('--sx0', '0px'); s.style.setProperty('--sy0','0px');
      s.style.setProperty('--sx1', Math.cos(angle)*dist+'px');
      s.style.setProperty('--sy1', Math.sin(angle)*dist+'px');
      s.style.left = cx+'px'; s.style.top = cy+'px';
      s.style.animationDelay = (Math.random()*0.15)+'s';
      document.body.appendChild(s);
      setTimeout(()=>s.remove(), 1000);
    }
    for(let i=0;i<3;i++){
      setTimeout(()=>spawnShockRing(), i*120);
    }
    if(boardWrapEl){
      boardWrapEl.classList.remove('shake'); void boardWrapEl.offsetWidth; boardWrapEl.classList.add('shake');
    }
  }

  function floatCoin(amount){
    const rect = boardEl.getBoundingClientRect();
    const el = document.createElement('div');
    el.className='coin-float';
    el.textContent = `+${amount}🪙`;
    el.style.left = (rect.left+rect.width/2-20)+'px';
    el.style.top = (rect.top+rect.height/2)+'px';
    el.style.animation='coinFloat 0.9s ease-out forwards';
    document.body.appendChild(el);
    setTimeout(()=>el.remove(),950);
  }

  // ===================== スコア周り（リアルタイム同期対応） =====================
  let lastSyncTime = 0;
  let weeklyChallengeActive = false;
  let weeklyChallengeInfo = null;

  function syncBestScore() {
    if (!authToken || weeklyChallengeActive) return; // 週替わりチャレンジは通常のベストスコアを汚さない
    // 現在のモードのベストを更新
    const currentBest = bestScores[currentMode] || 0;
    if (score > currentBest) {
      bestScores[currentMode] = score;
      if (isRegularMode(currentMode)) {
        // 全体ベストも更新（表示用）
        best = Math.max(best, score);
        bestValEl.textContent = best;
      } else {
        animateNumberTo(bestValEl, score);
      }
      saveBestScores();
      // サーバーへ送信（スロットリング: 2秒に1回まで）
      const now = Date.now();
      if (now - lastSyncTime > 2000) {
        lastSyncTime = now;
        syncToServer();
      }
    }
  }

  let sessionScoreForXp = 0;
  function addScore(amount){
    score += amount;
    sessionScoreForXp += amount;
    dailyStats.scoreEarned += amount;
    dailyStats.bestSingleGameScore = Math.max(dailyStats.bestSingleGameScore||0, score);
    updateScoreUI();
    // リアルタイムでベストスコアを同期（必要に応じて）
    syncBestScore();
  }

  function isRegularMode(m){ return m==='soft' || m==='baked' || m==='hard' || m==='extreme'; }

  function updateScoreUI(){
    const curScore = parseInt(scoreValEl.textContent,10) || 0;
    if(score < curScore){ scoreValEl.textContent = score; } else { animateNumberTo(scoreValEl, score); }
    if(weeklyChallengeActive) return; // 週替わりチャレンジ中は通常のベスト表示を更新しない
    const curBest = parseInt(bestValEl.textContent,10) || 0;
    if(isRegularMode(currentMode)){
      const maxBest = Math.max(bestScores.soft, bestScores.baked, bestScores.hard, bestScores.extreme);
      if (maxBest > best) {
        best = maxBest;
        saveBestScores();
      }
      if(best < curBest){ bestValEl.textContent = best; } else { animateNumberTo(bestValEl, best); }
    } else {
      const modeBest = bestScores[currentMode] || 0;
      if(modeBest < curBest){ bestValEl.textContent = modeBest; } else { animateNumberTo(bestValEl, modeBest); }
    }
  }
  // コインなどの大きな数値を K/M/B/T 表記で見やすく表示する(内部の値自体は正確な数値のまま保持)
  // 大きな数を短く表示(K, M, B, T, Q… と続け、1e36以上は指数表記)。
  // ※JavaScriptのNumberは約9×10^15(9,007,199,254,740,991)を超えると下の桁が不正確になる
  const NUMBER_UNITS = [
    {v:1e33,s:'Dc'},{v:1e30,s:'No'},{v:1e27,s:'Oc'},{v:1e24,s:'Sp'},{v:1e21,s:'Sx'},{v:1e18,s:'Qi'},
    {v:1e15,s:'Q'},{v:1e12,s:'T'},{v:1e9,s:'B'},{v:1e6,s:'M'},{v:1e3,s:'K'}
  ];
  function formatNumber(n){
    n = Number(n) || 0;
    const sign = n < 0 ? '-' : '';
    const abs = Math.abs(n);
    if(!isFinite(abs)) return sign + '∞';
    if(abs >= 1e36) return sign + abs.toExponential(2).replace('+','');
    for(const u of NUMBER_UNITS){
      if(abs >= u.v){
        const val = abs / u.v;
        const formatted = val >= 100 ? Math.floor(val) : (Math.round(val*10)/10);
        return sign + formatted + u.s;
      }
    }
    return sign + Math.floor(abs);
  }
  function updateCoinUI(){ coinValEl.textContent = formatNumber(coins); saveCoins(coins); }

  function awardGameEndCoins(){
    const earned = Math.floor((score/500) * coinMultiplier());
    if(earned>0){ coins += earned; updateCoinUI(); floatCoin(earned); }
    return earned;
  }

  // ===================== ベストスコア永続化 =====================
  async function loadBestScores(){
    try{
      const res = await appStorage.get(STORAGE_BEST_SCORES, false);
      if(res && res.value){
        const parsed = JSON.parse(res.value);
        if(parsed.soft !== undefined) bestScores = parsed;
      }
    }catch(err){}
    // 全体ベストは最大値
    best = Math.max(bestScores.soft, bestScores.baked, bestScores.hard, bestScores.extreme);
    bestValEl.textContent = best;
    tetrisBest = bestScores.tetris || 0;
  }
  async function saveBestScores(){
    try{ await appStorage.set(STORAGE_BEST_SCORES, JSON.stringify(bestScores), false); }catch(err){}
    // 全体ベストも保存（互換性のため）
    const overall = Math.max(bestScores.soft, bestScores.baked, bestScores.hard, bestScores.extreme);
    await saveBest(overall);
  }
  async function loadBest(){
    try{ const res = await appStorage.get(STORAGE_BEST, false); if(res && res.value) best = parseInt(res.value,10)||0; }catch(err){ best=0; }
    bestValEl.textContent = best;
  }
  async function saveBest(val){ try{ await appStorage.set(STORAGE_BEST, String(val), false); }catch(err){} }
  async function loadCoins(){
    try{ const res = await appStorage.get(STORAGE_COINS, false); if(res && res.value) coins = parseInt(res.value,10)||0; }catch(err){ coins=0; }
    coinValEl.textContent = formatNumber(coins);
  }
  async function saveCoins(val){ try{ await appStorage.set(STORAGE_COINS, String(val), false); }catch(err){} }

  // ===================== クエスト =====================
  // desc を「目標値 n を受け取って説明文を返す関数」にすることで、
  // スケーリング後の実際の目標値が説明文に自動で反映される。
  const QUEST_POOL = [
    { id:'singleScore400', desc:(n)=>`1回のプレイでスコア${n}点以上を叩き出す`, statKey:'bestSingleGameScore', target:4000, reward:50 },
    { id:'tripleClear', desc:(n)=>`3ライン以上同時に消す(トリプルクリア)を${n}回成功させる`, statKey:'tripleClearCount', target:1, reward:70 },
    { id:'comboStreak4', desc:(n)=>`1回のプレイでコンボストリークを${n}連続つなげる`, statKey:'maxComboStreak', target:4, reward:65 },
    { id:'lines25', desc:(n)=>`ラインを合計${n}本消す`, statKey:'linesCleared', target:25, reward:55 },
    { id:'hardMode1', desc:(n)=>`「硬い」以上の難易度でゲームを${n}回プレイし切る`, statKey:'hardModeGamesPlayed', target:1, reward:45 },
    { id:'pieces60', desc:(n)=>`ピースを合計${n}個配置する`, statKey:'piecesPlaced', target:60, reward:40 },
    { id:'score600total', desc:(n)=>`合計スコアを${n}点稼ぐ`, statKey:'scoreEarned', target:6000, reward:50 },
    { id:'noClearStreak10', desc:(n)=>`ラインを消さずにピースを${n}個連続で置く我慢比べ`, statKey:'maxNoClearStreak', target:10, reward:60 },
    { id:'bigPiece5', desc:(n)=>`5マス以上の大きいブロックを${n}個配置する`, statKey:'bigPiecesPlaced', target:5, reward:55 },
    { id:'play3', desc:(n)=>`ゲームを${n}回プレイする`, statKey:'gamesPlayed', target:3, reward:30 }
  ];

  function pickDailyQuests(){
    const pool = [...QUEST_POOL];
    const picked = [];
    for(let i=0;i<3 && pool.length>0;i++){
      const idx = Math.floor(Math.random()*pool.length);
      const q = pool.splice(idx,1)[0];
      picked.push({ ...q, progress:0, claimed:false });
    }
    return picked;
  }

  // ===================== 無限クエスト(エンドレス) =====================
  // クリアするたびにすぐ次のクエストが補充され、達成数が増えるほど目標値と報酬がじわじわ大きくなる
  function scaledTarget(base){
    return Math.max(1, Math.round(base * (1 + questsCompletedCount * 0.12)));
  }
  function scaledReward(base){
    return Math.round(base * (1 + questsCompletedCount * 0.15));
  }

function issueNewQuest(excludePoolIds){
    const pool = QUEST_POOL.filter(q=>!excludePoolIds.includes(q.id));
    const poolItem = (pool.length ? pool : QUEST_POOL)[Math.floor(Math.random()*(pool.length ? pool.length : QUEST_POOL.length))];
    const targetVal = scaledTarget(poolItem.target);
    return {
      poolId: poolItem.id,
      // 説明文を「実際の目標値 targetVal」で生成する（表示と目標のズレをなくす）
      desc: (typeof poolItem.desc === 'function') ? poolItem.desc(targetVal) : poolItem.desc,
      statKey: poolItem.statKey,
      baseline: dailyStats[poolItem.statKey] || 0,
      target: targetVal,
      reward: scaledReward(poolItem.reward),
      claimed: false
    };
  }

  function ensureActiveQuests(){
    while(activeQuests.length < 3){
      const excludeIds = activeQuests.map(q=>q.poolId);
      activeQuests.push(issueNewQuest(excludeIds));
    }
  }
  function questProgressOf(q){
    return Math.max(0, (dailyStats[q.statKey] || 0) - q.baseline);
  }

  async function loadDailyQuests(){
    try{
      const res = await appStorage.get(STORAGE_QUESTS, false);
      if(res && res.value){
        const parsed = JSON.parse(res.value);
        dailyStats = { ...DAILY_STATS_DEFAULT, ...parsed.stats };
        questsCompletedCount = parsed.completedCount || 0;
        activeQuests = Array.isArray(parsed.active) ? parsed.active : [];
      }
    }catch(err){}
    // 保存済みのクエストの説明文を、実際の目標値で再生成する
    // (古いバージョンで保存された「3回プレイする」等の表示と実際の target がズレているのを直す)
    activeQuests = activeQuests.map(q => {
      const poolItem = QUEST_POOL.find(p => p.id === q.poolId);
      if (poolItem && typeof poolItem.desc === 'function') {
        return { ...q, desc: poolItem.desc(q.target) };
      }
      return q;
    });
    ensureActiveQuests();
    await saveDailyQuests();
  }

  async function saveDailyQuests(){
    try{ await appStorage.set(STORAGE_QUESTS, JSON.stringify({stats:dailyStats, active:activeQuests, completedCount:questsCompletedCount}), false); }catch(err){}
  }

  function updateQuestProgress(){
    saveDailyQuests();
    if(modalOverlay.classList.contains('show') && modalContent.dataset.mode==='quests') renderQuestModal();
  }

  function claimQuest(poolId){
    const idx = activeQuests.findIndex(q=>q.poolId===poolId);
    if(idx===-1) return;
    const q = activeQuests[idx];
    if(q.claimed || questProgressOf(q) < q.target) return;
    coins += q.reward;
    updateCoinUI();
    questsCompletedCount += 1;
    activeQuests.splice(idx,1);
    ensureActiveQuests();
    saveDailyQuests();
    renderQuestModal();
    syncToServer();
  }

  function renderQuestModal(){
    modalContent.dataset.mode = 'quests';
    let html = `<h2 style="color:var(--mint);">📋 エンドレスクエスト</h2>
      <div class="sub">達成するとすぐ次のクエストが補充される、無限に挑戦し続けられるクエストです。通算<b style="color:var(--gold);">${questsCompletedCount}</b>個クリア中！</div>`;
    activeQuests.forEach(q=>{
      const progress = questProgressOf(q);
      const pct = Math.min(100, Math.floor((progress/q.target)*100));
      const done = progress >= q.target;
      html += `
        <div class="quest-item">
          <div class="qtitle">${q.desc}</div>
          <div class="quest-bar-bg"><div class="quest-bar-fill" style="width:${pct}%"></div></div>
          <div class="quest-foot">
            <span>${Math.min(progress,q.target)} / ${q.target}</span>
            <button class="claim-btn" data-qid="${q.poolId}" ${(!done||q.claimed)?'disabled':''}>
              ${q.claimed ? '受取済み' : `🪙${q.reward} 受け取る`}
            </button>
          </div>
        </div>`;
    });
    modalContent.innerHTML = html;
    modalContent.querySelectorAll('.claim-btn').forEach(btn=>{
      btn.addEventListener('click', ()=>claimQuest(btn.dataset.qid));
    });
  }

  // ===================== 記録・実績 =====================
  function buildAchievements(){
    return [
      { label:'はじめの一歩', done: (dailyStats.gamesPlayed||0)>=1, desc:'ゲームを1回プレイする' },
      { label:'ライン職人', done: (dailyStats.linesCleared||0)>=100, desc:'ラインを合計100本消す' },
      { label:'コンボマスター', done: (dailyStats.maxComboStreak||0)>=8, desc:'コンボを8連続つなげる' },
      { label:'トリプルクリア', done: (dailyStats.tripleClearCount||0)>=1, desc:'3ライン以上同時に消す' },
      { label:'硬派プレイヤー', done: (dailyStats.hardModeGamesPlayed||0)>=5, desc:'「硬い」以上の難易度を5回プレイ' },
      { label:'テトリスマスター', done: (tetrisBest||0)>=5000, desc:'テトリスモードで5000点以上を出す' },
      { label:'タイムアタック挑戦者', done: (bestScores.timeattack||0)>=1000, desc:'タイムアタックで1000点以上を出す' },
      { label:'クエストマニア', done: (questsCompletedCount||0)>=10, desc:'エンドレスクエストを10個クリアする' },
      { label:'コレクター', done: (ownedSkins||[]).length>=5, desc:'スキンを5個以上入手する' }
    ];
  }

  function renderRecordsModal(){
    modalContent.dataset.mode = 'records';
    const achievements = buildAchievements();
    const doneCount = achievements.filter(a=>a.done).length;
    let html = `
      <h2 style="color:var(--gold);">🏆 記録・実績</h2>
      <div class="sub" style="margin-bottom:10px;">これまでのプレイ記録と実績の達成状況です。</div>
      <div class="records-grid">
        <div class="record-box"><div class="rlabel">🏆 通常モード最高</div><div class="rval">${best}</div></div>
        <div class="record-box"><div class="rlabel">⏱ タイムアタック最高</div><div class="rval">${bestScores.timeattack||0}</div></div>
        <div class="record-box"><div class="rlabel">🧱 テトリス最高</div><div class="rval">${tetrisBest||0}</div></div>
        <div class="record-box"><div class="rlabel">🔥 最大コンボ</div><div class="rval">${dailyStats.maxComboStreak||0}</div></div>
        <div class="record-box"><div class="rlabel">💥 累計消去ライン</div><div class="rval">${dailyStats.linesCleared||0}</div></div>
        <div class="record-box"><div class="rlabel">🎮 総プレイ回数</div><div class="rval">${dailyStats.gamesPlayed||0}</div></div>
        <div class="record-box"><div class="rlabel">📊 総スコア</div><div class="rval">${dailyStats.scoreEarned||0}</div></div>
        <div class="record-box"><div class="rlabel">🧩 設置ピース数</div><div class="rval">${dailyStats.piecesPlaced||0}</div></div>
      </div>
      <h3 style="color:var(--mint); margin:14px 0 8px;">🎯 実績（${doneCount}/${achievements.length}）</h3>
      ${achievements.map(a=>`
        <div class="achievement-item ${a.done?'done':''}">
          <span class="ach-icon">${a.done?'✅':'🔒'}</span>
          <div><div class="ach-label">${a.label}</div><div class="ach-desc">${a.desc}</div></div>
        </div>`).join('')}
    `;
    modalContent.innerHTML = html;
  }

  // ===================== 設定(アプリ全体) =====================
  // ===================== 📮 ご要望・不具合報告(Discordへ転送) =====================
  let feedbackImageDataUrl = null;

  function renderFeedbackModal(tab){
    modalContent.dataset.mode = 'feedback';
    feedbackImageDataUrl = null;
    let html = `
      <h2 style="color:var(--gold);">📮 ご要望・不具合報告</h2>
      <div class="tab-row" style="margin-bottom:10px;">
        <button class="tab-btn ${tab==='request'?'active':''}" data-fbtab="request">💡 ご要望</button>
        <button class="tab-btn ${tab==='report'?'active':''}" data-fbtab="report">🐞 不具合報告</button>
      </div>
    `;
    if(tab === 'request'){
      html += `
        <div class="sub" style="margin-bottom:8px;">「こんな機能が欲しい」「こんなアップデートをしてほしい」など、次のアップデートに入れてほしい内容を考えて自由に書いてください。</div>
        <textarea id="feedbackText" placeholder="例: ○○モードに△△機能を追加してほしい、□□の見た目をもっとこうしてほしい、など" style="width:100%; min-height:140px; padding:12px; border-radius:12px; border:1px solid rgba(255,255,255,0.12); background:var(--bg-deep2); color:var(--text); font-size:14px; font-family:'Nunito',sans-serif; resize:vertical; box-sizing:border-box;"></textarea>
        <button class="primary-btn" id="feedbackSendBtn">💡 要望を送信する</button>
        <div class="sub" id="feedbackStatus" style="margin-top:8px;"></div>
      `;
    } else {
      html += `
        <div class="sub" style="margin-bottom:4px; color:var(--coral); font-weight:700;">⚠️ 「スコアがランキングに反映されない」など再現の証拠が必要な不具合は、スクリーンショットが無いと対応できない場合があります。できるだけ画像を添付してください。</div>
        <textarea id="feedbackText" placeholder="例: ○○モードでスコアが加算されない、△△のボタンを押しても反応しない、など具体的に書いてください" style="width:100%; min-height:120px; padding:12px; border-radius:12px; border:1px solid rgba(255,255,255,0.12); background:var(--bg-deep2); color:var(--text); font-size:14px; font-family:'Nunito',sans-serif; resize:vertical; box-sizing:border-box; margin-top:8px;"></textarea>
        <input type="file" id="feedbackImageInput" accept="image/*" style="display:none;">
        <button class="ghost-btn" id="feedbackImageBtn" style="width:100%; margin-top:8px;">🖼️ 画像を添付する(任意)</button>
        <div id="feedbackImagePreviewWrap" style="display:none; margin-top:8px;">
          <img id="feedbackImagePreview" style="max-width:100%; border-radius:12px; display:block;">
          <button class="ghost-btn" id="feedbackImageRemoveBtn" style="width:100%; margin-top:6px;">画像を削除</button>
        </div>
        <button class="primary-btn" id="feedbackSendBtn">🐞 報告を送信する</button>
        <div class="sub" id="feedbackStatus" style="margin-top:8px;"></div>
      `;
    }
    modalContent.innerHTML = html;

    modalContent.querySelectorAll('.tab-btn[data-fbtab]').forEach(btn=>{
      btn.addEventListener('click', ()=> renderFeedbackModal(btn.dataset.fbtab));
    });

    if(tab === 'report'){
      const imgBtn = document.getElementById('feedbackImageBtn');
      const imgInput = document.getElementById('feedbackImageInput');
      const previewWrap = document.getElementById('feedbackImagePreviewWrap');
      const previewImg = document.getElementById('feedbackImagePreview');
      imgBtn.addEventListener('click', ()=> imgInput.click());
      imgInput.addEventListener('change', (e)=>{
        const file = e.target.files[0];
        if(!file) return;
        const reader = new FileReader();
        reader.onload = () => {
          feedbackImageDataUrl = reader.result;
          previewImg.src = feedbackImageDataUrl;
          previewWrap.style.display = 'block';
        };
        reader.readAsDataURL(file);
      });
      document.getElementById('feedbackImageRemoveBtn').addEventListener('click', ()=>{
        feedbackImageDataUrl = null;
        imgInput.value = '';
        previewWrap.style.display = 'none';
      });
    }

    document.getElementById('feedbackSendBtn').addEventListener('click', async ()=>{
      const textEl = document.getElementById('feedbackText');
      const statusEl = document.getElementById('feedbackStatus');
      const message = textEl.value.trim();
      if(!message){ statusEl.textContent = '内容を入力してください。'; statusEl.style.color = 'var(--coral)'; return; }
      const sendBtn = document.getElementById('feedbackSendBtn');
      sendBtn.disabled = true;
      statusEl.textContent = '送信中...';
      statusEl.style.color = 'var(--text-dim)';
      try{
        const endpoint = tab === 'request' ? '/api/feedback/request' : '/api/feedback/report';
        const body = tab === 'request' ? { message } : { message, imageBase64: feedbackImageDataUrl };
        const headers = { 'Content-Type': 'application/json' };
        if(authToken) headers['Authorization'] = `Bearer ${authToken}`;
        const res = await fetch(`${API_BASE_URL}${endpoint}`, { method:'POST', headers, body: JSON.stringify(body) });
        const data = await res.json();
        if(!res.ok) throw new Error(data.error || '送信に失敗しました');
        statusEl.textContent = '✅ 送信しました。ありがとうございます！';
        statusEl.style.color = 'var(--mint)';
        textEl.value = '';
        feedbackImageDataUrl = null;
        const previewWrap = document.getElementById('feedbackImagePreviewWrap');
        if(previewWrap) previewWrap.style.display = 'none';
      }catch(err){
        statusEl.textContent = `送信に失敗しました: ${err.message}`;
        statusEl.style.color = 'var(--coral)';
      }finally{
        sendBtn.disabled = false;
      }
    });
  }

  function renderAppSettingsModal(){
    modalContent.dataset.mode = 'appsettings';
    modalContent.innerHTML = `
      <h2 style="color:var(--gold);">⚙ 設定</h2>
<div class="settings-row">
        <span>🔊 音量 <b id="volumeValueLabel" style="color:var(--gold);">${Math.round(soundVolume*100)}%</b></span>
        <input type="range" id="volumeSlider" min="0" max="200" value="${Math.round(soundVolume*100)}">
      </div>
      <div class="settings-row">
        <span>🌙 ダークモード</span>
        <label class="switch"><input type="checkbox" id="darkModeToggle" ${darkMode?'checked':''}><span class="switch-slider"></span></label>
      </div>
      <div class="settings-row">
        <span>🎃 ハロウィンUI <span class="sub">(開催中のみ)</span></span>
        <label class="switch"><input type="checkbox" id="hwThemeToggle" ${uiPrefs.hwTheme?'checked':''}><span class="switch-slider"></span></label>
      </div>
      <div class="settings-row">
        <span>✨ 動きを減らす <span class="sub">(背景の演出など)</span></span>
        <label class="switch"><input type="checkbox" id="reduceMotionToggle" ${uiPrefs.reduceMotion?'checked':''}><span class="switch-slider"></span></label>
      </div>
      <div class="settings-row">
        <span>📳 振動 <span class="sub">(ライン消去など・対応端末)</span></span>
        <label class="switch"><input type="checkbox" id="vibrateToggle" ${uiPrefs.vibrate?'checked':''}><span class="switch-slider"></span></label>
      </div>
      <div class="settings-row" id="settingsAccountRow" style="cursor:pointer;">
        <span>👤 アカウント</span><span class="sub">${currentUserId ? currentUserId : 'ゲスト'} ›</span>
      </div>
      <div class="settings-row" id="settingsFeedbackRow" style="cursor:pointer;">
        <span>📮 ご要望・不具合報告</span><span class="sub">›</span>
      </div>
      <button class="ghost-btn danger" id="dataResetBtn" style="width:100%; margin-top:8px;">🗑 データリセット</button>
    `;
    document.getElementById('settingsFeedbackRow').addEventListener('click', ()=>{
      renderFeedbackModal('request');
    });
    document.getElementById('volumeSlider').addEventListener('input', (e)=>{
      const pct = parseInt(e.target.value, 10);
      soundVolume = pct / 100;
      bgmVolume = pct / 100;
      const label = document.getElementById('volumeValueLabel');
      if(label) label.textContent = pct + '%';
      saveAppSettings();
      saveBgmSettings();
      applyBgmVolume();
    });
    document.getElementById('volumeSlider').addEventListener('change', ()=> playSound('coin'));
    document.getElementById('darkModeToggle').addEventListener('change', (e)=>{
      darkMode = e.target.checked;
      applyDarkMode();
      saveAppSettings();
    });
    const bindPref = (id, key, after)=> document.getElementById(id).addEventListener('change', (e)=>{
      uiPrefs[key] = e.target.checked; saveUiPrefs(); if(after) after();
    });
    bindPref('hwThemeToggle', 'hwTheme', refreshEventTheme);
    bindPref('reduceMotionToggle', 'reduceMotion', refreshEventTheme);
    bindPref('vibrateToggle', 'vibrate', ()=>{ if(uiPrefs.vibrate) vibrate(40); });
    document.getElementById('settingsAccountRow').addEventListener('click', ()=>{
      closeModal();
      accountBtn.click();
    });
    document.getElementById('dataResetBtn').addEventListener('click', confirmDataReset);
  }

  function confirmDataReset(){
    const name = currentUserId || 'ゲスト';
    const typed = prompt(`⚠️「${name}」のデータを削除します。\nこの操作は取り消せません。よろしければ、確認のためアカウント名「${name}」を正確に入力してください。`);
    if(typed === null) return;
    if(typed !== name){ alert('入力内容が一致しなかったため、キャンセルしました。'); return; }
    performDataReset();
  }

  async function performDataReset(){
    bestScores = { soft:0, baked:0, hard:0, extreme:0, tetris:0, timeattack:0 };
    best = 0; tetrisBest = 0;
    dailyStats = { ...DAILY_STATS_DEFAULT };
    questsCompletedCount = 0; activeQuests = [];
    ensureActiveQuests();
    coins = 0;
    ownedSkins = ['default']; equippedSkin = 'default';
    saveBestScores(); saveDailyQuests(); saveCoins(0); saveSkinsData();
    applySkin('default');
    updateScoreUI(); updateCoinUI();
    if(authToken) await syncToServer();
    alert('データをリセットしました。');
    renderAppSettingsModal();
  }

  // ===================== スキン =====================
  function buildPatternedColors(baseColors, patternKey){
    if(!patternKey || !PATTERN_LAYERS[patternKey]) return baseColors;
    const layer = PATTERN_LAYERS[patternKey];
    return baseColors.map(c=>({ bg: `${layer}, ${c.bg}` }));
  }

  // ★バグ修正: ショップ一覧の小さいスワッチだと柄の不透明度が薄すぎて、
  // 無地スキンとその柄違いバリエーション(同じ色・同じ価格で1文字違いの名前)が
  // ほぼ同じ見た目になり「同じスキンが被って並んでいる」ように見えてしまっていた。
  // ゲーム盤面(buildPatternedColors)はそのままに、一覧プレビューだけ柄を強調して見分けやすくする。
  function buildPatternedColorsForPreview(baseColors, patternKey){
    if(!patternKey || !PATTERN_LAYERS[patternKey]) return baseColors;
    const boosted = PATTERN_LAYERS[patternKey].replace(
      /rgba\(([^,]+),([^,]+),([^,]+),\s*([\d.]+)\)/g,
      (m, r, g, b, a) => `rgba(${r},${g},${b},${Math.min(1, parseFloat(a) * 2.2).toFixed(2)})`
    );
    return baseColors.map(c=>({ bg: `${boosted}, ${c.bg}` }));
  }

  function applySkin(id){
    const skin = SKINS.find(s=>s.id===id) || SKINS[0];
    equippedSkin = skin.id;
    const hwDefault = (skin.id==='default' && document.body.classList.contains('hw'));   // 🎃 開催中は標準スキンもハロウィン配色
    Object.entries(hwDefault ? HW_DEFAULT_VARS : skin.vars).forEach(([k,v])=>document.documentElement.style.setProperty(k,v));
const titleEl = document.querySelector('.title');
    if(titleEl) titleEl.style.backgroundImage = hwDefault ? HW_TITLE_GRAD : skin.titleGrad;  // background → backgroundImage
    COLORS.length = 0;
    buildPatternedColors(skin.colors, skin.pattern).forEach(c=>COLORS.push(c));
    if(cellEls.length){
      board.forEach((cellData, idx)=>{
        if(cellData.filled && COLORS[cellData.colorIdx]) cellEls[idx].style.background = COLORS[cellData.colorIdx].bg;
      });
    }
    document.body.classList.toggle('gacha-shimmer-active', !!skin.gachaEffect);
    // ★アニメーションスキン: ブロック自体が常時動き続ける新しい種類のスキン
    if(skin.animType){ document.body.setAttribute('data-living-anim', skin.animType); }
    else { document.body.removeAttribute('data-living-anim'); }
    renderTray();
  }

  function buySkin(id){
    const skin = SKINS.find(s=>s.id===id);
    if(!skin || skin.gacha || ownedSkins.includes(id) || coins < skin.price) return;
    coins -= skin.price;
    ownedSkins.push(id);
    updateCoinUI();
    saveSkinsData();
    syncToServer();
    renderSettingsModal('skin');
  }

  function equipSkin(id){
    if(!ownedSkins.includes(id)) return;
    applySkin(id);
    saveSkinsData();
    syncToServer(); // ★これが無いとサーバー側のequippedSkinが更新されず、数秒後の定期同期で元のスキンに戻ってしまう
    renderSettingsModal('skin');
  }

  async function loadSkinsData(){
    try{
      const res = await appStorage.get(STORAGE_SKINS, false);
      if(res && res.value){
        const parsed = JSON.parse(res.value);
        ownedSkins = (parsed.owned && parsed.owned.length) ? parsed.owned : ['default'];
        equippedSkin = parsed.equipped || 'default';
      }
    }catch(err){ ownedSkins = ['default']; equippedSkin = 'default'; }
    applySkin(equippedSkin);
  }

  async function saveSkinsData(){
    try{ await appStorage.set(STORAGE_SKINS, JSON.stringify({owned:ownedSkins, equipped:equippedSkin}), false); }catch(err){}
  }

  // ===================== 設定 =====================
  async function loadSettings(){
    let isFirstTime = true;
    try{
      const res = await appStorage.get(STORAGE_SETTINGS, false);
      if(res && res.value){
        const parsed = JSON.parse(res.value);
        currentMode = (MODES[parsed.mode] || parsed.mode==='tetris') ? parsed.mode : 'baked';
        SIZE = (currentMode==='extreme') ? 8 : Math.min(18, Math.max(5, parsed.size||8));
        // ★テトリスのサブモードとAI難易度を復元
        if(['solo','vs','sprint','ultra'].includes(parsed.tetrisSubMode)){
          tetrisSubMode = parsed.tetrisSubMode;
        }
        if(parsed.aiDifficulty && AI_DIFFICULTIES[parsed.aiDifficulty]){
          aiDifficulty = parsed.aiDifficulty;
        }
        isFirstTime = false;
      }
    }catch(err){}
    return isFirstTime;
  }
  async function saveSettings(){
    try{
      await appStorage.set(STORAGE_SETTINGS, JSON.stringify({
        mode: currentMode,
        size: SIZE,
        tetrisSubMode: tetrisSubMode,
        aiDifficulty: aiDifficulty
      }), false);
    }catch(err){}
  }

  function renderModeTab(){
    let html = `<div class="sub" style="margin-bottom:10px;">モードと盤面サイズを選んで「この設定でスタート」を押してください。</div>`;
    Object.entries(MODES).forEach(([key, m])=>{
      const selected = pendingMode === key;
      html += `
        <div class="mode-card ${selected?'selected':''}" data-mode="${key}">
          <div class="mode-card-head"><span class="mode-emoji">${m.emoji}</span><span>${m.label}</span>
            <span class="coin-tag">🪙×${MODE_COIN_MULT[key]}</span></div>
        </div>`;
    });
    const tetrisSelected = pendingMode === 'tetris';
    html += `
      <div class="mode-card ${tetrisSelected?'selected':''}" data-mode="tetris">
        <div class="mode-card-head"><span class="mode-emoji">🧱</span><span>テトリス</span>
          <span class="coin-tag">NEW</span></div>
      </div>`;
    const taSelected = pendingMode === 'timeattack';
    html += `
      <div class="mode-card ${taSelected?'selected':''}" data-mode="timeattack">
        <div class="mode-card-head"><span class="mode-emoji">⏱</span><span>タイムアタック</span>
          <span class="coin-tag">NEW</span></div>
      </div>`;

    if(pendingMode === 'tetris'){
      // 🎮 遊び方を選択（ソロ or VS AI）
      html += `<div class="sub" style="margin:12px 0 8px; font-weight:800; color:var(--gold);">🎮 遊び方を選択</div>`;
      html += `
        <div class="mode-card ${tetrisSubMode==='solo'?'selected':''}" data-tetris-sub="solo">
          <div class="mode-card-head"><span class="mode-emoji">🧱</span><span>ソロモード</span>
            <span class="coin-tag">練習・記録更新</span></div>
        </div>
        <div class="mode-card ${tetrisSubMode==='vs'?'selected':''}" data-tetris-sub="vs">
          <div class="mode-card-head"><span class="mode-emoji">⚔️</span><span>VS AI</span>
            <span class="coin-tag">AIと勝負</span></div>
        </div>
        <div class="mode-card ${tetrisSubMode==='sprint'?'selected':''}" data-tetris-sub="sprint">
          <div class="mode-card-head"><span class="mode-emoji">🏁</span><span>スプリント(40ライン)</span>
            <span class="coin-tag">NEW</span></div>
          <div class="sub" style="margin-top:4px; font-size:11px;">40ライン消すまでのタイムを競う。自己ベストを記録します。</div>
        </div>
        <div class="mode-card ${tetrisSubMode==='ultra'?'selected':''}" data-tetris-sub="ultra">
          <div class="mode-card-head"><span class="mode-emoji">⏳</span><span>ウルトラ(2分)</span>
            <span class="coin-tag">NEW</span></div>
          <div class="sub" style="margin-top:4px; font-size:11px;">2分間でどれだけスコアを稼げるか。フレンド対決もこのルールです。</div>
        </div>
      `;

      // VS AIの時は難易度選択を表示
      if(tetrisSubMode === 'vs'){
        html += `<div class="sub" style="margin:14px 0 8px; font-weight:800; color:var(--gold);">🤖 AIの強さを選択</div>`;
        Object.entries(AI_DIFFICULTIES).forEach(([key, diff]) => {
          html += `
            <div class="mode-card ${aiDifficulty===key?'selected':''}" data-ai-diff="${key}">
              <div class="mode-card-head">
                <span style="font-size:16px;">${diff.label}</span>
              </div>
              <div class="sub" style="margin-top:4px; font-size:11px;">${diff.desc}</div>
            </div>`;
        });
      }

      const startLabel = tetrisSubMode==='solo' ? '🧱 ソロモードを始める'
        : tetrisSubMode==='sprint' ? '🏁 スプリントを始める'
        : tetrisSubMode==='ultra' ? '⏳ ウルトラを始める'
        : `⚔️ ${AI_DIFFICULTIES[aiDifficulty].label} と対戦`;
      html += `<button class="primary-btn" id="applyModeBtn" style="margin-top:12px;">${startLabel}</button>`;
      return html;
    }
    if(pendingMode === 'timeattack'){
      html += `
        <div class="sub" style="margin:8px 0;">制限時間${TIME_ATTACK_DURATION}秒でどれだけ高得点を出せるか挑戦！してね。うん。</div>
        <button class="primary-btn" id="applyModeBtn">タイムアタックを始める</button>`;
      return html;
    }

    const sizeNow = pendingMode==='extreme' ? 8 : pendingSize;
    const totalMult = (MODE_COIN_MULT[pendingMode] * sizeCoinMult(sizeNow)).toFixed(2);
    html += `
      <div class="size-row">
        <div class="qtitle" style="margin-bottom:2px;">盤面サイズ: <span id="sizeVal">${sizeNow}</span> × ${sizeNow}</div>
        <input type="range" id="sizeSlider" min="5" max="18" step="1" value="${sizeNow}" ${pendingMode==='extreme'?'disabled':''}>
        <div class="sub" style="margin-top:4px;">${pendingMode==='extreme' ? '激硬モードは8×8で固定です。' : '盤面が小さいほどコイン倍率が上がります。'}</div>
        <div class="sub" style="margin-top:8px; color:var(--gold); font-weight:800;">獲得コイン倍率: ×<span id="totalMultVal">${totalMult}</span>(焼成8×8が基準の×1.00)</div>
      </div>
      <button class="primary-btn" id="applyModeBtn">この設定でスタート</button>`;
    return html;
  }

  let skinFilter = 'all';
  function renderSkinTab(){
    let html = `<div class="sub" style="margin-bottom:8px;">🪙 ${formatNumber(coins)} 所持中。ゲームで貯めたコインで見た目を変えられます。</div>`;
    html += `<div class="tab-row" style="margin-bottom:10px; flex-wrap:wrap;">
      <button class="tab-btn sfilter-btn ${skinFilter==='all'?'active':''}" data-sfilter="all">すべて</button>
      <button class="tab-btn sfilter-btn ${skinFilter==='plain'?'active':''}" data-sfilter="plain">無地</button>
      <button class="tab-btn sfilter-btn ${skinFilter==='pattern'?'active':''}" data-sfilter="pattern">🎨 柄物</button>
      <button class="tab-btn sfilter-btn ${skinFilter==='gacha'?'active':''}" data-sfilter="gacha">🎰 ガチャ限定</button>
      <button class="tab-btn sfilter-btn ${skinFilter==='event'?'active':''}" data-sfilter="event">🎃 イベント限定</button>
    </div>`;
    // ガチャ限定スキンは通常ショップの「すべて/無地/柄物」には出さず、専用フィルタでのみ表示する(コインでの購入は不可)
    const list = SKINS.filter(s => {
      if(skinFilter==='event') return !!s.event;
      if(skinFilter==='gacha') return !!s.gacha && !s.event;
      if(s.gacha) return false;
      return skinFilter==='all' ? true : skinFilter==='pattern' ? !!s.pattern : !s.pattern;
    }).slice().sort((a,b)=>a.price-b.price); // 値段の安い順に並べる
    if(skinFilter==='gacha' && list.every(s=>!ownedSkins.includes(s.id))){
      html += `<div class="empty-hint">まだガチャ限定スキンを持っていません。🎰ガチャで手に入れよう！</div>`;
    }
    if(skinFilter==='event' && list.every(s=>!ownedSkins.includes(s.id))){
      html += `<div class="empty-hint">まだイベント限定スキンを持っていません。🎃イベント開催中に手に入れよう！</div>`;
    }
    list.forEach(skin=>{
      const owned = ownedSkins.includes(skin.id);
      const equipped = equippedSkin === skin.id;
      const canBuy = !owned && !skin.gacha && coins >= skin.price;
      let btnLabel = equipped ? '装備中' : owned ? '装備する' : (skin.gacha ? (skin.event ? '🎃イベント限定' : '🎰ガチャ限定') : (skin.price===0 ? '入手する' : (canBuy ? '購入する' : 'コインが足りません')));
      let btnAction = equipped ? '' : owned ? 'equip' : (skin.gacha ? '' : 'buy');
      const swatchColors = buildPatternedColorsForPreview(skin.colors, skin.pattern);
      if(skin.gacha && !owned) return; // 未入手のガチャ限定スキンはカードごと非表示(ガチャフィルタでは「持っていない」ことが分かればよい)
      html += `
        <div class="quest-item">
          <div class="qtitle">${skin.name}${equipped?' ✅':''}${skin.pattern?' <span class="coin-tag">柄物</span>':''}${skin.event?' <span class="coin-tag">🎃イベント限定</span>':(skin.gacha?' <span class="coin-tag">🎰限定</span>':'')}${skin.animType?' <span class="coin-tag">✨アニメーション</span>':''}</div>
          <div class="sub" style="margin:2px 0 8px;">${skin.desc}</div>
          <div class="skin-swatches">${swatchColors.map(c=>`<span class="swatch" style="background:${c.bg}"></span>`).join('')}</div>
          <div class="quest-foot" style="margin-top:8px;">
            <span>${skin.event ? '🎃イベント限定' : skin.gacha ? '🎰ガチャ限定' : (skin.price===0 ? '無料' : `🪙${formatNumber(skin.price)}`)}</span>
            <button class="claim-btn" data-skin="${skin.id}" data-action="${btnAction}" ${(equipped || (!owned && (!canBuy && !skin.gacha)) || (skin.gacha && !owned))?'disabled':''}>${btnLabel}</button>
          </div>
        </div>`;
    });
    return html;
  }

  function renderSettingsModal(tab){
    modalContent.dataset.mode = 'settings';
    modalContent.innerHTML = `
      <h2 style="color:var(--gold);">⚙️ 設定</h2>
      <div class="tab-row">
        <button class="tab-btn ${tab==='mode'?'active':''}" data-stab="mode">ゲームモード</button>
        <button class="tab-btn ${tab==='skin'?'active':''}" data-stab="skin">🎨 スキン</button>
        <button class="tab-btn ${tab==='bg'?'active':''}" data-stab="bg">🖼️ 背景</button>
      </div>
      <div id="settingsTabBody">${tab==='skin' ? renderSkinTab() : tab==='bg' ? renderBgTab() : renderModeTab()}</div>
    `;
    modalContent.querySelectorAll('.tab-btn[data-stab]').forEach(btn=>{
      btn.addEventListener('click', ()=>renderSettingsModal(btn.dataset.stab));
    });
    if(tab==='skin'){
      modalContent.querySelectorAll('.sfilter-btn').forEach(btn=>{
        btn.addEventListener('click', ()=>{
          skinFilter = btn.dataset.sfilter;
          renderSettingsModal('skin');
        });
      });
      modalContent.querySelectorAll('.claim-btn[data-skin]').forEach(btn=>{
        btn.addEventListener('click', ()=>{
          const id = btn.dataset.skin, action = btn.dataset.action;
          if(action==='buy') buySkin(id);
          else if(action==='equip') equipSkin(id);
        });
      });
    } else if(tab==='bg'){
      const fileInput = document.getElementById('bgFileInput');
      const pickBtn = document.getElementById('bgPickBtn');
      const resetBtn = document.getElementById('bgResetBtn');
      if(pickBtn) pickBtn.addEventListener('click', ()=> fileInput.click());
      if(fileInput) fileInput.addEventListener('change', async (e)=>{
        const file = e.target.files[0];
        if(!file) return;
        const statusEl = document.getElementById('bgStatus');
        if(statusEl) statusEl.textContent = '画像を処理中...';
        try{
          await setCustomBackgroundFromFile(file);
          renderSettingsModal('bg');
        }catch(err){
          if(statusEl) statusEl.textContent = '画像の読み込みに失敗しました。別の画像でお試しください。';
        }
      });
      if(resetBtn) resetBtn.addEventListener('click', async ()=>{
        await resetCustomBackground();
        renderSettingsModal('bg');
      });
    } else {
      modalContent.querySelectorAll('.mode-card[data-mode]').forEach(card=>{
        card.addEventListener('click', ()=>{
          pendingMode = card.dataset.mode;
          if(pendingMode==='extreme') pendingSize = 8;
          renderSettingsModal('mode');
        });
      });
      // テトリス：ソロ/VS AI 切り替え
      modalContent.querySelectorAll('.mode-card[data-tetris-sub]').forEach(card=>{
        card.addEventListener('click', ()=>{
          tetrisSubMode = card.dataset.tetrisSub;
          renderSettingsModal('mode');
        });
      });
      // テトリス：AI難易度切り替え
      modalContent.querySelectorAll('.mode-card[data-ai-diff]').forEach(card=>{
        card.addEventListener('click', ()=>{
          aiDifficulty = card.dataset.aiDiff;
          renderSettingsModal('mode');
        });
      });
      const slider = document.getElementById('sizeSlider');
      if(slider){
        slider.addEventListener('input', (e)=>{
          pendingSize = parseInt(e.target.value,10);
          const label = document.getElementById('sizeVal');
          if(label) label.textContent = pendingSize;
          const multLabel = document.getElementById('totalMultVal');
          if(multLabel) multLabel.textContent = (MODE_COIN_MULT[pendingMode] * sizeCoinMult(pendingSize)).toFixed(2);
        });
      }
      const applyBtn = document.getElementById('applyModeBtn');
      if(applyBtn) applyBtn.addEventListener('click', ()=>{ applyMode(pendingMode, pendingSize); closeModal(); });
    }
  }

  settingsBtn.addEventListener('click', ()=>{
    pendingMode = currentMode; pendingSize = SIZE;
    renderSettingsModal('mode');
    modalOverlay.classList.add('show');
  });

// ===================== 🎵 BGMプレイヤー =====================
  const STORAGE_BGM = 'candyblast-bgm-v1';
  let bgmAudio = null;
  let bgmEnabled = true;
  let bgmVolume = 0.4;
  let bgmCurrentFile = null;
let bgmStarted = false;
  // ★200%音量対応: BGMをWeb Audio経由で増幅するためのノード
  let bgmGainNode = null;
  let bgmSourceNode = null;

  async function loadBgmSettings(){
    try{
      const res = await appStorage.get(STORAGE_BGM, false);
      if(res && res.value){
        const p = JSON.parse(res.value);
        if(typeof p.enabled === 'boolean') bgmEnabled = p.enabled;
        if(typeof p.volume === 'number') bgmVolume = p.volume;
        if(typeof p.currentFile === 'string') bgmCurrentFile = p.currentFile;
      }
    }catch(err){}
    updateMusicButton();
  }
  async function saveBgmSettings(){
    try{
      await appStorage.set(STORAGE_BGM, JSON.stringify({
        enabled:bgmEnabled, volume:bgmVolume, currentFile:bgmCurrentFile
      }), false);
    }catch(err){}
  }

  function updateMusicButton(){
    const btn = document.getElementById('musicBtn');
    if(!btn) return;
    btn.textContent = (bgmEnabled && bgmCurrentFile) ? '🎵' : '🔇';
    btn.title = (bgmEnabled && bgmCurrentFile) ? 'BGM: 再生中' : 'BGM: 停止中';
  }

function ensureBgmGainNode(){
    // audioCtxがまだ無ければ作らない(初回ユーザー操作で unlockAudio される)
    if(!audioCtx) return null;
    if(!bgmGainNode){
      bgmGainNode = audioCtx.createGain();
      bgmGainNode.connect(audioCtx.destination);
    }
    return bgmGainNode;
  }

  function playBgmTrack(file){
    stopBgm();
    if(!file) return;
    bgmCurrentFile = file;
    const thisAudio = new Audio('bgm/' + file);
    bgmAudio = thisAudio;
    thisAudio.loop = true;

    unlockAudio();
    const gainNode = ensureBgmGainNode();
    if(gainNode){
      try{
        const source = audioCtx.createMediaElementSource(thisAudio);
        source.connect(gainNode);
        gainNode.gain.value = bgmVolume;
        bgmSourceNode = source;
      }catch(err){
        thisAudio.volume = Math.min(1, bgmVolume);
      }
    } else {
      thisAudio.volume = Math.min(1, bgmVolume);
    }

    thisAudio.addEventListener('error', ()=>{
      console.warn('BGM読み込み失敗:', file);
      if(bgmAudio === thisAudio) bgmAudio = null;
      updateMusicButton();
    });
    thisAudio.play().then(()=>{
      bgmStarted = true;
      updateMusicButton();
    }).catch(()=>{
      if(bgmAudio === thisAudio) bgmAudio = null;
      updateMusicButton();
    });
    saveBgmSettings();
  }

  function stopBgm(){
    if(bgmSourceNode){
      try{ bgmSourceNode.disconnect(); }catch(err){}
      bgmSourceNode = null;
    }
    if(bgmAudio){
      try{ bgmAudio.pause(); }catch(err){}
      bgmAudio = null;
    }
  }

  function toggleBgm(){
    bgmEnabled = !bgmEnabled;
    if(bgmEnabled && bgmCurrentFile){
      playBgmTrack(bgmCurrentFile);
    } else {
      stopBgm();
    }
    updateMusicButton();
    saveBgmSettings();
  }

  function applyBgmVolume(){
    if(bgmGainNode){
      bgmGainNode.gain.value = bgmVolume;
    } else if(bgmAudio){
      bgmAudio.volume = Math.min(1, bgmVolume);
    }
  }

  // ===================== サウンド =====================
  let audioCtx = null;
  function unlockAudio(){
    try{
      if(!audioCtx) audioCtx = new (window.AudioContext||window.webkitAudioContext)();
      if(audioCtx.state === 'suspended') audioCtx.resume();
    }catch(err){}
  }
  // より満足感のあるサウンド(単純な音量アップではなく、和音・アルペジオで表現)
  function playSound(type, intensity){
    if(!soundOn || soundVolume<=0) return;
    try{
      unlockAudio();
      if(!audioCtx) return;
      const t0 = audioCtx.currentTime;
      const master = audioCtx.createGain();
      master.gain.value = soundVolume;
      master.connect(audioCtx.destination);
      if(type==='place'){
        const o1 = audioCtx.createOscillator(), g1 = audioCtx.createGain();
        o1.type='sine'; o1.frequency.setValueAtTime(520, t0); o1.frequency.exponentialRampToValueAtTime(300, t0+0.08);
        g1.gain.setValueAtTime(0.10, t0); g1.gain.exponentialRampToValueAtTime(0.001, t0+0.09);
        o1.connect(g1); g1.connect(master); o1.start(t0); o1.stop(t0+0.1);
        const o2 = audioCtx.createOscillator(), g2 = audioCtx.createGain();
        o2.type='triangle'; o2.frequency.setValueAtTime(780, t0);
        g2.gain.setValueAtTime(0.045, t0); g2.gain.exponentialRampToValueAtTime(0.001, t0+0.05);
        o2.connect(g2); g2.connect(master); o2.start(t0); o2.stop(t0+0.06);
      } else if(type==='clear'){
        const lvl = intensity||1;
        const notes = lvl>=4 ? [523.25,659.25,783.99,1046.5] : lvl>=2 ? [523.25,659.25,783.99] : [523.25,659.25];
        notes.forEach((freq,i)=>{
          const start = t0 + i*0.055;
          const o = audioCtx.createOscillator(), g = audioCtx.createGain();
          o.type='triangle'; o.frequency.setValueAtTime(freq, start);
          g.gain.setValueAtTime(0.001, start);
          g.gain.linearRampToValueAtTime(0.13, start+0.015);
          g.gain.exponentialRampToValueAtTime(0.001, start+0.22);
          o.connect(g); g.connect(master);
          o.start(start); o.stop(start+0.23);
        });
      } else if(type==='coin'){
        [1046.5, 1568].forEach((freq,i)=>{
          const start = t0 + i*0.045;
          const o = audioCtx.createOscillator(), g = audioCtx.createGain();
          o.type='sine'; o.frequency.setValueAtTime(freq, start);
          g.gain.setValueAtTime(0.001, start);
          g.gain.linearRampToValueAtTime(0.12, start+0.01);
          g.gain.exponentialRampToValueAtTime(0.001, start+0.18);
          o.connect(g); g.connect(master);
          o.start(start); o.stop(start+0.19);
        });
      } else if(type==='gameover'){
        [392,329.63,261.63].forEach((freq,i)=>{
          const start = t0 + i*0.12;
          const o = audioCtx.createOscillator(), g = audioCtx.createGain();
          o.type='sine'; o.frequency.setValueAtTime(freq, start);
          g.gain.setValueAtTime(0.11, start);
          g.gain.exponentialRampToValueAtTime(0.001, start+0.35);
          o.connect(g); g.connect(master);
          o.start(start); o.stop(start+0.36);
        });
      } else if(type==='timer'){
        const o = audioCtx.createOscillator(), g = audioCtx.createGain();
        o.type='square'; o.frequency.setValueAtTime(880, t0);
        g.gain.setValueAtTime(0.06, t0); g.gain.exponentialRampToValueAtTime(0.001, t0+0.08);
        o.connect(g); g.connect(master); o.start(t0); o.stop(t0+0.09);
      }
    }catch(err){}
  }
  soundBtn.addEventListener('click', ()=>{
    unlockAudio();
    soundOn = !soundOn;
    soundBtn.textContent = soundOn ? '🔊' : '🔇';
  });

// 🎵 音楽ボタン: 一覧モーダルを開く
  document.getElementById('musicBtn').addEventListener('click', ()=>{
    unlockAudio();
    renderMusicModal();
    modalOverlay.classList.add('show');
  });

// 最初の1タップでBGM自動開始(ブラウザの自動再生制限対策)
  function autoStartBgmOnFirstInteraction(){
    if(bgmStarted) return;
    if(!bgmEnabled) return;
    // まだ曲が選ばれていなければ、ライブラリの先頭を自動選択
    if(!bgmCurrentFile && MUSIC_LIBRARY.length > 0){
      bgmCurrentFile = MUSIC_LIBRARY[0].file;
    }
    if(bgmCurrentFile) playBgmTrack(bgmCurrentFile);
    document.removeEventListener('pointerdown', autoStartBgmOnFirstInteraction);
    document.removeEventListener('click', autoStartBgmOnFirstInteraction);
  }
  document.addEventListener('pointerdown', autoStartBgmOnFirstInteraction);
  document.addEventListener('click', autoStartBgmOnFirstInteraction);
  document.body.addEventListener('pointerdown', unlockAudio, { once:true });

  // ===================== ゲームオーバー =====================
  function endGame(){
    playSound('gameover');
    stopTimeAttackTimer();
    dailyStats.gamesPlayed += 1;
    if(currentMode==='hard' || currentMode==='extreme') dailyStats.hardModeGamesPlayed = (dailyStats.hardModeGamesPlayed||0) + 1;
    saveDailyQuests();
    updateQuestProgress();
    grantBattlePassXp(sessionScoreForXp);
    sessionScoreForXp = 0;
    reportEventGame({ mode: currentMode, score: score, duel: !!currentDuelId });

    if(weeklyChallengeActive){
      weeklyChallengeActive = false;
      finalScoreEl.textContent = score;
      newBestNoteEl.textContent = '🎲 週替わりチャレンジ結果';
      coinEarnedNoteEl.textContent = '';
      duelResultNoteEl.textContent = '送信中...';
      overlayEl.classList.add('show');
      submitWeeklyChallengeScore(score);
      syncPlayTime();
      return;
    }

    const earned = awardGameEndCoins();
    if(earned>0) playSound('coin');
    finalScoreEl.textContent = score;
    const refBest = isRegularMode(currentMode) ? best : (bestScores[currentMode]||0);
    newBestNoteEl.textContent = (score>=refBest && score>0) ? '🎉 ハイスコア更新！' : 'お疲れさまでした！';
    coinEarnedNoteEl.textContent = earned>0 ? `🪙 +${earned} コイン獲得！` : '';
    duelResultNoteEl.textContent = '';
    if(currentDuelId){
      const duelId = currentDuelId;
      currentDuelId = null;
      duelResultNoteEl.textContent = '対決の結果を送信中...';
      submitDuelScore(duelId, score).then(duel=>{
        if(duel){
          duelResultNoteEl.textContent = duelResultText(duel);
          if(duel.status==='completed') syncFromServer(); // 対決報酬のコインをすぐ画面に反映
        }
        else duelResultNoteEl.textContent = '対決結果の送信に失敗しました。';
      });
    }

overlayEl.classList.add('show');
    // ゲーム終了時にサーバーへ送信（今のゲームの実際のスコアを送る）
    if (authToken) syncToServer(score);
    syncPlayTime();
  }

  async function submitWeeklyChallengeScore(finalScore){
    try{
      const res = await fetch(`${API_BASE_URL}/api/weekly-challenge/submit`, {
        method:'POST',
        headers:{ 'Content-Type':'application/json', 'Authorization':`Bearer ${authToken}` },
        body: JSON.stringify({ score: finalScore })
      });
      const data = await res.json();
      if(!res.ok) throw new Error(data.error || '送信に失敗しました');
      duelResultNoteEl.textContent = `✅ スコア${finalScore}を送信しました！結果はランキングで確認できます。`;
    }catch(err){
      duelResultNoteEl.textContent = `送信に失敗しました: ${err.message}`;
    }
  }

restartBtn.addEventListener('click', ()=>{
    overlayEl.classList.remove('show');
    if(currentMode==='tetris'){ restartTetris(); return; }
    if(currentMode==='timeattack'){ startTimeAttackMode(); return; }   // ★追加
    score = 0; streak = 0; noClearStreak = 0;
    updateScoreUI();
    initBoard();
    fillTray();
  });

  // ===================== モーダル共通 =====================
  function closeModal(){
    modalOverlay.classList.remove('show');
    modalContent.dataset.mode = '';
    if (chatPollingInterval) {
      clearInterval(chatPollingInterval);
      chatPollingInterval = null;
    }
    if (rankingPollInterval) {
      clearInterval(rankingPollInterval);
      rankingPollInterval = null;
    }
  }
  modalClose.addEventListener('click', closeModal);
  modalOverlay.addEventListener('click', (e)=>{ if(e.target===modalOverlay) closeModal(); });

  questBtn.addEventListener('click', ()=>{
    renderQuestModal();
    modalOverlay.classList.add('show');
  });

  // ===================== アカウント（修正：ログアウト時に完全リセット） =====================
  function resetToGuest() {
    // ゲスト状態にリセット
    authToken = null;
    currentUserId = null;
    clearAuthSession();
    // データ初期化
    bestScores = { soft:0, baked:0, hard:0, extreme:0 };
    best = 0;
    coins = 0;
    ownedSkins = ['default'];
    equippedSkin = 'default';
    // クエストもリセット(統計を初期化し、新規クエストをやり直す)
    dailyStats = { ...DAILY_STATS_DEFAULT };
    questsCompletedCount = 0;
    activeQuests = [];
    ensureActiveQuests();
    // プレイ時間リセット
    stopPlayTimeTracking();
    // リアルタイム同期も停止
    stopUserSync();
    playTime = 0;
    // UI更新
    bestValEl.textContent = '0';
    coinValEl.textContent = '0';
    score = 0; streak = 0; noClearStreak = 0;
    updateScoreUI();
    // スキン適用
    applySkin('default');
    // 盤面を新しくする
    initBoard();
    fillTray();
    // 保存（ゲスト用）
    saveBestScores();
    saveCoins(0);
    saveSkinsData();
    saveDailyQuests();
    // アカウントボタン更新
    updateAccountButton();
    // 管理者パネル非表示
    adminPanelBtn.style.display = 'none';
    // ランキングポーリング停止
    if (rankingPollInterval) {
      clearInterval(rankingPollInterval);
      rankingPollInterval = null;
    }
    // フレンド／チャット未読バッジのポーリング停止＆バッジ非表示
    stopBackgroundPolling();
    friendsList = []; incomingRequests = []; outgoingRequests = [];
    dmUnreadTotal = 0; dmMentionCount = 0; dmPerFriendUnread = {};
    chatUnreadCount = 0; chatMentionCount = 0; chatLastSeenId = 0;
    updateFriendsBadge();
    updateChatBadge();
  }

  function updateAccountButton(){
    accountBtn.textContent = currentUserId ? '👤' : '👤';
    accountBtn.title = currentUserId ? `ログイン中: ${currentUserId}` : '未ログイン';
    if (currentUserId === ADMIN_USER_ID) {
      adminPanelBtn.style.display = 'flex';
      loadAdminSettings();
      grantAllSkinsIfAdmin();
    } else {
      adminPanelBtn.style.display = 'none';
    }
    if (currentUserId) {
      startBackgroundPolling();
    } else {
      stopBackgroundPolling();
    }
  }

  async function deleteAccount() {
    if (!authToken) return;
    if (!confirm('⚠️ 本当にアカウントを削除しますか？\nこの操作は元に戻せません！')) return;
    if (!confirm('本当に削除しますか？（最終確認）')) return;
    try {
      const res = await fetch(`${API_BASE_URL}/api/account/delete`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${authToken}` }
      });
      if (!res.ok) throw new Error('削除に失敗しました');
      alert('アカウントを削除しました。');
      resetToGuest();
      renderAuthModal();
    } catch(err) {
      alert(err.message);
    }
  }

  function renderAuthModal(){
    modalContent.dataset.mode = 'auth';
    if(currentUserId){
      modalContent.innerHTML = `
        <h2 style="color:var(--gold);">👤 アカウント</h2>
        <div class="sub">ログイン中: <b>${currentUserId}</b></div>
        <div class="sub">スコア・コインはサーバーと同期されています。</div>
        <button class="primary-btn" id="syncNowBtn">今すぐ同期する</button>
        <button class="ghost-btn" id="logoutBtn">ログアウト</button>
        <button class="ghost-btn" id="deleteAccountBtn" style="color:var(--coral);border-color:var(--coral);">🗑️ アカウント削除</button>
      `;
      document.getElementById('logoutBtn').addEventListener('click', ()=>{
        resetToGuest();  // 完全リセット
        closeModal();
      });
      document.getElementById('syncNowBtn').addEventListener('click', async ()=>{
        await syncToServer();
        await syncFromServer();
      });
      document.getElementById('deleteAccountBtn').addEventListener('click', deleteAccount);
      return;
    }
    modalContent.innerHTML = `
      <h2 style="color:var(--gold);">👤 アカウント</h2>
      <div class="tab-row">
        <button class="tab-btn active" data-tab="login">ログイン</button>
        <button class="tab-btn" data-tab="register">新規登録</button>
        <button class="tab-btn" data-tab="recover">復元</button>
      </div>
      <form class="auth-form active" id="loginForm">
        <label>ID</label><input type="text" id="loginId" autocomplete="username" />
        <label>パスワード</label><input type="password" id="loginPw" autocomplete="current-password" />
        <button type="submit" class="primary-btn">ログイン</button>
        <div class="auth-msg" id="loginMsg"></div>
      </form>
      <form class="auth-form" id="registerForm">
        <label>ID (半角英数字3〜20文字)</label><input type="text" id="regId" autocomplete="username" />
        <label>パスワード (6文字以上)</label><input type="password" id="regPw" autocomplete="new-password" />
        <button type="submit" class="primary-btn">新規登録</button>
        <div class="auth-msg" id="regMsg"></div>
      </form>
      <form class="auth-form" id="recoverForm">
        <label>ID</label><input type="text" id="recId" />
        <label>復元コード(管理者から受け取ったもの)</label><input type="text" id="recCode" placeholder="XXXX-XXXX-XXXX-XXXX" />
        <label>新しいパスワード</label><input type="password" id="recPw" autocomplete="new-password" />
        <button type="submit" class="primary-btn">パスワードを再設定</button>
        <div class="auth-msg" id="recMsg"></div>
      </form>
    `;
    modalContent.querySelectorAll('.tab-btn').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        modalContent.querySelectorAll('.tab-btn').forEach(b=>b.classList.remove('active'));
        modalContent.querySelectorAll('.auth-form').forEach(f=>f.classList.remove('active'));
        btn.classList.add('active');
        modalContent.querySelector(`#${btn.dataset.tab}Form`).classList.add('active');
      });
    });
    document.getElementById('loginForm').addEventListener('submit', async (e)=>{
      e.preventDefault();
      const id = document.getElementById('loginId').value.trim();
      const password = document.getElementById('loginPw').value;
      const msgEl = document.getElementById('loginMsg');
      msgEl.textContent = '処理中...'; msgEl.className='auth-msg';
      try{
        const r = await fetch(`${API_BASE_URL}/api/login`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({id,password}) });
        const data = await r.json();
        if(!r.ok) throw new Error(data.error || 'ログインに失敗しました。');
        authToken = data.token;
        currentUserId = data.id;
        await saveAuthSession(authToken, currentUserId);
        // ログイン後、サーバーからデータ取得
        await syncFromServer();
        // ローカルに反映（syncFromServerでbestScores, coins, skinsなどが更新される）
        updateAccountButton();
        // プレイ時間追跡開始
        startPlayTimeTracking();
        // ログイン中はサーバーの変更をリアルタイムで反映
        startUserSync();
        msgEl.textContent = 'ログインしました！'; msgEl.className='auth-msg ok';
        // UI更新
        updateScoreUI();
        updateCoinUI();
        applySkin(equippedSkin);
        // モーダル閉じる
        setTimeout(()=>{ closeModal(); }, 500);
      }catch(err){
        msgEl.textContent = err.message + '(サーバーに接続できているか確認してください)';
        msgEl.className='auth-msg error';
      }
    });
    document.getElementById('registerForm').addEventListener('submit', async (e)=>{
      e.preventDefault();
      const id = document.getElementById('regId').value.trim();
      const password = document.getElementById('regPw').value;
      const msgEl = document.getElementById('regMsg');
      msgEl.textContent = '処理中...'; msgEl.className='auth-msg';
      try{
        const r = await fetch(`${API_BASE_URL}/api/register`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({id,password}) });
        const data = await r.json();
        if(!r.ok) throw new Error(data.error || '登録に失敗しました。');
        authToken = data.token; currentUserId = data.id;
        await saveAuthSession(authToken, currentUserId);
        // 新規登録時はデフォルトデータ
        bestScores = { soft:0, baked:0, hard:0, extreme:0 };
        coins = 0;
        ownedSkins = ['default'];
        equippedSkin = 'default';
        playTime = 0;
        saveBestScores();
        saveCoins(0);
        saveSkinsData();
        // クエストは新しく生成
        // クエストは新しく生成
        dailyStats = { ...DAILY_STATS_DEFAULT };
        questsCompletedCount = 0;
        activeQuests = [];
        ensureActiveQuests();
        saveDailyQuests();
        updateScoreUI();
        updateCoinUI();
        applySkin('default');
        startPlayTimeTracking();
        startUserSync();
        updateAccountButton();
        msgEl.textContent = '登録が完了しました！復元コードは管理者のDiscordに通知されました。';
        msgEl.className='auth-msg ok';
        await syncToServer();
        setTimeout(()=>{ closeModal(); }, 800);
      }catch(err){
        msgEl.textContent = err.message;
        msgEl.className='auth-msg error';
      }
    });
    document.getElementById('recoverForm').addEventListener('submit', async (e)=>{
      e.preventDefault();
      const id = document.getElementById('recId').value.trim();
      const recoveryCode = document.getElementById('recCode').value.trim();
      const newPassword = document.getElementById('recPw').value;
      const msgEl = document.getElementById('recMsg');
      msgEl.textContent = '処理中...'; msgEl.className='auth-msg';
      try{
        const r = await fetch(`${API_BASE_URL}/api/recover`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({id,recoveryCode,newPassword}) });
        const data = await r.json();
        if(!r.ok) throw new Error(data.error || '復元に失敗しました。');
        msgEl.textContent = 'パスワードを再設定しました。ログインしてください。';
        msgEl.className='auth-msg ok';
      }catch(err){
        msgEl.textContent = err.message;
        msgEl.className='auth-msg error';
      }
    });
  }

  accountBtn.addEventListener('click', ()=>{ renderAuthModal(); modalOverlay.classList.add('show'); });

  // ===================== サーバー同期（修正：ベストスコアをモード別に送信） =====================

// playedScore … 「今のゲームで実際に出した点」。
  //   渡されたときだけ fromPlay を付けて、管理者コマンドの仮スコアを上書きできるようにする。
  async function syncToServer(playedScore){
    if(!authToken) return;
    try{
      const payload = {
        bestScore: (typeof playedScore === 'number') ? playedScore : (bestScores[currentMode] || 0),
        coins,
        skins: ownedSkins,
        equippedSkin,
        quests: activeQuests,
        mode: currentMode,
        size: SIZE,
        playTime
      };
      if(typeof playedScore === 'number') payload.fromPlay = true;
      const r = await fetch(`${API_BASE_URL}/api/sync`, {
        method:'POST',
        headers:{ 'Content-Type':'application/json', 'Authorization':`Bearer ${authToken}` },
        body: JSON.stringify(payload)
      });
      if(r.ok){
        const data = await r.json();
        // サーバー側の確定値でローカルを上書きする(管理者コマンド等で
        // サーバー側の値が変わっていた場合に、古いローカル表示のまま
        // ズレ続けてしまうのを防ぐ)
        if(data.bestScores && typeof data.bestScores === 'object'){
          bestScores = { ...bestScores, ...data.bestScores };
          tetrisBest = bestScores.tetris || 0;
          saveBestScores();
          if(isRegularMode(currentMode)){
            best = Math.max(bestScores.soft, bestScores.baked, bestScores.hard, bestScores.extreme);
          }
        }
        if(data.coins !== undefined){
          coins = data.coins;
          updateCoinUI();
        }
      }
    }catch(err){ console.warn('サーバー同期に失敗しました:', err.message); }
  }

  async function syncFromServer(){
    if(!authToken) return;
    try{
      const r = await fetch(`${API_BASE_URL}/api/sync`, { headers:{ 'Authorization':`Bearer ${authToken}` } });
      if(!r.ok) return;
      const data = await r.json();
      applySyncData(data);
    }catch(err){ console.warn('サーバーからの取得に失敗しました:', err.message); }
  }

  function applySyncData(data){
    // ベストスコア（モード別がある場合はそちらを優先）
    if (data.bestScores && typeof data.bestScores === 'object') {
      bestScores = { ...bestScores, ...data.bestScores };
    } else if (data.bestScore !== undefined) {
      // 互換性: 全体ベストのみの場合、現在のモードに設定（他のモードはそのまま）
      bestScores[currentMode] = Math.max(bestScores[currentMode] || 0, data.bestScore);
    }
    tetrisBest = bestScores.tetris || 0;
    if (currentMode === 'tetris') {
      bestValEl.textContent = tetrisBest;
    } else {
      best = Math.max(bestScores.soft, bestScores.baked, bestScores.hard, bestScores.extreme);
      bestValEl.textContent = best;
    }
    saveBestScores();

    if (data.coins !== undefined) {
      coins = data.coins;
      coinValEl.textContent = formatNumber(coins);
      saveCoins(coins);
    }
    if (data.skins) {
      ownedSkins = data.skins;
      saveSkinsData();
    }
    if (data.equippedSkin) {
      equippedSkin = data.equippedSkin;
      applySkin(equippedSkin);
      saveSkinsData();
    }
    if (data.playTime !== undefined) {
      playTime = data.playTime;
    }
    // クエストはサーバーにあれば反映（他端末での進捗を引き継ぐ）
    if (data.quests && data.quests.length && data.quests[0].poolId) {
      activeQuests = data.quests;
      ensureActiveQuests();
      saveDailyQuests();
    }
  }

  // ===================== 管理者設定 =====================
  async function loadAdminSettings() {
    if (!authToken || currentUserId !== ADMIN_USER_ID) return;
    try {
      const res = await fetch(`${API_BASE_URL}/api/admin/block-settings`, {
        headers: { 'Authorization': `Bearer ${authToken}` }
      });
      if (res.ok) {
        const data = await res.json();
        adminDisabledBlocks = data.disabledBlocks || [];
        adminSafetyMode = data.safetyMode || false;
      }
    } catch(e) {}
  }

  // ★管理者アカウントには全スキンを無料で贈呈する。
  // 通常のショップ購入/ガチャを一切介さず、専用API(/api/admin/grant-all-skins)へ
  // 「今このフロントエンドが把握している全スキンID」を送って、まとめて所持済みにする。
  async function grantAllSkinsIfAdmin() {
    if (!authToken || currentUserId !== ADMIN_USER_ID) return;
    try {
      const allSkinIds = SKINS.map(s => s.id);
      const missing = allSkinIds.filter(id => !ownedSkins.includes(id));
      if (missing.length === 0) return; // すでに全部持っている
      const res = await fetch(`${API_BASE_URL}/api/admin/grant-all-skins`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` },
        body: JSON.stringify({ skinIds: allSkinIds })
      });
      if (res.ok) {
        const data = await res.json();
        if (data.skins) {
          ownedSkins = data.skins;
          saveSkinsData();
        }
      }
    } catch (e) {}
  }

  async function executeAdminCommand(cmd) {
    if (!authToken || currentUserId !== ADMIN_USER_ID) return '❌ 管理者権限がありません';
    try {
      const res = await fetch(`${API_BASE_URL}/api/admin/command`, {
        method: 'POST',
        headers: { 'Content-Type':'application/json', 'Authorization':`Bearer ${authToken}` },
        body: JSON.stringify({ command: cmd })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'コマンド実行に失敗しました');
      if (cmd.startsWith('/setcoins')) {
        // /setcoins <ユーザーID> <amount> — 自分自身が対象の場合のみローカル表示を更新
        const parts = cmd.trim().split(/\s+/);
        const targetId = parts[1];
        const newCoins = parseInt(parts[2]);
        if (targetId === currentUserId && !isNaN(newCoins) && newCoins >= 0) {
          coins = newCoins; updateCoinUI(); saveCoins(coins); syncToServer();
        }
      }
      if (cmd.startsWith('/addcoins')) {
        // /addcoins <ユーザーID> <amount> — 自分自身が対象の場合のみローカル表示を更新
        const parts = cmd.trim().split(/\s+/);
        const targetId = parts[1];
        const addAmount = parseInt(parts[2]);
        if (targetId === currentUserId && !isNaN(addAmount)) {
          coins = Math.max(0, coins + addAmount); updateCoinUI(); saveCoins(coins); syncToServer();
        }
      }
      if (cmd.startsWith('/setscore')) {
        // /setscore <ユーザーID> <mode> <score> — 自分自身が対象の場合のみローカル表示を更新
        const parts = cmd.trim().split(/\s+/);
        const targetId = parts[1];
        const mode = parts[2];
        const scoreVal = parseInt(parts[3]);
        if (targetId === currentUserId && RANKING_MODES.includes(mode) && !isNaN(scoreVal) && scoreVal >= 0) {
          bestScores[mode] = scoreVal;
          if (mode === 'tetris') tetrisBest = scoreVal;
          if (isRegularMode(mode)) {
            best = Math.max(bestScores.soft, bestScores.baked, bestScores.hard, bestScores.extreme);
            bestValEl.textContent = best;
          } else if (currentMode === mode) {
            animateNumberTo(bestValEl, scoreVal);
          }
          saveBestScores();
          syncToServer();
        }
      }
      return data.result || '✅ コマンドを実行しました';
    } catch(e) {
      return '❌ ' + e.message;
    }
  }

  async function renderAdminPanel() {
    modalContent.dataset.mode = 'admin';
    let html = `
      <h2 style="color:var(--gold);">🔧 管理者パネル</h2>
      <div class="sub">admin専用コマンド実行欄です。</div>
      <div class="admin-setting-item">
        <div class="label-row"><span>⌨️ 管理者コマンド</span></div>
        <input type="text" id="adminCmdInput" placeholder="コマンドを入力..." style="width:100%;padding:8px 12px;border-radius:10px;border:1px solid rgba(255,255,255,0.12);background:var(--bg-deep2);color:var(--text);font-size:14px;font-family:'Nunito',sans-serif;margin-bottom:6px;">
        <button class="primary-btn" id="adminCmdBtn">実行</button>
        <div class="cmd-output" id="adminCmdOutput">📋 コマンド一覧:
  /setcoins &lt;ユーザーID&gt; &lt;amount&gt; - 指定ユーザーのコインを設定
  /addcoins &lt;ユーザーID&gt; &lt;amount&gt; - 指定ユーザーのコインに加算（元のコイン+amount）
  /setscore &lt;ユーザーID&gt; &lt;mode&gt; &lt;score&gt; - 指定ユーザーのモード別スコア設定 (soft, baked, hard, extreme, tetris, timeattack)
  /safety [on|off] - 強制セーフティモード（引数なしで状態表示）
  /announce &lt;メッセージ&gt; - 全ユーザーにお知らせを配信
  /eventadd &lt;once|daily|weekly|monthly&gt; &lt;mode&gt; &lt;順位&gt; &lt;コイン&gt; &lt;年&gt; &lt;月&gt; &lt;日&gt; &lt;時&gt; &lt;分&gt; - ランキング順位者へコインを自動配布するイベントを追加(JST基準)
  /eventlist - 登録済みイベント一覧を表示
  /eventremove &lt;ID&gt; - イベントを削除
  /resetquests - 全ユーザーのクエスト進捗リセット
  /setplaytime &lt;seconds&gt; - プレイ時間を設定
  /ban &lt;ID&gt; - ユーザーをBAN
  /unban &lt;ID&gt; - BAN解除
  /resetuser &lt;ID&gt; - ユーザーデータリセット
  /listusers - ユーザー一覧表示
  /search &lt;ID&gt; - ユーザー情報検索
  /stats - サーバー統計情報
  /help - このヘルプ</div>
      </div>
      <div class="admin-setting-item">
        <div class="label-row"><span>🧩 ブロック出現設定（オフにすると出現しなくなります）</span></div>
        <div style="max-height:200px; overflow-y:auto;">
    `;
    SHAPES.forEach((shape, idx) => {
      const isOff = adminDisabledBlocks.includes(idx);
      const {rows, cols} = shapeBounds(shape);
      const size = 24;
      html += `
        <div style="display:flex; align-items:center; gap:10px; padding:4px 0; border-bottom:1px solid rgba(255,255,255,0.05);">
          <div class="block-grid-preview" style="grid-template-columns:repeat(${cols}, ${size}px); grid-template-rows:repeat(${rows}, ${size}px);">
            ${Array.from({length: rows*cols}, (_, i) => {
              const r = Math.floor(i/cols), c = i%cols;
              const filled = shape.some(([sr,sc])=>sr===r&&sc===c);
              return `<div class="block-cell ${filled?'':'empty'}"></div>`;
            }).join('')}
          </div>
          <span style="font-size:12px; color:var(--text-dim);">#${idx}</span>
          <div style="margin-left:auto; display:flex; align-items:center; gap:8px;">
            <span style="font-size:12px; color:${isOff ? 'var(--coral)' : 'var(--mint)'};">${isOff ? 'OFF' : 'ON'}</span>
            <div class="toggle-switch ${isOff ? '' : 'active'}" data-block-index="${idx}" style="cursor:pointer;">
              <div class="knob"></div>
            </div>
          </div>
        </div>
      `;
    });
    html += `</div></div>`;
    modalContent.innerHTML = html;

    document.getElementById('adminCmdBtn').addEventListener('click', async () => {
      const input = document.getElementById('adminCmdInput');
      const output = document.getElementById('adminCmdOutput');
      const cmd = input.value.trim();
      if (!cmd) return;
      output.textContent = '⏳ 実行中...';
      const result = await executeAdminCommand(cmd);
      output.innerHTML = result;
      input.value = '';
    });

    document.querySelectorAll('.toggle-switch[data-block-index]').forEach(el => {
      el.addEventListener('click', async function() {
        const idx = parseInt(this.dataset.blockIndex, 10);
        const currentOff = adminDisabledBlocks.includes(idx);
        const enabled = currentOff;
        try {
          const res = await fetch(`${API_BASE_URL}/api/admin/block-toggle`, {
            method: 'POST',
            headers: { 'Content-Type':'application/json', 'Authorization':`Bearer ${authToken}` },
            body: JSON.stringify({ blockIndex: idx, enabled })
          });
          if (res.ok) {
            const data = await res.json();
            adminDisabledBlocks = data.settings.disabledBlocks || [];
            // パネル全体を再描画せず、このスイッチだけを更新することでスクロール位置を保持する
            const isOff = adminDisabledBlocks.includes(idx);
            this.classList.toggle('active', !isOff);
            const labelSpan = this.parentElement.querySelector('span');
            if (labelSpan) {
              labelSpan.textContent = isOff ? 'OFF' : 'ON';
              labelSpan.style.color = isOff ? 'var(--coral)' : 'var(--mint)';
            }
          }
        } catch(e) {}
      });
    });
  }

  adminPanelBtn.addEventListener('click', () => {
    if (currentUserId === ADMIN_USER_ID) {
      renderAdminPanel();
      modalOverlay.classList.add('show');
    }
  });

  // ===================== ランキング（リアルタイム自動更新） =====================
  async function renderRankingModal() {
    modalContent.dataset.mode = 'ranking';
    let html = `
      <h2 style="color:var(--gold);">🏆 ランキング</h2>
      <div class="sub">8×8サイズのスコアのみランキング対象です。</div>
      <div class="tab-row" style="margin-bottom:6px;">
        ${RANKING_TYPES.map(t => `
          <button class="tab-btn ${currentRankingType === t ? 'active' : ''}" data-rtype="${t}">${RANKING_TYPE_LABELS[t]}</button>
        `).join('')}
      </div>
      <div class="tab-row" id="modeTabs" style="margin-bottom:10px; ${currentRankingType === 'score' ? '' : 'display:none;'}">
        ${RANKING_MODES.map(m => `
          <button class="tab-btn ${currentRankingMode === m ? 'active' : ''}" data-rmode="${m}">${RANKING_MODE_LABELS[m]}</button>
        `).join('')}
      </div>
      <div id="rankingContent">
        <div class="sub">🔄 読み込み中...</div>
      </div>
      <div style="margin-top:8px; font-size:12px; color:var(--text-dim);">自動更新（5秒ごと）</div>
    `;
    modalContent.innerHTML = html;

    modalContent.querySelectorAll('.tab-btn[data-rtype]').forEach(btn => {
      btn.addEventListener('click', () => {
        currentRankingType = btn.dataset.rtype;
        renderRankingModal();
      });
    });
    modalContent.querySelectorAll('.tab-btn[data-rmode]').forEach(btn => {
      btn.addEventListener('click', () => {
        currentRankingMode = btn.dataset.rmode;
        renderRankingModal();
      });
    });

    // 読み込み関数
    async function loadRanking() {
      try {
        const res = await fetch(`${API_BASE_URL}/api/ranking?mode=${currentRankingMode}&type=${currentRankingType}`);
        const data = await res.json();
        let content = `<div style="text-align:left; max-height:380px; overflow-y:auto;">`;
        if (data.top && data.top.length > 0) {
          data.top.forEach((user, index) => {
            const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index+1}.`;
            const isMe = user.id === currentUserId;
            const valueLabel = currentRankingType === 'coins' ? `${user.value}コイン` :
                              currentRankingType === 'playtime' ? `${user.value}秒` :
                              `${user.value}点`;
            content += `
              <div style="display:flex; justify-content:space-between; padding:8px 4px; border-bottom:1px solid rgba(255,255,255,0.05); ${isMe ? 'background:rgba(255,217,61,0.15); border-radius:8px;' : ''}">
                <span style="font-weight:700; ${isMe ? 'color:var(--gold);' : ''}">${medal} ${user.id} ${isMe ? '👈' : ''}</span>
                <span style="color:var(--gold); font-weight:800;">${valueLabel}</span>
              </div>
            `;
          });
        } else {
          const msg = currentRankingType === 'score' ? 'このモードのランキングデータがまだありません。' :
                     currentRankingType === 'coins' ? 'まだコインデータがありません。' :
                     'プレイ時間データがまだありません。';
          content += `<div class="sub">${msg}</div>`;
        }
        content += `</div>`;

        if (authToken && currentUserId) {
          let myValue = 0;
          try {
            const syncRes = await fetch(`${API_BASE_URL}/api/sync`, {
              headers: { 'Authorization': `Bearer ${authToken}` }
            });
            const syncData = await syncRes.json();
            if (currentRankingType === 'coins') {
              myValue = syncData.coins || 0;
            } else if (currentRankingType === 'playtime') {
              myValue = syncData.playTime || 0;
            } else {
              const bestScoresServer = syncData.bestScores || {};
              myValue = bestScoresServer[currentRankingMode] || 0;
            }
          } catch(e) {}

          if (myValue > 0) {
            const higherCount = data.top ? data.top.filter(u => u.value > myValue).length : 0;
            const myInTop = data.top ? data.top.some(u => u.id === currentUserId) : false;
            let rankDisplay = myInTop ? `${data.top.findIndex(u => u.id === currentUserId) + 1}位` :
                             (data.top && data.top.length > 0 ? `${higherCount + 1}位以上` : '-');
            const valueLabel = currentRankingType === 'coins' ? `${myValue}コイン` :
                              currentRankingType === 'playtime' ? `${myValue}秒` :
                              `${myValue}点`;
            content += `
              <div style="margin-top:16px; padding:14px 16px; background:linear-gradient(135deg,var(--panel-light),var(--panel)); border-radius:14px; border:2px solid var(--gold); display:flex; justify-content:space-between; align-items:center; position:sticky; bottom:0; backdrop-filter:blur(8px);">
                <span style="font-weight:700; color:var(--gold);">👤 ${currentUserId} の順位</span>
                <span style="font-weight:800; font-size:20px; color:var(--gold);">
                  ${rankDisplay}
                  <span style="font-size:14px; color:var(--text-dim); font-weight:400; margin-left:8px;">${valueLabel}</span>
                </span>
              </div>
            `;
          } else {
            const msg = currentRankingType === 'score' ? 'まだこのモードのスコアがありません。' :
                       currentRankingType === 'coins' ? 'まだコインがありません。' :
                       'プレイ時間が記録されていません。';
            content += `
              <div style="margin-top:16px; padding:14px 16px; background:var(--panel-light); border-radius:14px; text-align:center; color:var(--text-dim);">
                📊 ${msg}
              </div>
            `;
          }
        } else {
          content += `
            <div style="margin-top:16px; padding:14px 16px; background:var(--panel-light); border-radius:14px; text-align:center; color:var(--text-dim);">
              🔐 ログインすると自分の順位が表示されます
            </div>
          `;
        }
        document.getElementById('rankingContent').innerHTML = content;
      } catch(err) {
        document.getElementById('rankingContent').innerHTML = `<div class="sub" style="color:var(--coral);">❌ ランキングの読み込みに失敗しました</div>`;
      }
    }

    await loadRanking();

    // ポーリング開始（既存のものをクリア）
    if (rankingPollInterval) clearInterval(rankingPollInterval);
    rankingPollInterval = setInterval(loadRanking, 5000);
  }

  rankingBtn.addEventListener('click', () => {
    renderRankingModal();
    modalOverlay.classList.add('show');
  });

  // ===================== チャット =====================
  let chatMessages = [];
  let chatPollingInterval = null;
  let chatLastSeenId = 0;
  let chatUnreadCount = 0;
  let chatMentionCount = 0;

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  function escapeRegExp(str){
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function highlightMentions(text){
    const esc = escapeHtml(text);
    if(!currentUserId) return esc;
    const re = new RegExp('@' + escapeRegExp(currentUserId) + '(?!\\w)', 'gi');
    return esc.replace(re, m => `<span class="mention-tag">${m}</span>`);
  }

  function updateChatBadge(){
    if(chatMentionCount > 0){
      chatMentionBadge.textContent = chatMentionCount > 99 ? '99+' : chatMentionCount;
      chatMentionBadge.classList.add('show');
      chatDot.classList.remove('show');
    } else if(chatUnreadCount > 0){
      chatMentionBadge.classList.remove('show');
      chatDot.classList.add('show');
    } else {
      chatMentionBadge.classList.remove('show');
      chatDot.classList.remove('show');
    }
  }

  // モーダルを開かず裏側で新着とメンションだけチェックする軽量ポーリング
  async function pollChatUnread(){
    try {
      const res = await fetch(`${API_BASE_URL}/api/chat/messages`);
      if(!res.ok) return;
      const data = await res.json();
      if(!data.length) return;
      const maxId = Math.max(...data.map(m => m.id));
      if(chatLastSeenId === 0){ chatLastSeenId = maxId; return; } // 初回は既読扱い
      const isOpen = modalOverlay.classList.contains('show') && modalContent.dataset.mode === 'chat';
      if(isOpen){ chatLastSeenId = maxId; return; } // 開いている間は既読扱い
      const newOnes = data.filter(m => m.id > chatLastSeenId && m.user_id !== currentUserId);
      if(newOnes.length){
        chatUnreadCount += newOnes.length;
        if(currentUserId){
          const re = new RegExp('@' + escapeRegExp(currentUserId) + '(?!\\w)', 'i');
          chatMentionCount += newOnes.filter(m => re.test(m.message)).length;
        }
        updateChatBadge();
      }
      chatLastSeenId = maxId;
    } catch(err) { /* 無視 */ }
  }

  async function fetchChatMessages() {
    try {
      const res = await fetch(`${API_BASE_URL}/api/chat/messages`);
      const data = await res.json();
      chatMessages = data;
      if(data.length) chatLastSeenId = Math.max(...data.map(m => m.id));
      renderChatMessages();
    } catch (err) {
      console.warn('チャット取得失敗:', err);
    }
  }

  async function sendChatMessage(message) {
    if (!authToken) {
      alert('ログインが必要です');
      return false;
    }
    try {
      const res = await fetch(`${API_BASE_URL}/api/chat/send`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify({ message })
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || '送信失敗');
      }
      await fetchChatMessages();
      return true;
    } catch (err) {
      alert(err.message);
      return false;
    }
  }

  async function showProfile(userId) {
    try {
      const res = await fetch(`${API_BASE_URL}/api/user/profile/${userId}`);
      if (!res.ok) throw new Error('ユーザーが見つかりません');
      const data = await res.json();
      modalContent.dataset.mode = 'profile';
      const isFriend = friendsList.some(f => f.id === data.userId);
      const isSelf = data.userId === currentUserId;
      modalContent.innerHTML = `
        <h2 style="color:var(--gold);">👤 ${data.userId} のプロフィール</h2>
        <div style="text-align:left; padding:8px 0;">
          <div style="display:flex; justify-content:space-between; padding:6px 0; border-bottom:1px solid rgba(255,255,255,0.05);">
            <span style="color:var(--text-dim);">🏆 ベストスコア</span>
            <span style="color:var(--gold); font-weight:800;">${data.bestScore}点</span>
          </div>
          <div style="display:flex; justify-content:space-between; padding:6px 0; border-bottom:1px solid rgba(255,255,255,0.05);">
            <span style="color:var(--text-dim);">🪙 コイン</span>
            <span style="color:var(--gold); font-weight:800;">${data.coins}コイン</span>
          </div>
          <div style="display:flex; justify-content:space-between; padding:6px 0; border-bottom:1px solid rgba(255,255,255,0.05);">
            <span style="color:var(--text-dim);">⏱️ プレイ時間</span>
            <span style="color:var(--gold); font-weight:800;">${data.playTime}秒</span>
          </div>
          <div style="display:flex; justify-content:space-between; padding:6px 0;">
            <span style="color:var(--text-dim);">📅 登録日</span>
            <span style="color:var(--text-dim);">${new Date(data.joinedAt).toLocaleDateString('ja-JP')}</span>
          </div>
        </div>
        ${!isSelf && authToken ? (isFriend
          ? `<button class="primary-btn" id="profileDmBtn">💬 DMを送る</button>`
          : `<button class="primary-btn" id="profileAddFriendBtn">➕ フレンド申請</button>`) : ''}
        <button class="ghost-btn" onclick="closeModal()">閉じる</button>
      `;
      modalOverlay.classList.add('show');
      const dmBtn = document.getElementById('profileDmBtn');
      if(dmBtn) dmBtn.addEventListener('click', () => openDMThread(data.userId));
      const addBtn = document.getElementById('profileAddFriendBtn');
      if(addBtn) addBtn.addEventListener('click', () => sendFriendRequest(data.userId));
    } catch (err) {
      alert(err.message);
    }
  }

  function renderChatMessages() {
    const container = document.getElementById('chatMessages');
    if (!container) return;
    if (chatMessages.length === 0) {
      container.innerHTML = `<div style="text-align:center; color:var(--text-dim);">まだメッセージがありません。</div>`;
      return;
    }
    container.innerHTML = chatMessages.map(msg => `
      <div style="display:flex; align-items:baseline; gap:6px; padding:4px 0; border-bottom:1px solid rgba(255,255,255,0.03);">
        <span style="color:var(--gold); font-weight:700; cursor:pointer; flex-shrink:0;" onclick="showProfile('${msg.user_id}')">
          [${msg.user_id}]
        </span>
        <span style="color:var(--text); word-break:break-word;">${highlightMentions(msg.message)}</span>
        <span style="color:var(--text-dim); font-size:10px; margin-left:auto; flex-shrink:0;">
          ${new Date(msg.timestamp).toLocaleTimeString('ja-JP')}
        </span>
      </div>
    `).join('');
    container.scrollTop = container.scrollHeight;
  }

  function renderChatModal() {
    modalContent.dataset.mode = 'chat';
    modalContent.innerHTML = `
      <h2 style="color:var(--gold);">💬 グローバルチャット</h2>
      <div class="sub">全ユーザーと会話できます。「@ユーザーID」でメンションできます。</div>
      <div id="chatMessages" style="height:300px; overflow-y:auto; background:var(--bg-deep2); border-radius:12px; padding:10px; margin:8px 0; text-align:left; border:1px solid rgba(255,255,255,0.05);">
        <div style="text-align:center; color:var(--text-dim);">読み込み中...</div>
      </div>
      <div style="display:flex; gap:6px;">
        <input type="text" id="chatInput" placeholder="メッセージを入力...(@IDでメンション)" style="flex:1; padding:10px 12px; border-radius:12px; border:1px solid rgba(255,255,255,0.12); background:var(--bg-deep2); color:var(--text); font-size:14px; font-family:'Nunito',sans-serif;">
        <button class="primary-btn" id="chatSendBtn" style="flex-shrink:0; width:auto; padding:10px 20px; margin:0;">送信</button>
      </div>
      <div style="margin-top:6px; text-align:right; font-size:10px; color:var(--text-dim);">最新50件を表示</div>
    `;
    modalOverlay.classList.add('show');

    // 開いたので未読・メンションバッジをリセット
    chatUnreadCount = 0; chatMentionCount = 0; updateChatBadge();

    fetchChatMessages();

    document.getElementById('chatSendBtn').addEventListener('click', async () => {
      const input = document.getElementById('chatInput');
      const msg = input.value.trim();
      if (!msg) return;
      await sendChatMessage(msg);
      input.value = '';
    });

    document.getElementById('chatInput').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        document.getElementById('chatSendBtn').click();
      }
    });

    if (chatPollingInterval) clearInterval(chatPollingInterval);
    chatPollingInterval = setInterval(fetchChatMessages, 3000);
  }

  chatBtn.addEventListener('click', () => {
    renderChatModal();
    // モーダルが閉じられたらポーリング停止
    const observer = new MutationObserver(() => {
      if (!modalOverlay.classList.contains('show')) {
        if (chatPollingInterval) {
          clearInterval(chatPollingInterval);
          chatPollingInterval = null;
        }
      }
    });
    observer.observe(modalOverlay, { attributes: true, attributeFilter: ['class'] });
  });

  // ===================== 🆕 フレンド・DM =====================
  let friendsList = [];
  let incomingRequests = [];
  let outgoingRequests = [];
  let dmThreadWith = null;
  let dmPollingInterval = null;
  let dmUnreadTotal = 0;
  let dmMentionCount = 0;
  let dmPerFriendUnread = {};
  let friendsBgPollInterval = null;
  let chatBgPollInterval = null;
  let duelsList = [];
  let currentDuelId = null;

  function startBackgroundPolling(){
    stopBackgroundPolling();
    fetchFriendsData().then(updateFriendsBadge);
    fetchDMUnreadSummary();
    friendsBgPollInterval = setInterval(async () => {
      await fetchFriendsData();
      await fetchDMUnreadSummary();
    }, 8000);
    chatBgPollInterval = setInterval(pollChatUnread, 5000);
  }

  function stopBackgroundPolling(){
    if (friendsBgPollInterval) { clearInterval(friendsBgPollInterval); friendsBgPollInterval = null; }
    if (chatBgPollInterval) { clearInterval(chatBgPollInterval); chatBgPollInterval = null; }
  }

  function updateFriendsBadge(){
    if (dmMentionCount > 0) {
      friendsMentionBadge.textContent = dmMentionCount > 99 ? '99+' : dmMentionCount;
      friendsMentionBadge.classList.add('show');
      friendsDot.classList.remove('show');
    } else if (dmUnreadTotal > 0 || incomingRequests.length > 0) {
      friendsMentionBadge.classList.remove('show');
      friendsDot.classList.add('show');
    } else {
      friendsMentionBadge.classList.remove('show');
      friendsDot.classList.remove('show');
    }
  }

  async function fetchFriendsData(){
    if (!authToken) return;
    try {
      const res = await fetch(`${API_BASE_URL}/api/friends/list`, {
        headers: { 'Authorization': `Bearer ${authToken}` }
      });
      if (!res.ok) return;
      const data = await res.json();
      friendsList = data.friends || [];
      incomingRequests = data.incoming || [];
      outgoingRequests = data.outgoing || [];
      updateFriendsBadge();
    } catch (err) { /* 無視 */ }
  }

  async function fetchDMUnreadSummary(){
    if (!authToken) return;
    try {
      const res = await fetch(`${API_BASE_URL}/api/dm/unread-summary`, {
        headers: { 'Authorization': `Bearer ${authToken}` }
      });
      if (!res.ok) return;
      const data = await res.json();
      dmUnreadTotal = data.total || 0;
      dmMentionCount = data.mentions || 0;
      dmPerFriendUnread = data.perFriend || {};
      updateFriendsBadge();
    } catch (err) { /* 無視 */ }
  }

  async function sendFriendRequest(toId){
    if (!authToken) { alert('ログインが必要です'); return; }
    if (!toId) return;
    try {
      const res = await fetch(`${API_BASE_URL}/api/friends/request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` },
        body: JSON.stringify({ toId })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '申請に失敗しました');
      await fetchFriendsData();
      if (modalContent.dataset.mode === 'friends') renderFriendsModal('requests');
      else if (modalContent.dataset.mode === 'profile') alert('フレンド申請を送りました！');
    } catch (err) { alert(err.message); }
  }

  async function respondFriendRequest(fromId, action){
    try {
      const res = await fetch(`${API_BASE_URL}/api/friends/respond`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` },
        body: JSON.stringify({ fromId, action })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '処理に失敗しました');
      await fetchFriendsData();
      renderFriendsModal('requests');
    } catch (err) { alert(err.message); }
  }

  async function cancelFriendRequest(toId){
    try {
      await fetch(`${API_BASE_URL}/api/friends/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` },
        body: JSON.stringify({ toId })
      });
      await fetchFriendsData();
      renderFriendsModal('requests');
    } catch (err) { /* 無視 */ }
  }

  // ===================== 🆕 フレンド対決(タイムアタックで勝負) =====================
  async function fetchDuelsList(){
    if (!authToken) return;
    try {
      const res = await fetch(`${API_BASE_URL}/api/duels/list`, {
        headers: { 'Authorization': `Bearer ${authToken}` }
      });
      if (!res.ok) return;
      const data = await res.json();
      duelsList = data.duels || [];
    } catch (err) { /* 無視 */ }
  }

  async function challengeFriend(opponentId, game){
    if (!authToken) { alert('ログインが必要です'); return; }
    try {
      const res = await fetch(`${API_BASE_URL}/api/duels/challenge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` },
        body: JSON.stringify({ opponentId, game: game || 'candy' })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '対決の申し込みに失敗しました');
      await fetchDuelsList();
      renderFriendsModal('duels');
    } catch (err) { alert(err.message); }
  }

  async function respondDuel(duelId, accept){
    try {
      const res = await fetch(`${API_BASE_URL}/api/duels/${duelId}/respond`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` },
        body: JSON.stringify({ accept })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '処理に失敗しました');
      await fetchDuelsList();
      renderFriendsModal('duels');
    } catch (err) { alert(err.message); }
  }

  function playDuel(duel){
    currentDuelId = duel.id;
    closeModal();
    if(duel.game === 'tetris'){
      // テトリス対決: 2分間のウルトラ。スコアが高い方が勝ち
      if(currentMode==='timeattack') stopTimeAttackTimer();
      hideTitleScreen();
      tetrisDuelPending = true;
      if(currentMode==='tetris') exitTetrisMode();
      enterTetrisMode();
      return;
    }
    startTimeAttackMode();
  }

  async function submitDuelScore(duelId, finalScore){
    try {
      const res = await fetch(`${API_BASE_URL}/api/duels/${duelId}/submit-score`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` },
        body: JSON.stringify({ score: finalScore })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      return data.duel;
    } catch (err) { return null; }
  }

  function duelResultText(duel){
    const isChallenger = duel.challenger_id === currentUserId;
    const myScore = isChallenger ? duel.challenger_score : duel.opponent_score;
    const oppScore = isChallenger ? duel.opponent_score : duel.challenger_score;
    const oppId = isChallenger ? duel.opponent_id : duel.challenger_id;
    if (duel.status !== 'completed') return `対 ${oppId}：相手の結果を待っています…`;
    if (myScore > oppScore) return `🏆 対 ${oppId} に勝利！（自分 ${myScore} - 相手 ${oppScore}）🪙+200コイン獲得！`;
    if (myScore < oppScore) return `😢 対 ${oppId} に敗北…（自分 ${myScore} - 相手 ${oppScore}）`;
    return `🤝 対 ${oppId} と引き分け（${myScore} - ${oppScore}）🪙+50コイン獲得！`;
  }

  async function removeFriendFn(friendId){
    if (!confirm(`${friendId} をフレンドから削除しますか？\nDMの履歴は残りますが、再度フレンドになるまで送信できません。`)) return;
    try {
      await fetch(`${API_BASE_URL}/api/friends/remove`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` },
        body: JSON.stringify({ friendId })
      });
      await fetchFriendsData();
      renderFriendsModal('friends');
    } catch (err) { /* 無視 */ }
  }

  async function fetchDMMessages(friendId){
    try {
      const res = await fetch(`${API_BASE_URL}/api/dm/messages/${friendId}`, {
        headers: { 'Authorization': `Bearer ${authToken}` }
      });
      if (!res.ok) throw new Error((await res.json()).error || '取得に失敗しました');
      return await res.json();
    } catch (err) { return []; }
  }

  async function sendDM(toId, message){
    try {
      const res = await fetch(`${API_BASE_URL}/api/dm/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` },
        body: JSON.stringify({ toId, message })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '送信に失敗しました');
      return true;
    } catch (err) { alert(err.message); return false; }
  }

  function renderFriendsModal(tab){
    tab = tab || 'friends';
    modalContent.dataset.mode = 'friends';
    let html = `
      <h2 style="color:var(--gold);">👥 フレンド・DM</h2>
      <div class="tab-row">
        <button class="tab-btn ${tab==='friends'?'active':''}" data-ftab="friends">フレンド</button>
        <button class="tab-btn ${tab==='requests'?'active':''}" data-ftab="requests">リクエスト${incomingRequests.length?` (${incomingRequests.length})`:''}</button>
        <button class="tab-btn ${tab==='dm'?'active':''}" data-ftab="dm">DM</button>
        <button class="tab-btn ${tab==='duels'?'active':''}" data-ftab="duels">⚔️ 対決</button>
      </div>
      <div id="friendsTabBody">`;

    if (tab === 'friends') {
      html += `
        <div class="friend-add-row">
          <input type="text" id="friendAddInput" placeholder="ユーザーIDでフレンド申請...">
          <button class="primary-btn" id="friendAddBtn" style="width:auto; margin:0; padding:10px 16px;">申請</button>
        </div>`;
      if (friendsList.length === 0) {
        html += `<div class="empty-hint">まだフレンドがいません。上の欄にIDを入力して申請しましょう。</div>`;
      } else {
        friendsList.forEach(f => {
          const unread = dmPerFriendUnread[f.id] || 0;
          html += `
            <div class="friend-item">
              <span class="fname" data-showprofile="${f.id}">
                <span class="online-dot ${f.online ? 'on' : 'off'}"></span>${f.id}${unread ? `<span class="funread">${unread}</span>` : ''}
              </span>
              <span class="fsub">${f.online ? '🟢 オンライン' : 'オフライン'}</span>
              <button class="fbtn" data-challenge="${f.id}" data-game="candy">🍬 対決</button>
              <button class="fbtn" data-challenge="${f.id}" data-game="tetris">🧱 対決</button>
              <button class="fbtn remove" data-removefriend="${f.id}">削除</button>
            </div>`;
        });
      }
    } else if (tab === 'duels') {
      const pendingIncoming = duelsList.filter(d => d.status==='pending' && d.opponent_id===currentUserId);
      const pendingOutgoing = duelsList.filter(d => d.status==='pending' && d.challenger_id===currentUserId);
      const playable = duelsList.filter(d => d.status==='accepted' &&
        ((d.challenger_id===currentUserId && d.challenger_score===null) || (d.opponent_id===currentUserId && d.opponent_score===null)));
      const waiting = duelsList.filter(d => d.status==='accepted' &&
        ((d.challenger_id===currentUserId && d.challenger_score!==null) || (d.opponent_id===currentUserId && d.opponent_score!==null)));
      const completed = duelsList.filter(d => d.status==='completed');
      html += `<div class="sub" style="margin-bottom:8px;">🍬 キャンディ対決=タイムアタック(${TIME_ATTACK_DURATION}秒)、🧱 テトリス対決=ウルトラ(${TETRIS_ULTRA_SECONDS}秒)。スコアが高い方の勝ち！フレンド一覧の「対決」ボタンから挑戦できます。</div>`;
      html += `<div class="qtitle" style="margin:10px 0 6px;">📥 届いている挑戦</div>`;
      html += pendingIncoming.length===0 ? `<div class="empty-hint">届いている挑戦はありません。</div>` :
        pendingIncoming.map(d=>`
          <div class="friend-item pending">
            <span class="fname">${d.game==='tetris'?'🧱':'🍬'} ${d.challenger_id}</span>
            <button class="fbtn accept" data-duelaccept="${d.id}">受ける</button>
            <button class="fbtn decline" data-dueldecline="${d.id}">断る</button>
          </div>`).join('');
      html += `<div class="qtitle" style="margin:14px 0 6px;">🎮 プレイ可能な対決</div>`;
      html += playable.length===0 ? `<div class="empty-hint">プレイ可能な対決はありません。</div>` :
        playable.map(d=>{
          const opp = d.challenger_id===currentUserId ? d.opponent_id : d.challenger_id;
          return `
          <div class="friend-item chat">
            <span class="fname">${d.game==='tetris'?'🧱':'🍬'} 対 ${opp}</span>
            <button class="fbtn" data-duelplay="${d.id}">プレイする</button>
          </div>`;
        }).join('');
      html += `<div class="qtitle" style="margin:14px 0 6px;">⏳ 結果待ち・送信済みの挑戦</div>`;
      const pendingAndWaiting = [...pendingOutgoing, ...waiting];
      html += pendingAndWaiting.length===0 ? `<div class="empty-hint">ありません。</div>` :
        pendingAndWaiting.map(d=>{
          const opp = d.challenger_id===currentUserId ? d.opponent_id : d.challenger_id;
          return `<div class="friend-item pending"><span class="fname">⚔️ 対 ${opp}</span><span class="fsub">結果待ち…</span></div>`;
        }).join('');
      html += `<div class="qtitle" style="margin:14px 0 6px;">🏁 完了した対決</div>`;
      html += completed.length===0 ? `<div class="empty-hint">まだありません。</div>` :
        completed.slice(0,10).map(d=>`<div class="friend-item"><span class="fname" style="flex:1;">${duelResultText(d)}</span></div>`).join('');
    } else if (tab === 'requests') {
      html += `<div class="qtitle" style="margin-bottom:6px;">📥 届いている申請</div>`;
      if (incomingRequests.length === 0) {
        html += `<div class="empty-hint">届いている申請はありません。</div>`;
      } else {
        incomingRequests.forEach(r => {
          html += `
            <div class="friend-item pending">
              <span class="fname" data-showprofile="${r.id}">🔔 ${r.id}</span>
              <button class="fbtn accept" data-accept="${r.id}">承認</button>
              <button class="fbtn decline" data-decline="${r.id}">拒否</button>
            </div>`;
        });
      }
      html += `<div class="qtitle" style="margin:14px 0 6px;">📤 送信した申請</div>`;
      if (outgoingRequests.length === 0) {
        html += `<div class="empty-hint">送信中の申請はありません。</div>`;
      } else {
        outgoingRequests.forEach(r => {
          html += `
            <div class="friend-item pending">
              <span class="fname">📤 ${r.id}</span>
              <span class="fsub">承認待ち</span>
              <button class="fbtn decline" data-cancel="${r.id}">取消</button>
            </div>`;
        });
      }
    } else if (tab === 'dm') {
      if (friendsList.length === 0) {
        html += `<div class="empty-hint">DMはフレンドとのみ可能です。まずはフレンドになりましょう。</div>`;
      } else {
        friendsList.forEach(f => {
          const unread = dmPerFriendUnread[f.id] || 0;
          html += `
            <div class="friend-item chat" data-openthread="${f.id}" style="cursor:pointer;">
              <span class="fname">💬 ${f.id}${unread ? `<span class="funread">${unread}</span>` : ''}</span>
              <span class="fsub">タップして会話を開く →</span>
            </div>`;
        });
      }
    }
    html += `</div>`;
    modalContent.innerHTML = html;

    modalContent.querySelectorAll('.tab-btn[data-ftab]').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (btn.dataset.ftab === 'duels') await fetchDuelsList();
        renderFriendsModal(btn.dataset.ftab);
      });
    });
    const addBtn = document.getElementById('friendAddBtn');
    if (addBtn) {
      addBtn.addEventListener('click', () => {
        const input = document.getElementById('friendAddInput');
        const val = input.value.trim();
        if (!val) return;
        sendFriendRequest(val);
        input.value = '';
      });
    }
    modalContent.querySelectorAll('[data-showprofile]').forEach(el => {
      el.addEventListener('click', () => showProfile(el.dataset.showprofile));
    });
    modalContent.querySelectorAll('[data-dm]').forEach(el => {
      el.addEventListener('click', () => openDMThread(el.dataset.dm));
    });
    modalContent.querySelectorAll('[data-removefriend]').forEach(el => {
      el.addEventListener('click', () => removeFriendFn(el.dataset.removefriend));
    });
    modalContent.querySelectorAll('[data-accept]').forEach(el => {
      el.addEventListener('click', () => respondFriendRequest(el.dataset.accept, 'accept'));
    });
    modalContent.querySelectorAll('[data-decline]').forEach(el => {
      el.addEventListener('click', () => respondFriendRequest(el.dataset.decline, 'decline'));
    });
    modalContent.querySelectorAll('[data-cancel]').forEach(el => {
      el.addEventListener('click', () => cancelFriendRequest(el.dataset.cancel));
    });
    modalContent.querySelectorAll('[data-openthread]').forEach(el => {
      el.addEventListener('click', () => openDMThread(el.dataset.openthread));
    });
    modalContent.querySelectorAll('[data-challenge]').forEach(el => {
      el.addEventListener('click', () => challengeFriend(el.dataset.challenge, el.dataset.game));
    });
    modalContent.querySelectorAll('[data-duelaccept]').forEach(el => {
      el.addEventListener('click', () => respondDuel(el.dataset.duelaccept, true));
    });
    modalContent.querySelectorAll('[data-dueldecline]').forEach(el => {
      el.addEventListener('click', () => respondDuel(el.dataset.dueldecline, false));
    });
    modalContent.querySelectorAll('[data-duelplay]').forEach(el => {
      el.addEventListener('click', () => {
        const duel = duelsList.find(d => String(d.id)===el.dataset.duelplay);
        if (duel) playDuel(duel);
      });
    });
  }

  async function openDMThread(friendId){
    dmThreadWith = friendId;
    modalContent.dataset.mode = 'dmthread';
    const initial = (friendId||'?').charAt(0).toUpperCase();
    modalContent.innerHTML = `
      <div class="dm-thread-header">
        <button class="dm-thread-back" id="dmBackBtn">←</button>
        <div class="dm-thread-avatar">${initial}</div>
        <div class="dm-thread-title"><b>${friendId}</b><span>💬 ダイレクトメッセージ</span></div>
      </div>
      <div id="dmMessages" style="height:300px; overflow-y:auto; background:var(--bg-deep2); border-radius:12px; padding:10px; margin:8px 0; border:1px solid rgba(255,255,255,0.05);">
        <div class="empty-hint">読み込み中...</div>
      </div>
      <div style="display:flex; gap:6px;">
        <input type="text" id="dmInput" placeholder="メッセージを入力...(@IDでメンション)" style="flex:1; padding:10px 12px; border-radius:12px; border:1px solid rgba(255,255,255,0.12); background:var(--bg-deep2); color:var(--text); font-size:14px; font-family:'Nunito',sans-serif;">
        <button class="primary-btn" id="dmSendBtn" style="flex-shrink:0; width:auto; padding:10px 20px; margin:0;">送信</button>
      </div>
    `;

    async function loadThread(){
      const msgs = await fetchDMMessages(friendId);
      const container = document.getElementById('dmMessages');
      if (!container) return;
      if (msgs.length === 0) {
        container.innerHTML = `<div class="empty-hint">まだメッセージがありません。話しかけてみましょう！</div>`;
      } else {
        container.innerHTML = msgs.map(m => {
          const mine = m.from_id === currentUserId;
          return `
            <div class="dm-bubble-row ${mine ? 'mine' : ''}">
              <div class="dm-bubble-col">
                <div class="dm-bubble">${highlightMentions(m.message)}</div>
                <div class="dm-time" style="text-align:${mine ? 'right' : 'left'};">${new Date(m.timestamp).toLocaleTimeString('ja-JP')}</div>
              </div>
            </div>`;
        }).join('');
      }
      container.scrollTop = container.scrollHeight;
      fetchDMUnreadSummary(); // 既読になったのでバッジを更新
    }
    await loadThread();

    document.getElementById('dmSendBtn').addEventListener('click', async () => {
      const input = document.getElementById('dmInput');
      const msg = input.value.trim();
      if (!msg) return;
      const ok = await sendDM(friendId, msg);
      if (ok) { input.value = ''; await loadThread(); }
    });
    document.getElementById('dmInput').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') document.getElementById('dmSendBtn').click();
    });
    document.getElementById('dmBackBtn').addEventListener('click', () => {
      dmThreadWith = null;
      renderFriendsModal('dm');
    });

    if (dmPollingInterval) clearInterval(dmPollingInterval);
    dmPollingInterval = setInterval(loadThread, 3000);
  }

  friendsBtn.addEventListener('click', async () => {
    if (!authToken) { alert('ログインするとフレンド・DM機能が使えます'); return; }
    // 先にモーダルを開いて「読み込み中」を見せ、通信が終わってから中身を差し替える
    // (以前は通信完了までモーダル自体が開かず、待ち時間があるように感じられていた)
    modalContent.dataset.mode = 'friends';
    modalContent.innerHTML = `<h2 style="color:var(--gold);">👥 フレンド・DM</h2><div class="empty-hint">読み込み中...</div>`;
    modalOverlay.classList.add('show');
    const observer = new MutationObserver(() => {
      if (!modalOverlay.classList.contains('show')) {
        if (dmPollingInterval) { clearInterval(dmPollingInterval); dmPollingInterval = null; }
        dmThreadWith = null;
      }
    });
    observer.observe(modalOverlay, { attributes: true, attributeFilter: ['class'] });
    await fetchFriendsData();
    await fetchDMUnreadSummary();
    if (modalOverlay.classList.contains('show')) {
      renderFriendsModal(incomingRequests.length ? 'requests' : 'friends');
    }
  });

  // ===================== テトリスモード =====================
  const TETRIS_COLS = 10, TETRIS_ROWS = 20;
  const TETROMINOES = {
    I: { matrix:[[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]], color:2 },
    O: { matrix:[[1,1],[1,1]], color:6 },
    T: { matrix:[[0,1,0],[1,1,1],[0,0,0]], color:3 },
    S: { matrix:[[0,1,1],[1,1,0],[0,0,0]], color:1 },
    Z: { matrix:[[1,1,0],[0,1,1],[0,0,0]], color:0 },
    J: { matrix:[[1,0,0],[1,1,1],[0,0,0]], color:4 },
    L: { matrix:[[0,0,1],[1,1,1],[0,0,0]], color:5 }
  };
  const TETROMINO_KEYS = Object.keys(TETROMINOES);
  const TETRIS_LINE_LABELS = { 1:'シングル!', 2:'ダブル!', 3:'トリプル!', 4:'テトリス!!' };
  const TETRIS_LINE_POINTS = { 1:100, 2:300, 3:500, 4:800 };

  // <SRS-PURE-BEGIN>
  // ===== SRS(スーパーローテーションシステム)のウォールキック表(時計回り) =====
  // [x(右が+), y(上が+)] のオフセット。盤面は行が下向きなので、使うときに row -= y する。
  // 回転状態 rot: 0=スポーン, 1=右(R), 2=反転, 3=左(L)。配列のindexは「今の回転状態からの時計回り」。
  const SRS_KICKS_JLSTZ = [
    [[0,0],[-1,0],[-1,1],[0,-2],[-1,-2]],   // 0→R
    [[0,0],[1,0],[1,-1],[0,2],[1,2]],       // R→2
    [[0,0],[1,0],[1,1],[0,-2],[1,-2]],      // 2→L
    [[0,0],[-1,0],[-1,-1],[0,2],[-1,2]]     // L→0
  ];
  const SRS_KICKS_I = [
    [[0,0],[-2,0],[1,0],[-2,-1],[1,2]],
    [[0,0],[-1,0],[2,0],[-1,2],[2,-1]],
    [[0,0],[2,0],[-1,0],[2,1],[-1,-2]],
    [[0,0],[1,0],[-2,0],[1,-2],[-2,1]]
  ];
  // ===== Tスピン判定(3コーナールール) =====
  // Tの中心の斜め4マス(壁・床も「埋まっている」扱い)のうち3つ以上が埋まっていて、
  // 最後の操作が回転ならTスピン。向いている側の2マス(front)が両方埋まっていれば本物、
  // frontが片方だけならミニ。ただし最後の回転が5番目のキック(1×2マス動く)ならミニでも本物扱い。
  // 座標は T の3×3の箱の中の [row, col]
  const T_FRONT_CORNERS = [ [[0,0],[0,2]], [[0,2],[2,2]], [[2,0],[2,2]], [[0,0],[2,0]] ];
  const T_BACK_CORNERS  = [ [[2,0],[2,2]], [[0,0],[2,0]], [[0,0],[0,2]], [[0,2],[2,2]] ];
  function detectTSpin(isOccupied, row, col, rot, lastRotated, lastKickIndex){
    if(!lastRotated) return null;
    const count = (list) => list.reduce((n,[dr,dc]) => n + (isOccupied(row+dr, col+dc) ? 1 : 0), 0);
    const front = count(T_FRONT_CORNERS[rot]);
    const back = count(T_BACK_CORNERS[rot]);
    if(front + back < 3) return null;
    if(front === 2 || lastKickIndex === 4) return 'tspin';
    return 'mini';
  }
  // ===== 得点(すべて × レベル) =====
  const TSPIN_POINTS = {
    tspin: { 0:400, 1:800, 2:1200, 3:1600 },
    mini:  { 0:100, 1:200, 2:400,  3:1600 }
  };
  const PERFECT_CLEAR_POINTS = { 1:800, 2:1200, 3:1800, 4:2000 };
  const PERFECT_CLEAR_B2B_TETRIS = 3200;
  function perfectClearBonus(lines, b2bTetris, level){
    if(lines === 4 && b2bTetris) return PERFECT_CLEAR_B2B_TETRIS * level;
    return (PERFECT_CLEAR_POINTS[lines] || 0) * level;
  }
  // <SRS-PURE-END>
  const TSPIN_LINE_NAMES = { 1:'シングル', 2:'ダブル', 3:'トリプル' };

  let tetrisActive = false, tetrisGameOver = false;
  let tetrisGrid = null, tetrisPiece = null, tetrisNextType = null, tetrisBag = [];
  let tetrisScore = 0, tetrisLevel = 1, tetrisLines = 0, tetrisCombo = 0, tetrisBackToBack = false;
  let tetrisTimer = null, tetrisCellEls = [];
  let tetrisBest = 0;
  let tetrisHoldType = null, tetrisHoldUsed = false;
  let tetrisRunMode = 'solo';       // 今プレイ中のテトリスの種類: 'solo'|'vs'|'sprint'|'ultra'(フレンド対決は常にultra)
  let tetrisDuelPending = false;    // フレンド対決(テトリス)として開始するか
  const TETRIS_SPRINT_LINES = 40, TETRIS_ULTRA_SECONDS = 120;
  let tetrisClockStart = 0, tetrisClockTimer = null;
  let tetrisStats = { tspins:0, pcs:0, startLines:0 };       // イベント報告用(Tスピン回数・パーフェクトクリア回数)
  const TETRIS_REC_KEY = 'candyblast-tetris-records-v1';
  let tetrisRecords = { sprintMs:null, ultraScore:0 };
  try{ Object.assign(tetrisRecords, JSON.parse(localStorage.getItem(TETRIS_REC_KEY) || '{}')); }catch(e){}
  function saveTetrisRecords(){ try{ localStorage.setItem(TETRIS_REC_KEY, JSON.stringify(tetrisRecords)); }catch(e){} }
  function fmtClock(ms){ const t = Math.max(0, ms), m = Math.floor(t/60000), sec = Math.floor(t%60000/1000), cs = Math.floor(t%1000/10); return `${m}:${String(sec).padStart(2,'0')}.${String(cs).padStart(2,'0')}`; }
  function tetrisIsTimed(){ return tetrisRunMode==='sprint' || tetrisRunMode==='ultra'; }
  function vibrate(ms){ if(uiPrefs.vibrate && navigator.vibrate){ try{ navigator.vibrate(ms); }catch(e){} } }

  function stopTetrisClock(){ if(tetrisClockTimer){ clearInterval(tetrisClockTimer); tetrisClockTimer = null; } }
  function startTetrisClock(){
    stopTetrisClock();
    tetrisClockStart = performance.now();
    timeAttackCardEl.style.display = tetrisIsTimed() ? 'flex' : 'none';
    timeAttackCardEl.classList.remove('urgent');
    if(!tetrisIsTimed()) return;
    const tick = ()=>{
      const el = performance.now() - tetrisClockStart;
      if(tetrisRunMode==='ultra'){
        const left = TETRIS_ULTRA_SECONDS*1000 - el;
        timeAttackValEl.textContent = fmtClock(left);
        timeAttackCardEl.classList.toggle('urgent', left <= 10000);
        if(left <= 0) tetrisEndTimed('ultra');
      } else {
        timeAttackValEl.textContent = fmtClock(el);
      }
    };
    tick();
    tetrisClockTimer = setInterval(tick, 50);
  }
  let tetrisLastRotate = false, tetrisLastKick = 0; // Tスピン判定用: 最後の操作が回転か / 何番目のキックか

// ===================== 🤖 AI対戦用の状態 =====================
  let aiGrid = null, aiPiece = null, aiNextType = null, aiBag = [];
  let aiScore = 0, aiLevel = 1, aiLines = 0, aiCombo = 0, aiBackToBack = false;
  let aiActive = false, aiGameOver = false;
  let aiTimer = null, aiCellEls = [];
  let aiGravityTimer = null; // ★プレイヤーと同じ「重力落下」タイマー(難易度の思考速度とは別に動く)

  const tetrisPlayerScoreEl = document.getElementById('tetrisPlayerScore');
  const tetrisAiScoreEl = document.getElementById('tetrisAiScore');

  function rotateMatrixCW(m){
    const n = m.length;
    const res = Array.from({length:n}, ()=>Array(n).fill(0));
    for(let r=0;r<n;r++) for(let c=0;c<n;c++) res[c][n-1-r] = m[r][c];
    return res;
  }

  function pad4x4(matrix){
    const n = matrix.length;
    const res = Array.from({length:4}, ()=>Array(4).fill(0));
    const offset = Math.floor((4-n)/2);
    for(let r=0;r<n;r++) for(let c=0;c<n;c++) res[r+offset][c+offset] = matrix[r][c];
    return res;
  }

  function tetrisRandomType(){
    if(!tetrisBag || tetrisBag.length===0){
      tetrisBag = [...TETROMINO_KEYS];
      for(let i=tetrisBag.length-1;i>0;i--){
        const j = Math.floor(Math.random()*(i+1));
        [tetrisBag[i], tetrisBag[j]] = [tetrisBag[j], tetrisBag[i]];
      }
    }
    return tetrisBag.pop();
  }

  function tetrisCollides(matrix, row, col){
    for(let r=0;r<matrix.length;r++){
      for(let c=0;c<matrix[r].length;c++){
        if(!matrix[r][c]) continue;
        const gr = row+r, gc = col+c;
        if(gc<0 || gc>=TETRIS_COLS || gr>=TETRIS_ROWS) return true;
        if(gr>=0 && tetrisGrid[gr][gc] !== -1) return true;
      }
    }
    return false;
  }

  function initTetrisBoard(){
    tetrisBoardEl.innerHTML = '';
    tetrisCellEls = [];
    for(let i=0;i<TETRIS_ROWS*TETRIS_COLS;i++){
      const cell = document.createElement('div');
      cell.className = 'tetris-cell';
      tetrisBoardEl.appendChild(cell);
      tetrisCellEls.push(cell);
    }
  }

  function paintTetrisPiece(matrix, row, col, colorIdx, isGhost){
    for(let r=0;r<matrix.length;r++){
      for(let c=0;c<matrix[r].length;c++){
        if(!matrix[r][c]) continue;
        const gr = row+r, gc = col+c;
        if(gr<0 || gr>=TETRIS_ROWS || gc<0 || gc>=TETRIS_COLS) continue;
        const cell = tetrisCellEls[gr*TETRIS_COLS+gc];
        if(isGhost){
          if(!cell.classList.contains('filled')) cell.classList.add('ghost');
        } else {
          cell.classList.add('filled');
          cell.classList.remove('ghost');
          cell.style.background = COLORS[colorIdx].bg;
        }
      }
    }
  }

  function renderTetrisNext(){
    tetrisNextEl.innerHTML = '';
    if(!tetrisNextType) return;
    const def = TETROMINOES[tetrisNextType];
    const m = pad4x4(def.matrix);
    for(let r=0;r<4;r++){
      for(let c=0;c<4;c++){
        const cell = document.createElement('div');
        cell.className = 'tetris-next-cell';
        if(m[r][c]) cell.style.background = COLORS[def.color].bg;
        else cell.classList.add('empty');
        tetrisNextEl.appendChild(cell);
      }
    }
  }

  function renderTetrisHold(){
    tetrisHoldBoxEl.innerHTML = '';
    tetrisHoldBoxEl.classList.toggle('used', tetrisHoldUsed);
    if(!tetrisHoldType) return;
    const def = TETROMINOES[tetrisHoldType];
    const m = pad4x4(def.matrix);
    for(let r=0;r<4;r++){
      for(let c=0;c<4;c++){
        const cell = document.createElement('div');
        cell.className = 'tetris-next-cell';
        if(m[r][c]) cell.style.background = COLORS[def.color].bg;
        else cell.classList.add('empty');
        tetrisHoldBoxEl.appendChild(cell);
      }
    }
  }

  function renderTetris(){
    for(let r=0;r<TETRIS_ROWS;r++){
      for(let c=0;c<TETRIS_COLS;c++){
        const idx = r*TETRIS_COLS+c;
        const cell = tetrisCellEls[idx];
        const val = tetrisGrid[r][c];
        cell.className = 'tetris-cell';
        cell.style.background = (val!==-1) ? COLORS[val].bg : '';
        if(val!==-1) cell.classList.add('filled');
      }
    }
    if(tetrisPiece){
      let ghostRow = tetrisPiece.row;
      while(!tetrisCollides(tetrisPiece.matrix, ghostRow+1, tetrisPiece.col)) ghostRow++;
      paintTetrisPiece(tetrisPiece.matrix, ghostRow, tetrisPiece.col, null, true);
      paintTetrisPiece(tetrisPiece.matrix, tetrisPiece.row, tetrisPiece.col, tetrisPiece.color, false);
    }
    renderTetrisNext();
    renderTetrisHold();
    tetrisLevelEl.textContent = tetrisLevel;
    tetrisLinesEl.textContent = tetrisLines;
  }

  // ★プレイヤー・AI共通の「レベルに応じた自然落下スピード」計算(以前はAI専用の別ロジックだったのを統一)
  function dropIntervalForLevel(level){
    return Math.max(90, 1000 - (level-1)*70);
  }
  function tetrisDropIntervalMs(){
    return dropIntervalForLevel(tetrisLevel);
  }
  function tetrisStopLoop(){
    if(tetrisTimer){ clearInterval(tetrisTimer); tetrisTimer = null; }
  }
  function tetrisStartLoop(){
    tetrisStopLoop();
    tetrisTimer = setInterval(tetrisTick, tetrisDropIntervalMs());
  }
  function tetrisTick(){
    if(!tetrisActive || tetrisGameOver || !tetrisPiece) return;
    if(!tetrisCollides(tetrisPiece.matrix, tetrisPiece.row+1, tetrisPiece.col)){
      tetrisPiece.row++;
      tetrisLastRotate = false;
      renderTetris();
    } else {
      tetrisLockPiece();
    }
  }

  function tetrisSpawnPiece(){
    const type = tetrisNextType || tetrisRandomType();
    tetrisNextType = tetrisRandomType();
    const def = TETROMINOES[type];
    const matrix = def.matrix.map(row=>row.slice());
    const col = Math.floor((TETRIS_COLS - matrix.length)/2);
    const row = -1;
    tetrisPiece = { type, matrix, color: def.color, row, col, rot: 0 };
    tetrisLastRotate = false;
    if(tetrisCollides(matrix, row, col)){
      tetrisTriggerGameOver();
      return;
    }
    renderTetris();
    tetrisStartLoop();
  }

  function tetrisMove(dx){
    if(!tetrisActive || tetrisGameOver || !tetrisPiece) return;
    const nc = tetrisPiece.col+dx;
    if(!tetrisCollides(tetrisPiece.matrix, tetrisPiece.row, nc)){
      tetrisPiece.col = nc;
      tetrisLastRotate = false;
      renderTetris();
    }
  }

  function tetrisRotate(){
    if(!tetrisActive || tetrisGameOver || !tetrisPiece || tetrisPiece.type==='O') return;
    const p = tetrisPiece;
    const rotated = rotateMatrixCW(p.matrix);
    const table = (p.type === 'I') ? SRS_KICKS_I : SRS_KICKS_JLSTZ;
    const kicks = table[p.rot];
    for(let i=0;i<kicks.length;i++){
      const [dx, dy] = kicks[i];
      const nr = p.row - dy, nc = p.col + dx;
      if(!tetrisCollides(rotated, nr, nc)){
        p.matrix = rotated;
        p.row = nr;
        p.col = nc;
        p.rot = (p.rot + 1) % 4;
        tetrisLastRotate = true;
        tetrisLastKick = i;
        renderTetris();
        return;
      }
    }
  }

  function tetrisSoftDrop(){
    if(!tetrisActive || tetrisGameOver || !tetrisPiece) return;
    if(!tetrisCollides(tetrisPiece.matrix, tetrisPiece.row+1, tetrisPiece.col)){
      tetrisPiece.row++;
      tetrisLastRotate = false;
      tetrisScore += 1;
      scoreValEl.textContent = tetrisScore;
      renderTetris();
    } else {
      tetrisLockPiece();
    }
  }

  function tetrisHardDrop(){
    if(!tetrisActive || tetrisGameOver || !tetrisPiece) return;
    let dist = 0;
    while(!tetrisCollides(tetrisPiece.matrix, tetrisPiece.row+1, tetrisPiece.col)){
      tetrisPiece.row++;
      dist++;
    }
    if(dist>0){
      tetrisLastRotate = false;
      tetrisScore += dist*2;
      scoreValEl.textContent = tetrisScore;
    }
    tetrisLockPiece();
  }

  // ===================== ホールド(テトリス99のように現在のピースを保持/交換) =====================
  function tetrisHoldSwap(){
    if(!tetrisActive || tetrisGameOver || !tetrisPiece || tetrisHoldUsed) return;
    const currentType = tetrisPiece.type;
    tetrisHoldUsed = true;
    if(tetrisHoldType === null){
      tetrisHoldType = currentType;
      tetrisSpawnPiece(); // ネクストから補充(ホールドが空の場合)
    } else {
      const swapType = tetrisHoldType;
      tetrisHoldType = currentType;
      const def = TETROMINOES[swapType];
      const matrix = def.matrix.map(row=>row.slice());
      const col = Math.floor((TETRIS_COLS - matrix.length)/2);
      if(tetrisCollides(matrix, -1, col)){ tetrisTriggerGameOver(); return; }
      tetrisPiece = { type:swapType, matrix, color:def.color, row:-1, col, rot:0 };
      tetrisLastRotate = false;
      renderTetris();
      tetrisStartLoop();
    }
    renderTetrisHold();
  }

  function showTetrisCombo(msg, cls){
    tetrisComboTextEl.textContent = msg;
    tetrisComboTextEl.className = 'combo-text show' + (cls ? (' '+cls) : '');
    setTimeout(()=>{ tetrisComboTextEl.className = 'combo-text'; }, 900);
  }

  function tetrisFloatCoin(amount){
    const rect = tetrisBoardEl.getBoundingClientRect();
    const el = document.createElement('div');
    el.className = 'coin-float';
    el.textContent = `+${amount}🪙`;
    el.style.left = (rect.left+rect.width/2-20)+'px';
    el.style.top = (rect.top+rect.height/2)+'px';
    el.style.animation = 'coinFloat 0.9s ease-out forwards';
    document.body.appendChild(el);
    setTimeout(()=>el.remove(), 950);
  }

  function tetrisClearRowsAnimated(rows, cb){
    rows.forEach(r=>{
      for(let c=0;c<TETRIS_COLS;c++){
        const cell = tetrisCellEls[r*TETRIS_COLS+c];
        if(cell) cell.classList.add('clearing');
      }
    });
    setTimeout(cb, 320);
  }

  function tetrisCollapseRows(rows){
    rows.slice().sort((a,b)=>a-b).forEach(r=>{
      tetrisGrid.splice(r,1);
      tetrisGrid.unshift(new Array(TETRIS_COLS).fill(-1));
    });
  }

  function tetrisRefreshScore(){
    animateNumberTo(scoreValEl, tetrisScore);
    tetrisPlayerScoreEl.textContent = tetrisScore;
    if(tetrisScore > tetrisBest){
      tetrisBest = tetrisScore;
      bestScores.tetris = tetrisBest;
      saveBestScores();
      animateNumberTo(bestValEl, tetrisBest);
    }
  }

  function tetrisLockPiece(){
    if(!tetrisPiece) return; // ★ロック済み(ライン消去アニメ中など)の二重ロックを防ぐ
    tetrisStopLoop();
    tetrisHoldUsed = false; // 新しいピースになったのでホールドをまた使えるようにする
    const { matrix, row, col, color, type, rot } = tetrisPiece;

    // Tスピン判定(盤面にピースを書き込む前に、斜め4マスの埋まり具合を見る)
    const spin = (type === 'T')
      ? detectTSpin((r,c)=>{
          if(c<0 || c>=TETRIS_COLS || r>=TETRIS_ROWS) return true; // 壁・床は埋まっている扱い
          if(r<0) return false;
          return tetrisGrid[r][c] !== -1;
        }, row, col, rot, tetrisLastRotate, tetrisLastKick)
      : null;

    let offBoard = false;
    for(let r=0;r<matrix.length;r++){
      for(let c=0;c<matrix[r].length;c++){
        if(!matrix[r][c]) continue;
        const gr = row+r, gc = col+c;
        if(gr<0){ offBoard = true; continue; }
        tetrisGrid[gr][gc] = color;
      }
    }
    // ★盤面に確定した時点で「操作中のピース」をなくす。
    //   以前はライン消去アニメ(約0.3秒)の間も操作できてしまい、▼長押しなどで同じピースが何度もロックされ、
    //   消去・行の削除・ピース生成が重複して、ブロックが一気に消えていた。
    tetrisPiece = null;
    if(offBoard){ tetrisTriggerGameOver(); return; }

    const cleared = [];
    for(let r=0;r<TETRIS_ROWS;r++){
      if(tetrisGrid[r].every(v=>v!==-1)) cleared.push(r);
    }

    if(cleared.length>0){
      tetrisCombo++;
      const n = cleared.length;
      const isTetris4 = n===4;
      const isDifficult = isTetris4 || !!spin; // テトリス、またはラインを消したTスピンは「難しい消し方」(B2B対象)
      const linePts = spin ? (TSPIN_POINTS[spin][n] || TSPIN_POINTS.tspin[n]) : TETRIS_LINE_POINTS[n];
      let gained = linePts * tetrisLevel;
      const comboBonus = tetrisCombo>1 ? Math.round(50 * tetrisCombo * tetrisLevel) : 0;
      const btbMult = (isDifficult && tetrisBackToBack) ? 1.5 : 1;
      const b2bTetris = isTetris4 && tetrisBackToBack;
      tetrisBackToBack = isDifficult;
      gained = Math.round(gained*btbMult) + comboBonus;

      // パーフェクトクリア: 消えるラインを除いて盤面が空なら、ボーナスを上乗せ
      const perfect = !tetrisGrid.some((rowArr, r)=> !cleared.includes(r) && rowArr.some(v=>v!==-1));
      if(perfect) gained += perfectClearBonus(n, b2bTetris, tetrisLevel);

      tetrisScore += gained;
      tetrisLines += n;
      tetrisLevel = Math.floor(tetrisLines/10)+1;
      if(spin) tetrisStats.tspins++;
      if(perfect) tetrisStats.pcs++;
      vibrate(perfect ? [30,40,30,40,60] : (isDifficult ? [25,30,40] : 15));
      tetrisRefreshScore();

      let msg = spin
        ? `${spin==='mini'?'ミニ':''}Tスピン ${TSPIN_LINE_NAMES[n] || n+'ライン'}!`
        : (TETRIS_LINE_LABELS[n] || `${n}ライン!`);
      if(btbMult>1) msg += ' B2B!';
      if(tetrisCombo>1) msg += ` ${tetrisCombo}コンボ!`;
      if(perfect) msg = `✨パーフェクトクリア!! ✨ ${msg}`;
      msg += ` +${gained}`;
      showTetrisCombo(msg, (isDifficult || perfect) ? 'mega' : (tetrisCombo>1 ? 'bonus' : ''));
      playSound('clear', (isDifficult) ? 4 : n);
      if(tetrisCombo>=3 || perfect) playSound('coin');

      // スプリント: 目標ライン数に達したら、アニメを待たずにクリア
      if(tetrisRunMode==='sprint' && tetrisLines >= TETRIS_SPRINT_LINES){
        tetrisClearRowsAnimated(cleared, ()=>{});
        tetrisEndTimed('sprint');
        return;
      }
      tetrisClearRowsAnimated(cleared, ()=>{
        tetrisCollapseRows(cleared);
        tetrisSpawnPiece();
      });
      return;
    }

    tetrisCombo = 0;
    if(spin){
      // ラインを消さないTスピンも得点(ただしB2Bには影響しない)
      const pts = TSPIN_POINTS[spin][0] * tetrisLevel;
      tetrisStats.tspins++;
      vibrate(20);
      tetrisScore += pts;
      tetrisRefreshScore();
      showTetrisCombo(`${spin==='mini'?'ミニ':''}Tスピン! +${pts}`, 'bonus');
      playSound('coin');
    } else {
      playSound('place');
    }
    tetrisSpawnPiece();
  }

function tetrisTriggerGameOver(){
    if(tetrisGameOver) return;
    tetrisGameOver = true;
    tetrisActive = false;
    tetrisStopLoop();
    stopTetrisClock();
    playSound('gameover');
    grantBattlePassXp(tetrisScore);
    // スプリントは「クリアしたとき」だけコイン報酬(失敗時は無し)
    const earned = (tetrisRunMode==='sprint') ? 0 : Math.max(0, Math.floor(tetrisScore/40));
    if(earned>0){
      coins += earned;
      updateCoinUI();
      tetrisFloatCoin(earned);
      playSound('coin');
    }
    tetrisPlayerScoreEl.textContent = tetrisScore;
    // ★VS AI ならAIと勝負、それ以外は通常の結果表示
    if(tetrisVsMode){
      endTetrisVsMatch('player');
    } else {
      endTetrisSolo(earned, tetrisRunMode==='sprint' ? 'sprint-fail' : (tetrisRunMode==='ultra' ? 'ultra-topout' : 'topout'));
    }
  }

  // 時間系モードの正常終了(sprint: 40ライン到達 / ultra: 2分経過)
  function tetrisEndTimed(kind){
    if(tetrisGameOver) return;
    tetrisGameOver = true;
    tetrisActive = false;
    tetrisStopLoop();
    stopTetrisClock();
    grantBattlePassXp(tetrisScore);
    let earned;
    if(kind==='sprint'){
      const ms = performance.now() - tetrisClockStart;
      // 速いほど多い: 基本300 + 60秒より速い分は1秒あたり+10(最大+500)
      earned = 300 + Math.max(0, Math.min(500, Math.round((60000 - ms)/1000) * 10));
    } else {
      earned = Math.max(0, Math.floor(tetrisScore/40));
    }
    if(earned>0){ coins += earned; updateCoinUI(); tetrisFloatCoin(earned); }
    playSound('coin');
    tetrisPlayerScoreEl.textContent = tetrisScore;
    endTetrisSolo(earned, kind==='sprint' ? 'sprint-clear' : 'ultra-end');
  }

  // ソロ系(ソロ/スプリント/ウルトラ/フレンド対決)の結果表示
  function endTetrisSolo(earned, outcome){
    tetrisStopLoop();
    stopTetrisClock();
    tetrisActive = false;
    outcome = outcome || 'topout';
    const elapsed = performance.now() - tetrisClockStart;
    let note = 'お疲れさまでした！';
    finalScoreEl.innerHTML = '';
    if(outcome==='sprint-clear'){
      const prev = tetrisRecords.sprintMs;
      const isBest = prev == null || elapsed < prev;
      if(isBest){ tetrisRecords.sprintMs = Math.round(elapsed); saveTetrisRecords(); }
      finalScoreEl.innerHTML = `<div style="font-size:15px; color:var(--gold);">🏁 40ライン クリア！</div><div>${fmtClock(elapsed)}</div>`;
      note = isBest ? '🎉 自己ベスト更新！' : `自己ベスト ${fmtClock(prev)}`;
    } else if(outcome==='sprint-fail'){
      finalScoreEl.innerHTML = `<div style="font-size:15px; color:var(--coral);">💥 ゲームオーバー</div><div>${tetrisLines} / ${TETRIS_SPRINT_LINES} ライン</div>`;
      note = tetrisRecords.sprintMs ? `自己ベスト ${fmtClock(tetrisRecords.sprintMs)}` : 'もう一度チャレンジ！';
    } else {
      const isNewBest = tetrisScore >= tetrisBest && tetrisScore > 0;
      finalScoreEl.textContent = tetrisScore;
      if(tetrisRunMode==='ultra'){
        const ub = tetrisScore > (tetrisRecords.ultraScore||0);
        if(ub){ tetrisRecords.ultraScore = tetrisScore; saveTetrisRecords(); }
        note = (outcome==='ultra-end' ? '⏳ タイムアップ！ ' : '') + (ub && tetrisScore>0 ? '🎉 ウルトラ自己ベスト更新！' : `ウルトラ自己ベスト ${tetrisRecords.ultraScore||0}`);
      } else {
        note = isNewBest ? '🎉 ハイスコア更新！' : 'お疲れさまでした！';
      }
    }
    newBestNoteEl.textContent = note;
    coinEarnedNoteEl.textContent = earned>0 ? `🪙 +${earned} コイン獲得！` : '';
    duelResultNoteEl.textContent = '';
    overlayEl.classList.add('show');

    // 🎃 イベント(キャンディ・ミッション)への報告
    const wasDuel = !!currentDuelId;
    reportEventGame({ mode:'tetris-'+tetrisRunMode, tetris:true, score: tetrisScore, lines: Math.max(0, tetrisLines - tetrisStats.startLines),
      tspins: tetrisStats.tspins, pcs: tetrisStats.pcs, duel: wasDuel });

    // フレンド対決: ウルトラのスコアを送信
    if(currentDuelId){
      const duelId = currentDuelId;
      currentDuelId = null;
      duelResultNoteEl.textContent = '対決の結果を送信中...';
      submitDuelScore(duelId, tetrisScore).then(duel=>{
        if(duel){
          duelResultNoteEl.textContent = duelResultText(duel);
          if(duel.status==='completed') syncFromServer();
        } else duelResultNoteEl.textContent = '対決結果の送信に失敗しました。';
      });
    }
    if(authToken && tetrisRunMode!=='sprint') syncToServer(tetrisScore);
    syncPlayTime();
  }

// VS対戦の結果表示（loser は 'player' or 'ai'）
  function endTetrisVsMatch(loser){
    // AIを止める
    stopAi();
    // プレイヤー側のループも止める
    tetrisStopLoop();
    tetrisActive = false;

    const playerScore = tetrisScore;
    const aiScoreVal = aiScore;
    let resultTitle = '';
    let resultColor = 'var(--gold)';
    // 先に積み上がって詰まった側が負け(以前はスコア比較だったため、AIが詰まったのに「敗北」と出ることがあった)
    if(loser === 'ai'){
      resultTitle = '🏆 あなたの勝利！';
      resultColor = 'var(--mint)';
    } else {
      resultTitle = '😢 あなたの敗北…';
      resultColor = 'var(--coral)';
    }

    // オーバーレイに表示
    finalScoreEl.innerHTML = `
      <div style="font-size:20px; margin-bottom:6px; color:${resultColor}; font-family:'Baloo 2', sans-serif;">
        ${resultTitle}
      </div>
      <div style="font-size:16px; color:var(--text);">
        👤 ${playerScore} 点 ／ 🤖 ${aiScoreVal} 点
      </div>
    `;
    newBestNoteEl.textContent = loser === 'player' ? 'あなたが先に詰まりました' : 'AIが先に詰まりました';
    coinEarnedNoteEl.textContent = '';
    duelResultNoteEl.textContent = '';
    overlayEl.classList.add('show');

    reportEventGame({ mode:'tetris-vs', tetris:true, vs:true, score: playerScore, lines: tetrisLines, tspins: tetrisStats.tspins, pcs: tetrisStats.pcs });
    // サーバーにスコアを送信（プレイヤーのみ）
    if(authToken){
      syncToServer(playerScore);
    }
    syncPlayTime();
  }

  function restartTetris(){
    tetrisStopLoop();
    tetrisGrid = Array.from({length:TETRIS_ROWS}, ()=>new Array(TETRIS_COLS).fill(-1));
    tetrisScore = 0; tetrisLevel = 1; tetrisLines = 0; tetrisCombo = 0; tetrisBackToBack = false;
    tetrisGameOver = false; tetrisActive = true; tetrisBag = [];
    tetrisHoldType = null; tetrisHoldUsed = false;
    tetrisStats = { tspins:0, pcs:0, startLines:0 };
    tetrisNextType = tetrisRandomType();
    initTetrisBoard();
    scoreValEl.textContent = '0';
    bestValEl.textContent = tetrisBest;
    tetrisPlayerScoreEl.textContent = '0';
    renderTetrisHold();
    tetrisSpawnPiece();
    startTetrisClock();
    // ★VS AIモードのときだけAIを起動する
    if(tetrisVsMode){
      startAi();
    } else {
      stopAi();
    }
  }

// ===================== 🤖 AI対戦ロジック =====================

  function initAiTetrisBoard(){
    const aiBoardEl = document.getElementById('tetrisAiBoard');
    aiBoardEl.innerHTML = '';
    aiCellEls = [];
    for(let i=0;i<TETRIS_ROWS*TETRIS_COLS;i++){
      const cell = document.createElement('div');
      cell.className = 'tetris-cell';
      aiBoardEl.appendChild(cell);
      aiCellEls.push(cell);
    }
  }

  function aiCollides(matrix, row, col, grid){
    const g = grid || aiGrid;
    for(let r=0;r<matrix.length;r++){
      for(let c=0;c<matrix[r].length;c++){
        if(!matrix[r][c]) continue;
        const gr = row+r, gc = col+c;
        if(gc<0 || gc>=TETRIS_COLS || gr>=TETRIS_ROWS) return true;
        if(gr>=0 && g[gr][gc] !== -1) return true;
      }
    }
    return false;
  }

  function rotateMatrixCW_ai(m){ return rotateMatrixCW(m); }

  function getRotations(matrix){
    // 重複する回転を除外して、ユニークな回転行列だけ返す
    const rotations = [];
    let current = matrix.map(r => r.slice());
    for(let i=0;i<4;i++){
      const key = JSON.stringify(current);
      if(!rotations.some(r => JSON.stringify(r) === key)){
        rotations.push(current);
      }
      current = rotateMatrixCW_ai(current);
    }
    return rotations;
  }

  function renderAiBoard(){
    for(let r=0;r<TETRIS_ROWS;r++){
      for(let c=0;c<TETRIS_COLS;c++){
        const idx = r*TETRIS_COLS+c;
        const cell = aiCellEls[idx];
        const val = aiGrid[r][c];
        cell.className = 'tetris-cell';
        cell.style.background = (val!==-1) ? COLORS[val].bg : '';
        if(val!==-1) cell.classList.add('filled');
      }
    }
    // 現在落下中のピースも描画
    if(aiPiece){
      for(let r=0;r<aiPiece.matrix.length;r++){
        for(let c=0;c<aiPiece.matrix[r].length;c++){
          if(!aiPiece.matrix[r][c]) continue;
          const gr = aiPiece.row+r, gc = aiPiece.col+c;
          if(gr<0 || gr>=TETRIS_ROWS || gc<0 || gc>=TETRIS_COLS) continue;
          const cell = aiCellEls[gr*TETRIS_COLS+gc];
          cell.classList.add('filled');
          cell.style.background = COLORS[aiPiece.color].bg;
        }
      }
    }
  }

  function aiSpawnPiece(forceType){
    const type = forceType || aiNextType || tetrisRandomType();
    if(!forceType) aiNextType = tetrisRandomType();
    const def = TETROMINOES[type];
    const matrix = def.matrix.map(row=>row.slice());
    const col = Math.floor((TETRIS_COLS - matrix.length)/2);
    const row = -1;
    aiPiece = { type, matrix, color: def.color, row, col, rot: 0 };
    if(aiCollides(matrix, row, col)){
      aiTriggerGameOver();
      return false;
    }
    renderAiBoard();
    return true;
  }

  // 盤面評価関数: 高いほど良い配置
  function evaluateAiBoard(grid, matrix, row, col, color){
    // 仮の盤面を作る
    const temp = grid.map(r => r.slice());
    for(let r=0;r<matrix.length;r++){
      for(let c=0;c<matrix[r].length;c++){
        if(!matrix[r][c]) continue;
        const gr = row+r, gc = col+c;
        if(gr>=0 && gr<TETRIS_ROWS && gc>=0 && gc<TETRIS_COLS){
          temp[gr][gc] = color;
        }
      }
    }
    // 揃った行を消して数える
    let linesCleared = 0;
    for(let r=TETRIS_ROWS-1;r>=0;r--){
      if(temp[r].every(v => v !== -1)){
        temp.splice(r, 1);
        temp.unshift(new Array(TETRIS_COLS).fill(-1));
        linesCleared++;
        r++;
      }
    }
    // 各列の高さ・穴・凸凹を計算
    let aggregateHeight = 0, holes = 0, bumpiness = 0, maxHeight = 0;
    const heights = [];
    for(let c=0;c<TETRIS_COLS;c++){
      let h = 0, foundBlock = false, holeCount = 0;
      for(let r=0;r<TETRIS_ROWS;r++){
        if(temp[r][c] !== -1){
          if(!foundBlock){ h = TETRIS_ROWS - r; foundBlock = true; }
        } else if(foundBlock){ holeCount++; }
      }
      heights.push(h);
      aggregateHeight += h;
      holes += holeCount;
      maxHeight = Math.max(maxHeight, h);
    }
    for(let c=0;c<TETRIS_COLS-1;c++){
      bumpiness += Math.abs(heights[c] - heights[c+1]);
    }
    // 重み付け評価（よく使われるTetris AIの定番パラメータ）
    return -0.51 * aggregateHeight
         - 0.76 * holes
         - 0.18 * bumpiness
         + 0.76 * linesCleared
         - 0.08 * maxHeight;
  }

  // AIの最善手を計算
  // 現在の難易度設定を取得
  function getAiDiff(){
    return AI_DIFFICULTIES[aiDifficulty] || AI_DIFFICULTIES.normal;
  }

  // 全候補手を列挙（回転×列）
  function getAllAiCandidates(){
    const rotations = getRotations(aiPiece.matrix);
    const candidates = [];
    for(const matrix of rotations){
      for(let col = -matrix.length; col < TETRIS_COLS; col++){
        let row = -1;
        while(!aiCollides(matrix, row + 1, col)) row++;
        if(row < 0) continue;
        candidates.push({ matrix, row, col });
      }
    }
    return candidates;
  }

  // 仮盤面を作って、ライン消去後のグリッドを返す
  function simulatePlacement(grid, matrix, row, col, color){
    const temp = grid.map(r => r.slice());
    for(let r=0;r<matrix.length;r++){
      for(let c=0;c<matrix[r].length;c++){
        if(!matrix[r][c]) continue;
        const gr = row+r, gc = col+c;
        if(gr>=0 && gr<TETRIS_ROWS && gc>=0 && gc<TETRIS_COLS){
          temp[gr][gc] = color;
        }
      }
    }
    // 揃った行を消す
    for(let r=TETRIS_ROWS-1;r>=0;r--){
      if(temp[r].every(v => v !== -1)){
        temp.splice(r, 1);
        temp.unshift(new Array(TETRIS_COLS).fill(-1));
        r++;
      }
    }
    return temp;
  }

  // 盤面そのものを評価（仮置き後の状態を渡す）
  function evaluateGridOnly(grid){
    let aggregateHeight = 0, holes = 0, bumpiness = 0, maxHeight = 0;
    const heights = [];
    for(let c=0;c<TETRIS_COLS;c++){
      let h = 0, foundBlock = false, holeCount = 0;
      for(let r=0;r<TETRIS_ROWS;r++){
        if(grid[r][c] !== -1){
          if(!foundBlock){ h = TETRIS_ROWS - r; foundBlock = true; }
        } else if(foundBlock){ holeCount++; }
      }
      heights.push(h);
      aggregateHeight += h;
      holes += holeCount;
      maxHeight = Math.max(maxHeight, h);
    }
    for(let c=0;c<TETRIS_COLS-1;c++){
      bumpiness += Math.abs(heights[c] - heights[c+1]);
    }
    return -0.51 * aggregateHeight - 0.76 * holes - 0.18 * bumpiness - 0.08 * maxHeight;
  }

  // 難易度別の最善手を計算
  function findBestAiMove(){
    if(!aiPiece) return null;
    const diff = getAiDiff();
    const candidates = getAllAiCandidates();
    if(candidates.length === 0) return null;

    // ★難易度「史上最強」だけ1手先読みする
    if(diff.lookahead){
      const nextType = aiNextType || 'T';
      const nextDef = TETROMINOES[nextType];
      const nextMatrix = nextDef.matrix.map(r => r.slice());
      const nextColor = nextDef.color;
      const nextRots = getRotations(nextMatrix);

      let bestScore = -Infinity;
      let bestMove = null;
      for(const mv of candidates){
        // 1手目を仮置き
        const midGrid = simulatePlacement(aiGrid, mv.matrix, mv.row, mv.col, aiPiece.color);
        // 2手目のベスト評価を探す
        let bestNext = -Infinity;
        let anyNext = false;
        for(const nm of nextRots){
          for(let ncol = -nm.length; ncol < TETRIS_COLS; ncol++){
            let nrow = -1;
            while(!aiCollides(nm, nrow + 1, ncol, midGrid)) nrow++;
            if(nrow < 0) continue;
            const nGrid = simulatePlacement(midGrid, nm, nrow, ncol, nextColor);
            const s = evaluateGridOnly(nGrid);
            if(s > bestNext){ bestNext = s; anyNext = true; }
          }
        }
        if(!anyNext) bestNext = -9999; // 次のピースが置けない=詰み
        if(bestNext > bestScore){
          bestScore = bestNext;
          bestMove = mv;
        }
      }
      return bestMove || candidates[0];
    }

    // それ以外: 現在の評価関数でスコアを計算し、ノイズとランダム性を加味
    const scored = candidates.map(c => {
      const base = evaluateAiBoard(aiGrid, c.matrix, c.row, c.col, aiPiece.color);
      const score = base * diff.weightScale + (Math.random() - 0.5) * diff.noise;
      return { ...c, score };
    });

    scored.sort((a,b)=>b.score - a.score);
    // 人間は「めちゃくちゃな場所」には置かず、惜しい2〜4番手の手を選ぶことがある
    if(scored.length > 1 && Math.random() < diff.randomChance){
      const k = Math.min(4, scored.length);
      return scored[1 + Math.floor(Math.random() * (k - 1))];
    }
    return scored[0];
  }

  function aiLockPiece(){
    if(!aiPiece) return;
    const { matrix, row, col, color } = aiPiece;
    for(let r=0;r<matrix.length;r++){
      for(let c=0;c<matrix[r].length;c++){
        if(!matrix[r][c]) continue;
        const gr = row+r, gc = col+c;
        if(gr < 0 || gr >= TETRIS_ROWS || gc < 0 || gc >= TETRIS_COLS) continue;
        aiGrid[gr][gc] = color;
      }
    }
    // 揃った行を消す
    const cleared = [];
    for(let r=0;r<TETRIS_ROWS;r++){
      if(aiGrid[r].every(v => v !== -1)) cleared.push(r);
    }
    // ★スコア計算をプレイヤー(tetrisLockPiece)と完全に同じルールに統一
    // (以前はコンボ倍率・バックトゥバックボーナスがAI側に一切無く、単純に基本点×レベルのみだった)
    if(cleared.length > 0){
      aiCombo++;
      const isTetris4 = cleared.length === 4;
      let gained = TETRIS_LINE_POINTS[cleared.length] * aiLevel;
      const comboBonus = aiCombo > 1 ? Math.round(50 * aiCombo * aiLevel) : 0;
      const btbMult = (isTetris4 && aiBackToBack) ? 1.5 : 1;
      const aiB2bTetris = isTetris4 && aiBackToBack;
      aiBackToBack = isTetris4;
      gained = Math.round(gained * btbMult) + comboBonus;

      cleared.slice().sort((a,b)=>a-b).forEach(r=>{
        aiGrid.splice(r, 1);
        aiGrid.unshift(new Array(TETRIS_COLS).fill(-1));
      });
      // パーフェクトクリア(プレイヤーと同じ得点)
      if(aiGrid.every(rowArr => rowArr.every(v => v === -1))){
        gained += perfectClearBonus(cleared.length, aiB2bTetris, aiLevel);
      }
      aiLines += cleared.length;
      aiLevel = Math.floor(aiLines/10)+1;
      aiScore += gained;
    } else {
      aiCombo = 0;
    }
    aiPiece = null;
    tetrisAiScoreEl.textContent = aiScore;
  }

  // ===================== 🤖 AIの手を1手ずつ実行する =====================
  // 以前は「最善手の位置へ瞬間移動→即ロック」というテレポートのような動きで、
  // しかも思考中はピースが自然落下せず(重力なし)、プレイヤーには無い猶予時間があった。
  // ここでは、プレイヤーと全く同じ重力タイマー(aiGravityTick)を常時並行して走らせ、
  // 難易度ごとの思考速度(aiTick)は「回転・左右移動・決めたら即ハードドロップ」という
  // 純粋な操作判断だけを担当するようにして、盤面の落下挙動をプレイヤーと揃えている。
  let aiPlan = null;

  function matrixKey(m){
    return m.map(row => row.join('')).join('|');
  }

  // ピースを1つ確定させ、採点・次のピース生成・重力タイマーの再スタートまで行う共通処理
  function aiFinishPiece(){
    aiLockPiece();
    aiPlan = null;
    aiHoldUsed = false;
    renderAiBoard();
    if(aiGameOver) return;
    const spawned = aiSpawnPiece();
    renderAiBoard();
    if(!spawned || aiGameOver) return; // ゲームオーバーになった場合は重力タイマーを再スタートしない
    startAiGravity(); // ★新しいピース&レベルに合わせて、プレイヤーと同じ計算式で重力を再スタート
    scheduleAiTick(aiThinkDelay()); // 新しいピースを見てから動き出すまで「考える時間」を置く
  }

  // ===== 重力タイマー: プレイヤーのtetrisTickと全く同じ間隔・ロジックで自然落下させる =====
  function aiGravityTick(){
    if(!aiActive || aiGameOver || !aiPiece) return;
    if(!aiCollides(aiPiece.matrix, aiPiece.row + 1, aiPiece.col)){
      aiPiece.row++;
      renderAiBoard();
    } else {
      aiFinishPiece();
    }
  }
  function startAiGravity(){
    if(aiGravityTimer) clearInterval(aiGravityTimer);
    aiGravityTimer = setInterval(aiGravityTick, dropIntervalForLevel(aiLevel));
  }
  function stopAiGravity(){
    if(aiGravityTimer){ clearInterval(aiGravityTimer); aiGravityTimer = null; }
  }

  // ===== 🤖 AIの操作(人間らしさ重視) =====
  //  ・新しいピースが出てから、少し「考える時間」を置く
  //  ・操作の間隔は一定ではなく、ゆらぎ + たまに迷って止まる
  //  ・回転と移動をバラバラに混ぜる(回転→全部移動、ではない)
  //  ・たまに1マスずれて落としたり、行き過ぎて戻ったりする
  //  ・ホールドを使う / 最後はハードドロップかソフトドロップで落とす
  //  ・積み上がって追い詰められると、焦って操作が速くなる
  let aiHoldType = null, aiHoldUsed = false;
  const aiRand = (a,b)=> a + Math.random()*(b-a);
  function aiStackHeight(){
    for(let r=0;r<TETRIS_ROWS;r++){ if(aiGrid[r].some(v=>v!==-1)) return TETRIS_ROWS - r; }
    return 0;
  }
  function scheduleAiTick(delay){
    if(aiTimer) clearTimeout(aiTimer);
    aiTimer = setTimeout(aiTick, Math.max(25, delay));
  }
  function aiThinkDelay(){
    const d = getAiDiff();
    let t = d.think * aiRand(0.7, 1.4);
    if(aiStackHeight() >= 14) t *= 0.6;           // 追い詰められたら即決する
    return t;
  }
  function aiActionDelay(){
    const d = getAiDiff();
    let t = Math.max(40, d.speed) * aiRand(0.65, 1.45);
    if(Math.random() < 0.07) t += aiRand(120, 380);   // たまに一瞬止まる
    if(aiStackHeight() >= 14) t *= 0.75;
    return t;
  }

  function aiRotateSRS(){
    const p = aiPiece;
    if(p.type === 'O') return false;
    const rm = rotateMatrixCW(p.matrix);
    const table = (p.type === 'I') ? SRS_KICKS_I : SRS_KICKS_JLSTZ;
    for(const [dx, dy] of table[p.rot]){
      if(!aiCollides(rm, p.row - dy, p.col + dx)){
        p.matrix = rm; p.row -= dy; p.col += dx; p.rot = (p.rot + 1) % 4;
        return true;
      }
    }
    return false;
  }

  // 指定した種類のピースを置ける全候補(ホールド判断用)
  function aiBestEvalFor(type){
    const def = TETROMINOES[type];
    let best = -Infinity;
    for(const matrix of getRotations(def.matrix.map(r=>r.slice()))){
      for(let col = -matrix.length; col < TETRIS_COLS; col++){
        let row = -1;
        while(!aiCollides(matrix, row + 1, col)) row++;
        if(row < 0) continue;
        const v = evaluateAiBoard(aiGrid, matrix, row, col, def.color);
        if(v > best) best = v;
      }
    }
    return best;
  }
  function aiDoHold(){
    const cur = aiPiece.type;
    aiHoldUsed = true;
    aiPlan = null;
    let ok;
    if(aiHoldType === null){ aiHoldType = cur; ok = aiSpawnPiece(); }
    else { const t = aiHoldType; aiHoldType = cur; ok = aiSpawnPiece(t); }
    renderAiBoard();
    if(ok) startAiGravity();
    return ok;
  }

  function aiTick(){
    if(!aiActive || aiGameOver || !aiPiece) return;
    const diff = getAiDiff();

    // ① 計画: ピースごとに「どこに・どの向きで置くか」を最初に1回だけ決める
    if(!aiPlan){
      // ホールド: 手札の方が明らかに良く置けそうなら入れ替える
      if(!aiHoldUsed && Math.random() < diff.holdUse){
        const alt = aiHoldType || aiNextType;
        if(alt && aiBestEvalFor(alt) > aiBestEvalFor(aiPiece.type) + 0.6){
          if(aiDoHold()) scheduleAiTick(aiActionDelay());
          return;
        }
      }
      const move = findBestAiMove();
      if(!move){ aiTriggerGameOver(); return; }
      aiPlan = {
        targetMatrixKey: matrixKey(move.matrix),
        targetCol: move.col,
        checked: false,
        soft: Math.random() > diff.hardDrop
      };
      scheduleAiTick(aiActionDelay());
      return;
    }

    // ② 回転と左右移動を混ぜながら、目標に近づく
    const needRot = matrixKey(aiPiece.matrix) !== aiPlan.targetMatrixKey;
    const dir = Math.sign(aiPlan.targetCol - aiPiece.col);
    const needMove = dir !== 0 && !aiCollides(aiPiece.matrix, aiPiece.row, aiPiece.col + dir);
    if(needRot || needMove){
      if(needRot && (!needMove || Math.random() < 0.6)){
        if(!aiRotateSRS()) aiPlan.targetMatrixKey = matrixKey(aiPiece.matrix);  // 回せなければ今の向きで妥協
      } else {
        aiPiece.col += dir;
      }
      renderAiBoard();
      scheduleAiTick(aiActionDelay());
      return;
    }

    // ③ 目標に着いたら、たまに「ミス」や「迷い」を入れる(1ピースにつき1回だけ判定)
    if(!aiPlan.checked){
      aiPlan.checked = true;
      const r = Math.random(), d = Math.random() < 0.5 ? -1 : 1;
      const free = !aiCollides(aiPiece.matrix, aiPiece.row, aiPiece.col + d);
      if(r < diff.slip * 0.4){
        if(free){ aiPiece.col += d; renderAiBoard(); }          // 本当にずれたまま落とす
      } else if(r < diff.slip){
        if(free){                                               // 行き過ぎて、気づいて戻る
          aiPiece.col += d; renderAiBoard();
          scheduleAiTick(aiActionDelay() + aiRand(150, 350));
          return;
        }
      } else if(Math.random() < 0.1){
        scheduleAiTick(aiRand(150, 400));                       // 少し迷う
        return;
      }
    }

    // ④ 落とす: ハードドロップか、ソフトドロップでスッと下ろす
    if(aiPlan.soft){
      if(!aiCollides(aiPiece.matrix, aiPiece.row + 1, aiPiece.col)){
        aiPiece.row++;
        aiScore += 1;
        renderAiBoard();
        scheduleAiTick(aiActionDelay() * 0.3);
        return;
      }
      aiFinishPiece();
      return;
    }
    let dist = 0;
    while(!aiCollides(aiPiece.matrix, aiPiece.row + 1, aiPiece.col)){
      aiPiece.row++;
      dist++;
    }
    if(dist > 0) aiScore += dist * 2;
    aiFinishPiece();
  }

  function startAi(){
    aiGrid = Array.from({length:TETRIS_ROWS}, ()=>new Array(TETRIS_COLS).fill(-1));
    aiScore = 0; aiLevel = 1; aiLines = 0; aiCombo = 0; aiBackToBack = false;
    aiGameOver = false; aiActive = true; aiBag = [];
    aiHoldType = null; aiHoldUsed = false; aiPlan = null;
    aiPiece = null; aiNextType = tetrisRandomType();
    initAiTetrisBoard();
    tetrisAiScoreEl.textContent = '0';
    aiSpawnPiece();
    // ★難易度ごとの速度は「操作の速さ」だけを表し、落下自体は重力タイマーが別途プレイヤーと同じ規則で担当する
    scheduleAiTick(aiThinkDelay());
    startAiGravity();
  }

  function stopAi(){
    if(aiTimer){ clearTimeout(aiTimer); clearInterval(aiTimer); aiTimer = null; }
    stopAiGravity();
    aiActive = false;
  }

  function aiTriggerGameOver(){
    if(aiGameOver) return;
    aiGameOver = true;
    aiActive = false;
    stopAi();
    // AIが先に詰まったら、プレイヤーの勝ち
    endTetrisVsMatch('ai');
  }

  // テトリスモード中は、CSSのtouch-action等に加えてピンチズーム自体をJSでも完全にブロックする
  function preventMultiTouchZoom(e){
    if(e.touches && e.touches.length > 1) e.preventDefault();
  }

function enterTetrisMode(){
    currentMode = 'tetris';
    // ソロ/VS/スプリント/ウルトラをフラグに反映(フレンド対決は常にウルトラ)
    tetrisRunMode = tetrisDuelPending ? 'ultra' : tetrisSubMode;
    tetrisDuelPending = false;
    tetrisVsMode = (tetrisRunMode === 'vs');
    // 難易度が不正ならnormalに戻す
    if(!AI_DIFFICULTIES[aiDifficulty]) aiDifficulty = 'normal';

    // レイアウト切り替え
    if(tetrisVsMode){
      tetrisWrapEl.classList.remove('solo-mode');
      tetrisWrapEl.classList.add('vs-mode');
    } else {
      tetrisWrapEl.classList.remove('vs-mode');
      tetrisWrapEl.classList.add('solo-mode');
    }

    updateModeBadge();
    boardWrapEl.style.display = 'none';
    trayEl.style.display = 'none';
    tetrisWrapEl.style.display = 'flex';
    saveSettings();
    startPlayTimeTracking();
    restartTetris(); // 内部で tetrisVsMode に応じてAI起動/停止
    document.addEventListener('touchmove', preventMultiTouchZoom, { passive:false });
    document.addEventListener('touchstart', preventMultiTouchZoom, { passive:false });
  }

  function exitTetrisMode(){
    tetrisStopLoop();
    stopTetrisClock();
    timeAttackCardEl.style.display = 'none';
    tetrisActive = false;
    stopAi();
    tetrisWrapEl.style.display = 'none';
    boardWrapEl.style.display = '';
    trayEl.style.display = '';
    document.removeEventListener('touchmove', preventMultiTouchZoom, { passive:false });
    document.removeEventListener('touchstart', preventMultiTouchZoom, { passive:false });
  }

  // 数字が「1→2→3→…」と駆け上がるように見えるカウントアップアニメーション（約0.8秒以内）
  function animateNumberTo(el, toValue, duration){
    duration = duration || 800;
    const fromValue = parseInt(el.textContent, 10) || 0;
    if(fromValue === toValue){ el.textContent = toValue; return; }
    const start = performance.now();
    function step(now){
      const p = Math.min(1, (now-start)/duration);
      const eased = 1 - Math.pow(1-p, 3);
      const cur = Math.round(fromValue + (toValue-fromValue)*eased);
      el.textContent = cur;
      if(p<1) requestAnimationFrame(step);
      else el.textContent = toValue;
    }
    requestAnimationFrame(step);
  }

  // ===================== テトリス操作(キーボード) =====================
  document.addEventListener('keydown', (e)=>{
    if(currentMode!=='tetris' || !tetrisActive || tetrisGameOver) return;
    const key = e.key.toLowerCase();
    const isSpace = key===' ' || key==='spacebar' || e.code==='Space';
    if(['arrowleft','arrowright','arrowup','arrowdown','a','d','w','s','q'].includes(key) || isSpace) e.preventDefault();
    // 十字キーに加えて、片手操作しやすいようWASDにも対応。ホールドはQ。
    if(key==='arrowleft' || key==='a') tetrisMove(-1);
    else if(key==='arrowright' || key==='d') tetrisMove(1);
    else if(key==='arrowup' || key==='w') tetrisRotate();
    else if(key==='arrowdown' || key==='s') tetrisSoftDrop();
    else if(isSpace) tetrisHardDrop();
    else if(key==='q') tetrisHoldSwap();
  });

  // ===================== テトリス操作(タッチ/タップ・iPad対応) =====================
  function bindTetrisHoldButton(el, fn, repeatMs, initialDelay){
    repeatMs = repeatMs || 100; initialDelay = initialDelay || 220;
    let holdTimer = null, startTimer = null;
    const start = (e)=>{
      e.preventDefault();
      fn();
      startTimer = setTimeout(()=>{ holdTimer = setInterval(fn, repeatMs); }, initialDelay);
    };
    const stop = ()=>{
      clearTimeout(startTimer); clearInterval(holdTimer);
      startTimer = null; holdTimer = null;
    };
    el.addEventListener('pointerdown', start);
    el.addEventListener('pointerup', stop);
    el.addEventListener('pointerleave', stop);
    el.addEventListener('pointercancel', stop);
  }
  bindTetrisHoldButton(tBtnLeftEl, ()=>tetrisMove(-1));
  bindTetrisHoldButton(tBtnRightEl, ()=>tetrisMove(1));
  bindTetrisHoldButton(tBtnSoftEl, ()=>tetrisSoftDrop());
  tBtnRotateEl.addEventListener('pointerdown', (e)=>{ e.preventDefault(); tetrisRotate(); });
  tBtnHardEl.addEventListener('pointerdown', (e)=>{ e.preventDefault(); tetrisHardDrop(); });
  tBtnHoldEl.addEventListener('pointerdown', (e)=>{ e.preventDefault(); tetrisHoldSwap(); });
  tetrisBoardEl.addEventListener('pointerdown', (e)=>{ e.preventDefault(); tetrisRotate(); });
  // ズームや長押しでの範囲選択・コピーメニューが出ないように抑制
  tetrisWrapEl.addEventListener('contextmenu', (e)=>e.preventDefault());
  tetrisWrapEl.addEventListener('selectstart', (e)=>e.preventDefault());

  // ===================== 操作説明パネル =====================
  tetrisHelpPanelEl.innerHTML = `
    <b>🎮 操作説明</b>
    ◀▶：左右移動<br>
    ⟳：回転<br>
    ▼：ソフトドロップ<br>
    ⤓：ハードドロップ<br>
    ⇄ HOLD：ピースを保持/交換<br>
    <b style="margin-top:8px;">⌨️ キーボード</b>
    ← → / A D：移動<br>
    ↑ / W：回転<br>
    ↓ / S：ソフトドロップ<br>
    スペース：ハードドロップ<br>
    Q：ホールド<br>
    <b style="margin-top:8px;">✨ ボーナス</b>
    Tスピン：Tを回転でスキマにはめて消すと高得点<br>
    パーフェクトクリア：盤面を全部消すと大ボーナス
  `;
  tetrisHelpBtnEl.addEventListener('pointerdown', (e)=>{
    e.preventDefault();
    e.stopPropagation();
    tetrisHelpPanelEl.classList.toggle('show');
  });

  // ===================== サーバーお知らせ(管理者コマンド /announce の配信を表示) =====================
  const STORAGE_LAST_ANNOUNCEMENT = 'candyblast-last-announcement-v1';
  let lastSeenAnnouncementId = 0;

  async function loadLastSeenAnnouncement(){
    try{
      const res = await appStorage.get(STORAGE_LAST_ANNOUNCEMENT, false);
      if(res && res.value) lastSeenAnnouncementId = parseInt(res.value,10) || 0;
    }catch(err){}
  }
  async function saveLastSeenAnnouncement(id){
    try{ await appStorage.set(STORAGE_LAST_ANNOUNCEMENT, String(id), false); }catch(err){}
  }

  function showAnnouncementToast(message){
    const el = document.createElement('div');
    el.className = 'announce-toast';
    el.innerHTML = `<span>📢</span><span class="announce-text">${escapeHtml(message)}</span><button class="announce-close">✕</button>`;
    document.body.appendChild(el);
    el.querySelector('.announce-close').addEventListener('click', ()=>el.remove());
    requestAnimationFrame(()=> el.classList.add('show'));
    setTimeout(()=>{ el.classList.remove('show'); setTimeout(()=>el.remove(), 450); }, 8000);
  }

  async function checkAnnouncements(){
    try{
      const r = await fetch(`${API_BASE_URL}/api/announcements/latest`);
      const data = await r.json();
      if(data.announcement && data.announcement.id > lastSeenAnnouncementId){
        lastSeenAnnouncementId = data.announcement.id;
        saveLastSeenAnnouncement(lastSeenAnnouncementId);
        showAnnouncementToast(data.announcement.message);
      }
    }catch(err){}
  }

  // ===================== アップデート検知(新しいバージョンが公開されたらリアルタイムで案内) =====================
  const APP_VERSION = document.querySelector('meta[name="app-version"]')?.content || '0';
  let updateToastShown = false;
  async function checkForUpdate(){
    if(updateToastShown) return;
    try{
      const r = await fetch(location.pathname + '?_check=' + Date.now(), { cache:'no-store' });
      const text = await r.text();
      const match = text.match(/name="app-version" content="([^"]+)"/);
      if(match && match[1] && match[1] !== APP_VERSION){
        updateToastShown = true;
        const el = document.createElement('div');
        el.className = 'update-toast';
        el.innerHTML = `<span>✨ 新しいバージョンがあります</span><button id="updateReloadBtn">今すぐ更新</button>`;
        document.body.appendChild(el);
        requestAnimationFrame(()=> el.classList.add('show'));
        document.getElementById('updateReloadBtn').addEventListener('click', ()=>location.reload());
      }
    }catch(err){}
  }

  // ===================== メインメニュー画面 =====================
  const titleScreenEl = document.getElementById('titleScreen');

  function showTitleScreen(){
    if(currentMode==='tetris') exitTetrisMode();
    if(currentMode==='timeattack') stopTimeAttackTimer();
    overlayEl.classList.remove('show');
    modalOverlay.classList.remove('show');
    titleScreenEl.classList.remove('hidden');
  }
  function hideTitleScreen(){
    titleScreenEl.classList.add('hidden');
  }

  document.getElementById('titleStartBtn').addEventListener('click', ()=>{
    hideTitleScreen();
    pendingMode = (currentMode==='tetris' || currentMode==='timeattack') ? 'baked' : currentMode;
    pendingSize = SIZE;
    renderSettingsModal('mode');
    modalOverlay.classList.add('show');
  });
  document.getElementById('titleTimeAttackBtn').addEventListener('click', ()=>{
    hideTitleScreen();
    startTimeAttackMode();
  });
  document.getElementById('titleWeeklyBtn').addEventListener('click', ()=>{
    hideTitleScreen();
    openWeeklyChallengeModal();
  });
  document.getElementById('titleGachaBtn').addEventListener('click', ()=>{
    hideTitleScreen();
    openGachaModal();
  });
  document.getElementById('titleBattlePassBtn').addEventListener('click', ()=>{
    hideTitleScreen();
    openBattlePassModal();
  });
  document.getElementById('titleRecordsBtn').addEventListener('click', ()=>{
    hideTitleScreen();
    renderRecordsModal();
    modalOverlay.classList.add('show');
  });
  document.getElementById('titleSettingsBtn').addEventListener('click', ()=>{
    hideTitleScreen();
    renderAppSettingsModal();
    modalOverlay.classList.add('show');
  });

document.getElementById('titleOtherGamesBtn').addEventListener('click', ()=>{
    hideTitleScreen();
    renderOtherGamesModal();
    modalOverlay.classList.add('show');
  });

// ===================== 🎵 音楽一覧モーダル =====================
  let musicSearchQuery = '';
  let musicCategoryFilter = 'すべて';

  // フィルタ条件に合う曲のリストを返す
  function getFilteredMusicList(){
    let list = MUSIC_LIBRARY.slice();
    if(musicCategoryFilter !== 'すべて'){
      list = list.filter(t => t.category === musicCategoryFilter);
    }
    if(musicSearchQuery.trim()){
      const q = musicSearchQuery.trim().toLowerCase();
      list = list.filter(t =>
        t.title.toLowerCase().includes(q) ||
        t.artist.toLowerCase().includes(q) ||
        t.category.toLowerCase().includes(q)
      );
    }
    return list;
  }

  // リスト部分だけを再描画する(検索ボックスは触らないのでIMEが壊れない)
  function renderMusicList(){
    const listEl = document.getElementById('musicListArea');
    const countEl = document.getElementById('musicCountLabel');
    if(!listEl) return;
    const list = getFilteredMusicList();
    if(countEl) countEl.textContent = `${list.length} 件`;

    if(list.length === 0){
      listEl.innerHTML = `<div class="empty-hint">該当する曲が見つかりませんでした。</div>`;
      return;
    }
    listEl.innerHTML = list.map(track => {
      const isPlaying = track.file === bgmCurrentFile;
      return `
        <div class="quest-item music-item" data-musicfile="${escapeHtml(track.file)}"
             style="cursor:pointer; ${isPlaying?'border:2px solid var(--gold);':''}">
          <div class="qtitle">${track.emoji||'🎵'} ${escapeHtml(track.title)} ${isPlaying?'<span class="coin-tag">再生中</span>':''}</div>
          <div class="sub" style="margin-top:4px;">${escapeHtml(track.artist)} ・ ${escapeHtml(track.category)}</div>
        </div>`;
    }).join('');
    // 曲タップのイベントを貼り直す
    listEl.querySelectorAll('.music-item').forEach(el=>{
      el.addEventListener('click', ()=>{
        const file = el.dataset.musicfile;
        if(!file) return;
        playBgmTrack(file);
        bgmEnabled = true;
        renderMusicList();
      });
    });
  }

  function renderMusicModal(){
    modalContent.dataset.mode = 'music';

    const currentTrack = MUSIC_LIBRARY.find(t => t.file === bgmCurrentFile);
    modalContent.innerHTML = `
      <h2 style="color:var(--gold);">🎵 音楽</h2>
      <div class="sub" style="margin-bottom:10px;">好きな曲を選んで再生できます。今: <b style="color:var(--mint);">${currentTrack ? escapeHtml(currentTrack.title) : '停止中'}</b></div>

      <input type="text" id="musicSearchInput" placeholder="🔍 曲名・アーティストで検索..." value="${escapeHtml(musicSearchQuery)}"
        style="width:100%; padding:11px 12px; border-radius:12px; border:1px solid rgba(255,255,255,0.12); background:var(--bg-deep2); color:var(--text); font-size:14px; font-family:'Nunito',sans-serif; margin-bottom:8px; box-sizing:border-box;">

      <div class="tab-row" style="margin-bottom:10px; flex-wrap:wrap;">
        ${MUSIC_CATEGORIES.map(cat => `
          <button class="tab-btn music-cat-btn ${musicCategoryFilter===cat?'active':''}" data-mcat="${cat}">${cat}</button>
        `).join('')}
      </div>

      <div class="sub" style="margin-bottom:6px;"><span id="musicCountLabel"></span></div>
      <div id="musicListArea"></div>

      <button class="ghost-btn" id="musicStopBtn" style="margin-top:10px;">⏹ BGMを停止する</button>
    `;

    // ★検索ボックスは「input」イベントで「リストだけ」を再描画する
    // → 検索ボックス自体は作り直されないので、IMEが途中でキャンセルされない
    const searchEl = document.getElementById('musicSearchInput');
    searchEl.addEventListener('input', (e)=>{
      musicSearchQuery = e.target.value;
      renderMusicList();
    });

    modalContent.querySelectorAll('.music-cat-btn').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        musicCategoryFilter = btn.dataset.mcat;
        // カテゴリ変更時はタブの見た目も変えたいのでモーダル全体を再描画(検索キーワードは保持)
        renderMusicModal();
      });
    });

    document.getElementById('musicStopBtn').addEventListener('click', ()=>{
      stopBgm();
      bgmCurrentFile = null;
      bgmEnabled = false;
      saveBgmSettings();
      updateMusicButton();
      renderMusicModal();
    });

    // 初回リスト描画
    renderMusicList();
  }

// ===================== 🎮 別のゲーム =====================

const OTHER_GAMES = [
    // 修正中のゲームは url を持たせない(= タップしても開かない)。直ったら url を戻して maintenance を消す
    { emoji:'⚫', name:'オセロ', desc:'白と黒の石をひっくり返して陣取り！', maintenance:true },
    { emoji:'⚪', name:'五目並べ', desc:'縦・横・斜めに5つ並べたら勝ち！', maintenance:true },
    { emoji:'❌', name:'まるばつゲーム', desc:'3×3のマスで○×を並べる定番ゲーム', maintenance:true },
    { emoji:'🐢', name:'ウミガメのスープ', desc:'質問を重ねて、不思議な出来事の真相を推理しよう！', url:'https://chelonia.onrender.com' },
  ];

function renderOtherGamesModal(){
    modalContent.dataset.mode = 'othergames';
    let html = `
      <h2 style="color:var(--gold);">🎮 別のゲーム</h2>
      <div class="sub" style="margin-bottom:10px;">他のゲームも続々追加予定！お楽しみに。</div>
    `;
    if(OTHER_GAMES.length === 0){
      html += `<div class="empty-hint">現在公開中のゲームはありません。</div>`;
    } else {
      OTHER_GAMES.forEach((g, i)=>{
        const ready = !!g.url;
        html += `
          <div class="quest-item other-game-item" data-gameidx="${i}"
               style="cursor:${ready?'pointer':'default'}; ${ready?'':'opacity:0.55;'}">
            <div class="qtitle">${g.emoji} ${g.name}${ready?'':(g.maintenance?' <span class="coin-tag maint-tag">🛠 修正中</span>':' <span class="coin-tag">準備中</span>')}</div>
            <div class="sub" style="margin-top:4px;">${g.maintenance?'現在修正中です。直り次第また遊べるようになります。':g.desc}</div>
          </div>`;
      });
    }
    html += `
      <div class="coming-soon">
        <span class="cs-line"></span>
        <span class="cs-text">Coming Soon…</span>
        <span class="cs-line"></span>
      </div>
    `;
    modalContent.innerHTML = html;

    modalContent.querySelectorAll('.other-game-item').forEach(el=>{
      el.addEventListener('click', ()=>{
        const g = OTHER_GAMES[parseInt(el.dataset.gameidx, 10)];
        if(g && g.url) window.open(g.url, '_blank', 'noopener');
      });
    });
  }

  // ===================== 更新履歴 / バージョン表示 =====================
  const CHANGELOG = [
    { version:'3.1.0', date:'2026-10-18', items:[
      '🏠 ホーム画面をロビー型に刷新(大きなPLAYボタン + 機能タイル + コイン・アカウント表示)',
      '🎮 ゲーム中のヘッダーを細いバーにして盤面を最大化。アイコン類は ☰ メニューにまとめました',
      '📋 ウィンドウを画面下から出るボトムシートに変更',
      '🧱 テトリスの操作ボタンを、両手の親指で押しやすい2ブロック配置に変更',
      '◇ 角丸を小さく、四隅に金の角飾りを付けたシャープなデザインに'
    ]},
    { version:'3.0.0', date:'2026-10-18', items:[
      '🎃 ハロウィン・ナイトフェス開催！ 期間限定ガチャ(1回5000コイン)・ロード・ミッション・交換所・ランキング',
      '👕 ハロウィンスキンを10種追加(ガチャ6種 / ロード2種 / 交換所2種)',
      '🎨 UIを一新(ガラス×金の高級感のあるデザイン、ハロウィン背景)',
      '🏁 テトリスに新モード「スプリント(40ライン)」と「ウルトラ(2分)」',
      '⚔️ フレンド対決でテトリスも遊べるように(ウルトラ2分のスコア勝負)',
      '🤖 テトリスAIをより人間らしい動きに(考える時間・迷い・ミス・ホールド)',
      '🛠 テトリスVS AIで自分の盤面が小さくなる問題を修正 / 先に詰まった方が負けに',
      '🎰 ガチャの排出率を下げ(1スキン1%)、排出率を画面に表示',
      '⚙ 設定に「動きを減らす」「振動」を追加 / 大きな数の表示を拡張',
      '🛠 オセロ・五目並べ・まるばつは修正中のため一時的に非表示'
    ]},
    { version:'2.2.0', date:'2026-10-13', items:[
      '🌀 テトリスに「Tスピン」を追加(ミニTスピン・B2B対応、回転はSRS準拠のウォールキックに)',
      '✨ テトリスに「パーフェクトクリア」を追加',
      '🐛 ライン消去中に▼長押しすると、ブロックが一気に消えるバグを修正',
      '🎰 ガチャの料金を1回2000コインに変更'
    ]},
    { version:'2.1.0', date:'2026-10-08', items:[
      '🎰 ガチャに「10連」を追加(無料チケットがあれば先に消費)',
      '🎁 バトルパスに「まとめて受け取る」ボタンを追加',
      '💤 サーバー・画面がスリープしにくいように改善',
      '🛠 GitHub Pages / Supabase に対応',
      '🐢 「別のゲーム」にウミガメのスープを追加'
    ]},
    { version:'2.0.2', date:'2026-09-07', items:[
      '📮 設定画面に「ご要望・不具合報告」を新設。ご要望と不具合報告を分けて送信でき、不具合報告には画像を添付可能に',
      '🐞 スキンが数秒後に元に戻ってしまうバグを修正',
      '🎨 スキン一覧を価格順に並び替え',
      '📜 更新履歴に「過去の履歴」を見られるページを追加'
    ]},
    { version:'2.0.1', date:'2026-09-07', items:[
      '⏱ タイムアタックモードのランキングを追加',
      '🔥 イベント機能を追加',
      '🔐 ログイン状態がリロードしても保持されるように改善',
      'その他のバグ修正',
      '',
      '📅 今後の予定',
      'リクエストに応えられるよう、要望を送信できるようにする',
      'フレンドとの対戦で、追加報酬が出るようにする',
      '🔐その他のバグ修正'
    ]},
    { version:'2.0.0', date:'2026-09', items:[
      '⏱ タイムアタックモードを追加(制限時間60秒、専用ハイスコア・別ランキング)',
      '🔥 コンボ倍率システムを追加(連続ライン消去でスコア倍率アップ)',
      '🧱 テトリスにHOLD機能・WASD操作・操作説明パネルを追加',
      '🏠 メインメニュー画面を新設。記録・実績、設定ページを追加',
      '🔊 サウンドを一新(より満足感のあるサウンドに)',
      '🐞 テトリスのハードドロップがiPad横画面で見えない不具合を修正'
    ]}
  ];
  function renderChangelogHTML(){
    const latest = CHANGELOG[0];
    return `<h4>📢 更新履歴（最新）</h4>
      <div class="cl-entry"><b>Ver ${latest.version}（${latest.date}）</b>${latest.items.map(i=>`・${i}`).join('<br>')}</div>
      <button id="viewFullHistoryBtn" style="width:100%; margin-top:8px; background:var(--panel-light); border:none; color:var(--mint); font-weight:800; font-size:11.5px; padding:8px 0; border-radius:10px; cursor:pointer;">📜 過去の更新履歴を見る</button>
    `;
  }
  function renderFullHistoryModal(){
    modalContent.dataset.mode = 'history';
    let html = `<h2 style="color:var(--gold);">📜 過去の更新履歴</h2>`;
    CHANGELOG.forEach(v=>{
      html += `<div class="quest-item"><div class="qtitle">Ver ${v.version}（${v.date}）</div>
        <div class="sub" style="margin-top:4px;">${v.items.map(i=>`・${i}`).join('<br>')}</div></div>`;
    });
    modalContent.innerHTML = html;
  }
  const changelogPanelEl = document.getElementById('changelogPanel');
  function openChangelogPanel(){
    changelogPanelEl.innerHTML = renderChangelogHTML();
    const btn = document.getElementById('viewFullHistoryBtn');
    if(btn) btn.addEventListener('click', ()=>{
      changelogPanelEl.classList.remove('show');
      renderFullHistoryModal();
      modalOverlay.classList.add('show');
    });
  }
  document.getElementById('versionBadge').addEventListener('click', ()=>{
    if(changelogPanelEl.classList.contains('show')){ changelogPanelEl.classList.remove('show'); return; }
    openChangelogPanel();
    changelogPanelEl.classList.add('show');
  });
  document.getElementById('titleChangelogBtn').addEventListener('click', ()=>{
    openChangelogPanel();
    changelogPanelEl.classList.add('show');
  });

  // ===================== 🆕 スケジュールイベント(管理者が設定した自動報酬)のカウントダウン表示 =====================
  let eventsData = [];
  const eventCountdownBadgeEl = document.getElementById('eventCountdownBadge');
  const eventCountdownTextEl = document.getElementById('eventCountdownText');

  async function fetchEventsList(){
    try{
      const r = await fetch(`${API_BASE_URL}/api/events/list`);
      const data = await r.json();
      eventsData = data.events || [];
      updateEventCountdownBadge();
    }catch(err){ /* 無視 */ }
  }

  function formatHMS(totalSec){
    const sec = Math.max(0, Math.round(totalSec));
    const h = Math.floor(sec/3600), m = Math.floor((sec%3600)/60), s = sec%60;
    return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  }

  function updateEventCountdownBadge(){
    if(!eventsData.length){ eventCountdownBadgeEl.style.display = 'none'; return; }
    const soonest = eventsData.reduce((a,b)=> a.secondsUntilNext<b.secondsUntilNext ? a : b);
    eventCountdownBadgeEl.style.display = 'block';
    eventCountdownTextEl.textContent = `⏰ ${formatHMS(soonest.secondsUntilNext)}`;
  }

  function tickEventCountdown(){
    if(!eventsData.length) return;
    eventsData.forEach(ev=>{ ev.secondsUntilNext = Math.max(0, ev.secondsUntilNext-1); });
    updateEventCountdownBadge();
    if(modalOverlay.classList.contains('show') && modalContent.dataset.mode==='events') renderEventsModal();
  }

  function eventWhenLabel(ev){
    const t = `${String(ev.hourJst).padStart(2,'0')}:${String(ev.minuteJst||0).padStart(2,'0')}`;
    if(ev.recurrence==='once') return `${ev.eventYear}/${ev.eventMonth}/${ev.eventDay} ${t} に一度だけ`;
    if(ev.recurrence==='weekly') return `毎週${['日','月','火','水','木','金','土'][ev.eventDay]}曜 ${t}`;
    if(ev.recurrence==='monthly') return `毎月${ev.eventDay}日 ${t}`;
    return `毎日 ${t}`;
  }

  function renderEventsModal(){
    modalContent.dataset.mode = 'events';
    let html = `<h2 style="color:var(--gold);">🎉 イベント一覧</h2>
      <div class="sub" style="margin-bottom:10px;">指定した日時(日本時間)になると、対象ランキングの順位者へ自動でコインが配布されます。</div>`;
    if(eventsData.length===0){
      html += `<div class="empty-hint">現在開催中のイベントはありません。</div>`;
    } else {
      eventsData.slice().sort((a,b)=>a.secondsUntilNext-b.secondsUntilNext).forEach(ev=>{
        const modeLabel = RANKING_MODE_LABELS[ev.rankingMode] || ev.rankingMode;
        html += `
          <div class="quest-item">
            <div class="qtitle">${modeLabel}ランキング ${ev.rankPosition}位 → 🪙${formatNumber(ev.rewardCoins)}</div>
            <div class="sub">${eventWhenLabel(ev)}(日本時間)に自動配布</div>
            <div class="sub" style="color:var(--mint); font-weight:800; margin-top:4px;">次回まで: ${formatHMS(ev.secondsUntilNext)}</div>
          </div>`;
      });
    }
    modalContent.innerHTML = html;
  }

  eventCountdownBadgeEl.addEventListener('click', ()=>{
    renderEventsModal();
    modalOverlay.classList.add('show');
  });

  // ===================== 🎃 ハロウィンイベント(期間はサーバーが管理。終了したら自動で消える) =====================
  const EVENT_CACHE_KEY = 'candyblast-event-v1';
  const EVENT_PREF_KEY = 'candyblast-uiprefs-v1';
  let eventInfo = null;        // { phase, startsAt, endsAt, graceEndsAt, skew }
  let hwState = null;          // /api/event/halloween/state の結果
  let hwTab = 'home';
  let uiPrefs = { hwTheme:true, reduceMotion:false, vibrate:true };

  function loadUiPrefs(){
    try{ Object.assign(uiPrefs, JSON.parse(localStorage.getItem(EVENT_PREF_KEY) || '{}')); }catch(e){}
    try{ const raw = localStorage.getItem(EVENT_CACHE_KEY); if(raw) eventInfo = JSON.parse(raw); }catch(e){}
  }
  function saveUiPrefs(){ try{ localStorage.setItem(EVENT_PREF_KEY, JSON.stringify(uiPrefs)); }catch(e){} }

  // 端末の時計がずれていても、サーバーの時刻との差(skew)で補正して判定する
  function eventPhaseNow(){
    if(!eventInfo) return 'ended';
    const now = Date.now() + (eventInfo.skew || 0);
    if(now < Date.parse(eventInfo.startsAt)) return 'upcoming';
    if(now < Date.parse(eventInfo.endsAt)) return 'active';
    if(now < Date.parse(eventInfo.graceEndsAt)) return 'grace';
    return 'ended';
  }
  function eventMsLeft(which){
    const target = Date.parse(which==='grace' ? eventInfo.graceEndsAt : eventInfo.endsAt);
    return target - (Date.now() + (eventInfo.skew || 0));
  }
  function fmtRemain(ms){
    if(ms <= 0) return '終了';
    const s = Math.floor(ms/1000), d = Math.floor(s/86400), h = Math.floor(s%86400/3600), m = Math.floor(s%3600/60), sec = s%60;
    const pad = n=>String(n).padStart(2,'0');
    return d>0 ? `${d}日 ${pad(h)}:${pad(m)}:${pad(sec)}` : `${pad(h)}:${pad(m)}:${pad(sec)}`;
  }
  function fmtDateJst(iso){
    const d = new Date(Date.parse(iso));
    return `${d.getMonth()+1}/${d.getDate()} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
  }

  // ハロウィンUI(背景・装飾・配色)を出すかどうか。開催中だけ。終了時刻を過ぎれば、アップデート無しで元のUIに戻る
  function hwThemeOn(){ return uiPrefs.hwTheme && eventPhaseNow()==='active'; }
  function refreshEventTheme(){
    const on = hwThemeOn();
    const was = document.body.classList.contains('hw');
    document.body.classList.toggle('hw', on);
    document.body.classList.toggle('reduce-motion', !!uiPrefs.reduceMotion);
    if(on !== was && typeof applySkin === 'function' && equippedSkin){ try{ applySkin(equippedSkin); }catch(e){} }
  }
  function updateEventButtons(){
    const btn = document.getElementById('titleEventBtn');
    if(!btn) return;
    const ph = eventPhaseNow();
    const show = (ph==='active' || ph==='grace');
    btn.style.display = show ? '' : 'none';
    if(show){
      const label = document.getElementById('titleEventTimer');
      if(label) label.textContent = ph==='active' ? `開催中 あと${fmtRemain(eventMsLeft('end'))}` : `受取期限 あと${fmtRemain(eventMsLeft('grace'))}`;
    }
  }

  async function fetchEventStatus(){
    try{
      const res = await fetch(`${API_BASE_URL}/api/event/status`, { cache:'no-store' });
      const data = await res.json();
      const h = data && data.halloween;
      if(h){
        eventInfo = { ...h, skew: Date.parse(h.serverNow) - Date.now() };
        try{ localStorage.setItem(EVENT_CACHE_KEY, JSON.stringify(eventInfo)); }catch(e){}
      }
    }catch(err){ /* 通信できなければ前回の情報(キャッシュ)のまま判定する */ }
    refreshEventTheme();
    updateEventButtons();
  }

  async function hwApi(path, method, body){
    const res = await fetch(`${API_BASE_URL}/api/event/halloween/${path}`, {
      method: method || 'GET',
      headers: { 'Content-Type':'application/json', ...(authToken ? { 'Authorization':`Bearer ${authToken}` } : {}) },
      body: body ? JSON.stringify(body) : undefined
    });
    let data = null;
    try{ data = await res.json(); }catch(e){}
    if(!res.ok) throw new Error((data && data.error) || '通信に失敗しました');
    return data;
  }

  // 画面下に出る小さな通知
  function showEventToast(text){
    let box = document.getElementById('eventToastBox');
    if(!box){ box = document.createElement('div'); box.id = 'eventToastBox'; document.body.appendChild(box); }
    const el = document.createElement('div');
    el.className = 'event-toast';
    el.textContent = text;
    box.appendChild(el);
    setTimeout(()=>{ el.classList.add('out'); setTimeout(()=>el.remove(), 400); }, 2600);
  }

  // ゲーム終了時に呼ぶ: キャンディ獲得・ミッション進行(開催中でログイン中のときだけ)
  async function reportEventGame(info){
    if(!authToken || eventPhaseNow()!=='active') return;
    try{
      const data = await hwApi('report', 'POST', info);
      if(data && data.active && data.gained > 0) showEventToast(`🍬 キャンディ +${data.gained}`);
      ((data && data.newlyCompleted) || []).forEach((t,i)=> setTimeout(()=>showEventToast(`✅ ミッション達成: ${t}`), 900*(i+1)));
    }catch(err){ /* 報告に失敗してもゲームには影響させない */ }
  }

  // ---------- 表示用ヘルパー ----------
  function hwSkinName(id){ const s = SKINS.find(x=>x.id===id); return s ? s.name : id; }
  function hwRewardText(r){
    if(r.type==='coins') return `🪙 ${formatNumber(r.amount)}`;
    if(r.type==='ticket') return `🎟 ハロウィンチケット×${r.amount}`;
    if(r.type==='bpxp') return `🎫 バトルパスXP +${formatNumber(r.amount)}`;
    if(r.type==='skin') return `${hwSkinName(r.skinId)}${r.extraCoins ? ` ＋🪙${formatNumber(r.extraCoins)}` : ''}`;
    return '';
  }
  function hwSwatches(id, n){
    const s = SKINS.find(x=>x.id===id);
    if(!s) return '';
    return `<div class="skin-swatches" style="justify-content:center;">${buildPatternedColors(s.colors, s.pattern).slice(0, n||5).map(c=>`<span class="swatch" style="background:${c.bg}"></span>`).join('')}</div>`;
  }
  function hwApplyWallet(d){
    if(d.coins != null){ coins = d.coins; updateCoinUI(); if(hwState) hwState.coins = d.coins; }
    if(d.ownedSkins){ ownedSkins = d.ownedSkins; saveSkinsData(); if(hwState) hwState.ownedSkins = d.ownedSkins; }
    if(hwState){
      if(d.candies != null) hwState.candies = d.candies;
      if(d.tickets != null) hwState.tickets = d.tickets;
    }
  }

  // ---------- モーダル ----------
  async function openHalloweenModal(tab){
    modalContent.dataset.mode = 'halloween';
    hwTab = tab || 'home';
    modalOverlay.classList.add('show');
    const ph = eventPhaseNow();
    if(ph!=='active' && ph!=='grace'){
      modalContent.innerHTML = `<h2 class="hw-h2">🎃 ハロウィンイベント</h2><div class="empty-hint">現在開催していません。</div>`;
      return;
    }
    if(!authToken){
      modalContent.innerHTML = `<h2 class="hw-h2">🎃 ハロウィンイベント</h2><div class="empty-hint">イベントに参加するにはログインが必要です。<br>右上の 👤 からログインしてください。</div>`;
      return;
    }
    modalContent.innerHTML = `<h2 class="hw-h2">🎃 ハロウィンイベント</h2><div class="empty-hint">読み込み中...</div>`;
    try{
      hwState = await hwApi('state');
      if(modalContent.dataset.mode !== 'halloween') return;
      renderHalloween();
    }catch(err){
      modalContent.innerHTML = `<h2 class="hw-h2">🎃 ハロウィンイベント</h2><div class="empty-hint">${err.message}</div>`;
    }
  }

  const HW_TABS = [['home','🏠 ホーム'],['road','🛤 ロード'],['missions','📋 ミッション'],['gacha','🎰 ガチャ'],['shop','🛒 交換所'],['ranking','🏆 ランキング']];
  let hwTimerHandle = null;

  function renderHalloween(extraHtml){
    const s = hwState;
    if(!s) return;
    const active = eventPhaseNow()==='active';
    let html = `
      <h2 class="hw-h2">🎃 ハロウィン・ナイトフェス</h2>
      <div class="hw-head">
        <div class="hw-timer" id="hwTimer"></div>
        <div class="hw-wallet">
          <span title="キャンディ">🍬 <b>${formatNumber(s.candies)}</b></span>
          <span title="ハロウィンチケット">🎟 <b>${formatNumber(s.tickets)}</b></span>
          <span title="コイン">🪙 <b>${formatNumber(s.coins)}</b></span>
        </div>
      </div>
      <div class="tab-row hw-tabs">${HW_TABS.map(([k,l])=>`<button class="tab-btn ${hwTab===k?'active':''}" data-hwtab="${k}">${l}</button>`).join('')}</div>
      ${active ? '' : `<div class="hw-banner warn">⏳ イベントは終了しました。報酬の受け取りと交換所だけ、あと少し使えます。</div>`}
      ${extraHtml || ''}
      <div id="hwBody"></div>`;
    modalContent.innerHTML = html;
    modalContent.querySelectorAll('[data-hwtab]').forEach(b=>b.addEventListener('click', ()=>{
      hwTab = b.dataset.hwtab; renderHalloween();
    }));
    const body = document.getElementById('hwBody');
    if(hwTab==='home') body.innerHTML = hwHomeHtml();
    else if(hwTab==='road') body.innerHTML = hwRoadHtml();
    else if(hwTab==='missions') body.innerHTML = hwMissionsHtml();
    else if(hwTab==='gacha') body.innerHTML = hwGachaHtml();
    else if(hwTab==='shop') body.innerHTML = hwShopHtml();
    else if(hwTab==='ranking'){ body.innerHTML = `<div class="empty-hint">読み込み中...</div>`; hwLoadRanking(); }
    hwBindBody();

    const tick = ()=>{
      const el = document.getElementById('hwTimer');
      if(!el || modalContent.dataset.mode!=='halloween'){ clearInterval(hwTimerHandle); hwTimerHandle = null; return; }
      const ph = eventPhaseNow();
      if(ph==='active') el.textContent = `⏰ 開催終了まで ${fmtRemain(eventMsLeft('end'))}`;
      else if(ph==='grace') el.textContent = `⏳ 受取期限まで ${fmtRemain(eventMsLeft('grace'))}`;
      else { el.textContent = '終了しました'; }
    };
    tick();
    if(hwTimerHandle) clearInterval(hwTimerHandle);
    hwTimerHandle = setInterval(tick, 1000);
  }

  // ----- ホーム -----
  function hwHomeHtml(){
    const s = hwState, lg = s.login;
    const next = s.road.find(t=>!t.reached);
    const prevNeed = next ? (s.road[next.tier-2] ? s.road[next.tier-2].need : 0) : 0;
    const pct = next ? Math.max(0, Math.min(100, Math.round((s.totalCandies - prevNeed) / (next.need - prevNeed) * 100))) : 100;
    const days = lg.rewards.map((r,i)=>{
      const d = i+1;
      const done = lg.claimedToday ? d <= lg.day : d < lg.day;
      const cur = !lg.claimedToday && d === lg.day;
      return `<div class="hw-day ${done?'done':''} ${cur?'cur':''}">
        <div class="hw-day-n">${d}日目</div>
        <div class="hw-day-r">🍬${r.candies}<br>🪙${formatNumber(r.coins)}${r.tickets?`<br>🎟×${r.tickets}`:''}</div>
        ${done?'<div class="hw-day-check">✓</div>':''}
      </div>`;
    }).join('');
    const claimable = !lg.claimedToday && eventPhaseNow()==='active';
    return `
      <div class="hw-card">
        <div class="qtitle">🎁 トリック・オア・トリート(毎日ログインボーナス)</div>
        <div class="hw-days">${days}</div>
        <button class="primary-btn" id="hwLoginBtn" style="margin-top:10px;" ${claimable?'':'disabled'}>${lg.claimedToday ? '✓ 今日は受け取り済み' : (eventPhaseNow()==='active' ? '🎁 今日のボーナスを受け取る' : '受付終了')}</button>
        <div class="sub" style="margin-top:6px;">連続ログイン ${lg.streak}日。7日目はハロウィンチケットがもらえます。</div>
      </div>
      <div class="hw-card">
        <div class="qtitle">🛤 ハロウィンロード</div>
        <div class="sub">累計 🍬${formatNumber(s.totalCandies)} ${next ? `／ 次の報酬(${next.tier}段目)まで あと🍬${formatNumber(next.need - s.totalCandies)}` : '／ 🎉 全段クリア！'}</div>
        <div class="quest-bar-bg" style="margin-top:6px;"><div class="quest-bar-fill" style="width:${pct}%"></div></div>
        <button class="claim-btn" data-hwgo="road" style="margin-top:8px;">ロードを見る</button>
      </div>
      <div class="hw-card">
        <div class="qtitle">🍬 キャンディの集め方</div>
        <div class="sub hw-list">
          ・どのゲームも、遊ぶたびにキャンディがもらえる(高得点・ライン消し・Tスピン・パーフェクトクリアでボーナス)<br>
          ・毎日のミッション(3つ)と、毎週のミッション(3つ)をクリア<br>
          ・毎日のログインボーナス<br>
          ・フレンド対決をプレイすると +10 ボーナス<br>
          ・ハロウィンガチャは、ハズレでもキャンディがもらえる<br>
          ・集めたキャンディは、ロードの報酬・交換所・ランキングに使われます
        </div>
      </div>
      <div class="hw-card">
        <div class="qtitle">📅 開催期間</div>
        <div class="sub">${fmtDateJst(eventInfo.startsAt)} 〜 ${fmtDateJst(eventInfo.endsAt)}(日本時間)<br>
        ⚠️ ハロウィンガチャと新規のキャンディ獲得は、終了時刻で自動的に終了します。終了後 約2日間は、報酬の受け取りと交換所が使えます。<br>
        入手したスキンは、イベント終了後もずっと使えます。</div>
      </div>`;
  }

  // ----- ロード -----
  function hwRoadHtml(){
    const s = hwState;
    const claimable = s.road.filter(t=>t.reached && !t.claimed);
    let html = `
      <div class="sub" style="margin-bottom:8px;">累計 🍬${formatNumber(s.totalCandies)}(使ってもロードの進行は減りません)</div>
      <button class="primary-btn" id="hwRoadAll" ${claimable.length?'':'disabled'}>🎁 まとめて受け取る${claimable.length?`(${claimable.length}件)`:''}</button>
      <div class="hw-road">`;
    s.road.forEach(t=>{
      const big = t.reward.type==='skin';
      html += `
        <div class="hw-road-row ${t.claimed?'claimed':''} ${t.reached&&!t.claimed?'ready':''} ${big?'big':''}">
          <div class="hw-road-tier">${t.tier}</div>
          <div class="hw-road-info">
            <div class="hw-road-reward">${hwRewardText(t.reward)}</div>
            <div class="hw-road-need">🍬 ${formatNumber(t.need)}</div>
            ${big ? hwSwatches(t.reward.skinId, 5) : ''}
          </div>
          <div class="hw-road-act">
            ${t.claimed ? '<span class="hw-done">済</span>' : (t.reached ? `<button class="claim-btn" data-hwroad="${t.tier}">受け取る</button>` : '<span class="hw-lock">🔒</span>')}
          </div>
        </div>`;
    });
    return html + `</div>`;
  }

  // ----- ミッション -----
  function hwMissionCard(m, scope){
    const pct = Math.round(m.progress / m.target * 100);
    return `
      <div class="hw-mission ${m.claimed?'claimed':''}">
        <div class="hw-mission-top"><span>${m.text}</span><span class="hw-mission-reward">🍬${m.candies}</span></div>
        <div class="quest-bar-bg"><div class="quest-bar-fill" style="width:${pct}%"></div></div>
        <div class="hw-mission-foot"><span>${formatNumber(m.progress)} / ${formatNumber(m.target)}</span>
          ${m.claimed ? '<span class="hw-done">受取済</span>' : `<button class="claim-btn" data-hwmission="${m.id}" ${m.done?'':'disabled'}>受け取る</button>`}
        </div>
      </div>`;
  }
  function hwMissionsHtml(){
    const s = hwState;
    const ready = [...s.daily, ...s.weekly].filter(m=>m.done && !m.claimed).length;
    return `
      <button class="primary-btn" id="hwMissionAll" ${ready?'':'disabled'}>🎁 まとめて受け取る${ready?`(${ready}件)`:''}</button>
      <div class="qtitle" style="margin:12px 0 6px;">☀️ 今日のミッション <span class="sub">(毎日0時に入れ替わり)</span></div>
      ${s.daily.map(m=>hwMissionCard(m,'daily')).join('')}
      <div class="qtitle" style="margin:12px 0 6px;">🌙 今週のミッション <span class="sub">(毎週月曜0時に入れ替わり)</span></div>
      ${s.weekly.map(m=>hwMissionCard(m,'weekly')).join('')}`;
  }

  // ----- ハロウィンガチャ -----
  function hwGachaHtml(){
    const s = hwState, g = s.gacha, active = eventPhaseNow()==='active';
    const tk = s.tickets;
    const canOne = active && (tk > 0 || s.coins >= g.cost);
    const usedTk10 = Math.min(tk, 10), coins10 = (10 - usedTk10) * g.cost;
    const canTen = active && s.coins >= coins10;
    const pct = Math.min(100, Math.round(g.pity / g.pityThreshold * 100));
    const pct2 = n => (n*100).toFixed(2).replace(/\.?0+$/,'');
    const cards = g.pool.map(id=>`
      <div class="hw-gcard ${s.ownedSkins.includes(id)?'owned':''}">
        ${hwSwatches(id, 4)}
        <div class="hw-gname">${hwSkinName(id)}</div>
        <div class="hw-gown">${s.ownedSkins.includes(id)?'✓ 入手済み':'未入手'}</div>
      </div>`).join('');
    return `
      <div class="hw-banner">⏰ ハロウィンガチャは <b>${fmtDateJst(eventInfo.endsAt)}</b> で終了します(終了後は引けなくなります)</div>
      <div class="hw-gpool">${cards}</div>
      <div class="hw-card">
        <div class="sub hw-list">
          📊 排出率: 1スキン ${pct2(g.ratePerSkin)}% ／ 合計 ${pct2(g.rateTotal)}%<br>
          🎯 天井: ${g.pityThreshold}回(未所持のスキンから優先して確定)<br>
          🔁 被り: 🪙${formatNumber(g.dupCoins)} ＋ 🍬${g.dupCandies} ／ ハズレ: 🪙${formatNumber(g.missCoins)} ＋ 🍬${g.missCandies}
        </div>
        <div class="quest-bar-bg" style="margin-top:8px;"><div class="quest-bar-fill" style="width:${pct}%"></div></div>
        <div class="sub" style="margin-top:4px;">天井まで: ${g.pity} / ${g.pityThreshold}回(累計 ${g.pulls}回)</div>
      </div>
      <div style="display:flex; gap:8px;">
        <button class="primary-btn" data-hwpull="1" style="flex:1;" ${canOne?'':'disabled'}>${tk>0 ? '🎟 チケットで1回' : `🎃 1回 (🪙${formatNumber(g.cost)})`}</button>
        <button class="primary-btn" data-hwpull="10" style="flex:1;" ${canTen?'':'disabled'}>🎃 10連 (🪙${formatNumber(coins10)}${usedTk10?` ＋🎟×${usedTk10}`:''})</button>
      </div>
      <div id="hwGachaResult" style="margin-top:10px;"></div>`;
  }
  function hwResultHtml(d){
    const rows = d.results.map((r,i)=>{
      let label, cls = '';
      if(r.resultType==='win'){ label = `${r.pityTriggered?'🎯':'🎉'} ${hwSkinName(r.skinId)} 獲得！`; cls = 'win'; }
      else if(r.resultType==='duplicate'){ label = `🔁 ${hwSkinName(r.skinId)} 被り (+🪙${formatNumber(r.coinsGained)} +🍬${r.candiesGained})`; }
      else { label = `ハズレ (+🪙${formatNumber(r.coinsGained)} +🍬${r.candiesGained})`; cls = 'miss'; }
      return `<div class="hw-res-row ${cls}">${d.results.length>1 ? (i+1)+'. ' : ''}${label}</div>`;
    }).join('');
    const wins = d.results.filter(r=>r.resultType==='win');
    const swatches = wins.map(w=>hwSwatches(w.skinId,5)).join('');
    return `<div class="hw-card ${wins.length?'gold':''}"><div class="qtitle" style="text-align:center;">${wins.length?'🎉 ':''}${d.results.length>1?'10連結果':'結果'}</div>${swatches}${rows}</div>`;
  }
  async function hwPull(count){
    const btns = modalContent.querySelectorAll('[data-hwpull]');
    btns.forEach(b=>b.disabled = true);
    const area = document.getElementById('hwGachaResult');
    if(area) area.innerHTML = `<div class="empty-hint">🎃 抽選中...</div>`;
    try{
      const d = await hwApi('gacha/pull', 'POST', { count });
      hwApplyWallet(d);
      hwState.gacha.pity = d.pity; hwState.gacha.pulls = d.pulls;
      if(d.results.some(r=>r.resultType==='win'||r.resultType==='duplicate')) playSound('coin');
      renderHalloween();
      document.getElementById('hwGachaResult').innerHTML = hwResultHtml(d);
    }catch(err){
      if(area) area.innerHTML = `<div class="empty-hint">${err.message}</div>`;
      btns.forEach(b=>b.disabled = false);
      fetchEventStatus();   // 終了していた場合は、画面もすぐ閉じる/切り替える
    }
  }

  // ----- 交換所 -----
  function hwShopHtml(){
    const s = hwState;
    return `<div class="sub" style="margin-bottom:8px;">キャンディ 🍬${formatNumber(s.candies)} 所持中(交換で減っても、ロードの進行には影響しません)</div>` +
      s.shop.map(it=>{
        const left = it.limit - it.bought;
        const can = left > 0 && s.candies >= it.cost;
        const skin = it.give.type==='skin';
        return `
          <div class="hw-card">
            <div class="qtitle">${it.name}</div>
            ${skin ? hwSwatches(it.give.skinId, 5) : ''}
            <div class="sub" style="margin:2px 0 8px;">${it.desc}</div>
            <div class="quest-foot"><span>🍬 ${formatNumber(it.cost)} ／ 残り ${left}/${it.limit}</span>
              <button class="claim-btn" data-hwbuy="${it.id}" ${can?'':'disabled'}>${left<=0?'交換済み':'交換する'}</button></div>
          </div>`;
      }).join('');
  }

  // ----- ランキング -----
  async function hwLoadRanking(){
    const body = document.getElementById('hwBody');
    try{
      const d = await hwApi('ranking');
      if(hwTab!=='ranking' || !body) return;
      const me = d.me;
      let html = `<div class="sub" style="margin-bottom:8px;">累計キャンディのランキング(上位20人)。あなた: ${me.rank ? `${me.rank}位 / 🍬${formatNumber(me.total)}` : '圏外(まだ0)'}</div>`;
      html += d.ranking.length ? d.ranking.map((r,i)=>`
        <div class="friend-item ${r.id===me.id?'pending':''}"><span class="fname">${['🥇','🥈','🥉'][i] || (i+1)+'位'} ${r.id}</span><span class="fsub">🍬 ${formatNumber(r.total)}</span></div>`).join('')
        : `<div class="empty-hint">まだ誰もキャンディを集めていません。一番乗りを目指そう！</div>`;
      body.innerHTML = html;
    }catch(err){ if(body) body.innerHTML = `<div class="empty-hint">${err.message}</div>`; }
  }

  // ----- ボタンの結びつけ -----
  function hwBindBody(){
    const on = (sel, fn)=> modalContent.querySelectorAll(sel).forEach(el=>el.addEventListener('click', ()=>fn(el)));
    const run = async (fn, okMsg)=>{
      try{ const d = await fn(); hwApplyWallet(d); hwState = await hwApi('state'); renderHalloween(okMsg ? `<div class="hw-banner ok">${okMsg(d)}</div>` : ''); playSound('coin'); }
      catch(err){ alert(err.message); }
    };
    on('[data-hwgo]', el=>{ hwTab = el.dataset.hwgo; renderHalloween(); });
    on('#hwLoginBtn', ()=>run(()=>hwApi('login-bonus','POST'), d=>`🎁 ${d.day}日目のボーナス: 🍬${d.reward.candies} 🪙${formatNumber(d.reward.coins)}${d.reward.tickets?` 🎟×${d.reward.tickets}`:''}`));
    on('#hwRoadAll', ()=>run(()=>hwApi('road/claim','POST',{all:true}), d=>`🎁 ${d.claimedCount}件受け取りました: ${d.gained.join(' / ')}`));
    on('[data-hwroad]', el=>run(()=>hwApi('road/claim','POST',{tier:parseInt(el.dataset.hwroad)}), d=>`🎁 受け取りました: ${d.gained.join(' / ')}`));
    on('#hwMissionAll', ()=>run(()=>hwApi('missions/claim','POST',{all:true}), d=>`🍬 ミッション報酬 ${d.claimedCount}件(+${d.candies})`));
    on('[data-hwmission]', el=>run(()=>hwApi('missions/claim','POST',{id:el.dataset.hwmission}), d=>`🍬 +${d.candies}`));
    on('[data-hwbuy]', el=>run(()=>hwApi('shop/buy','POST',{id:el.dataset.hwbuy}), d=>`🛒 交換しました: ${d.gained}`));
    on('[data-hwpull]', el=>hwPull(parseInt(el.dataset.hwpull)));
  }

  // ハロウィン背景(コウモリ・おばけ・カボチャ)。表示/非表示は CSS の body.hw で切り替わる
  function buildHwBg(){
    const box = document.getElementById('hwBg');
    if(!box || box.childElementCount) return;
    const items = ['🦇','🦇','🦇','🦇','🦇','👻','👻','🎃','🕸️','🦇'];
    items.forEach((emoji, i)=>{
      const el = document.createElement('span');
      const ghost = (emoji==='👻' || emoji==='🎃' || emoji==='🕸️');
      el.className = 'hw-fly' + (ghost ? ' ghost' : '');
      el.textContent = emoji;
      el.style.left = (ghost ? (8 + (i*13)%80) : 0) + 'vw';
      el.style.top = (ghost ? 45 + (i*7)%40 : 6 + (i*11)%46) + 'vh';
      el.style.fontSize = (ghost ? 26 + (i%3)*6 : 16 + (i%4)*5) + 'px';
      el.style.setProperty('--dur', (ghost ? 14 + (i%4)*3 : 20 + (i*3)%16) + 's');
      el.style.setProperty('--delay', (-(i*4.3)) + 's');
      box.appendChild(el);
    });
  }
  buildHwBg();

  loadUiPrefs();
  refreshEventTheme();
  document.getElementById('titleEventBtn').addEventListener('click', ()=>{ hideTitleScreen(); openHalloweenModal('home'); });
  updateEventButtons();
  setInterval(()=>{ updateEventButtons(); const on = hwThemeOn(); if(on !== document.body.classList.contains('hw')) refreshEventTheme(); }, 1000);
  fetchEventStatus();
  setInterval(fetchEventStatus, 5 * 60 * 1000);
  document.addEventListener('visibilitychange', ()=>{ if(!document.hidden) fetchEventStatus(); });


  // ===================== 🧭 新レイアウト: メニューシート・ロビー表示 =====================
  (function setupNewLayout(){
    const sheet = document.getElementById('quickSheetWrap');
    const openBtn = document.getElementById('menuSheetBtn');
    const lobbyName = document.getElementById('lobbyAccountName');
    const lobbyCoins = document.getElementById('lobbyCoins');
    const menuDot = document.getElementById('menuDot');
    const toggle = (on)=> sheet.classList.toggle('show', !!on);
    openBtn.addEventListener('click', ()=>toggle(true));
    // 背景タップ・項目タップで閉じる(サウンドのON/OFFだけは開いたまま)
    sheet.addEventListener('click', (e)=>{
      if(e.target === sheet) return toggle(false);
      const item = e.target.closest && e.target.closest('.icon-btn');
      if(item && item.id !== 'soundBtn') toggle(false);
    });
    document.getElementById('lobbyAccount').addEventListener('click', ()=>{ hideTitleScreen(); accountBtn.click(); });
    const update = ()=>{
      lobbyName.textContent = currentUserId || 'ゲスト';
      lobbyCoins.textContent = formatNumber(coins);
      // 未読(フレンド・チャット)があれば ☰ にも赤い点を出す
      menuDot.classList.toggle('show', friendsDot.classList.contains('show') || chatDot.classList.contains('show'));
    };
    update();
    setInterval(update, 1000);
  })();

  // ===================== 💤 スリープ対策 =====================
  // ① サーバー(Render無料枠)が寝ていても、ページを開いた瞬間に起こしておく。開いている間も定期的に叩く。
  function pingServer(){
    fetch(`${API_BASE_URL}/healthz`, { cache:'no-store' }).catch(()=>{});
  }
  pingServer();
  setInterval(()=>{ if(!document.hidden) pingServer(); }, 4 * 60 * 1000);

  // ② 端末の画面が勝手に暗く/スリープしないようにする(Screen Wake Lock API。対応していないブラウザでは何もしない)
  let wakeLockSentinel = null;
  async function requestWakeLock(){
    try{
      if(!('wakeLock' in navigator) || document.hidden || wakeLockSentinel) return;
      wakeLockSentinel = await navigator.wakeLock.request('screen');
      wakeLockSentinel.addEventListener('release', ()=>{ wakeLockSentinel = null; });
    }catch(err){ wakeLockSentinel = null; }
  }
  requestWakeLock();
  ['pointerdown','keydown','touchstart'].forEach(ev=> document.addEventListener(ev, requestWakeLock, { passive:true }));
  document.addEventListener('visibilitychange', ()=>{ if(!document.hidden){ requestWakeLock(); pingServer(); } });

  // ===================== 初期化 =====================
(async function start(){
    await loadCustomBackground();
    await loadAppSettings();
    await loadBgmSettings();   // ★これを追加
    await loadBest();
    await loadBestScores();  // モード別ベスト読み込み
    await loadCoins();
    await loadSkinsData();
    await loadSettings();
    await loadDailyQuests();
    // リロード後も安全にログイン状態を復元(トークンをサーバーで検証してから復元)
    await restoreSession();
    updateAccountButton();
    updateModeBadge();
    if(currentMode === 'tetris'){
      enterTetrisMode();
    } else {
      initBoard();
      fillTray();
    }
    // 外部サイトへは飛ばさず、まずアプリ内のメインメニュー画面を表示する
    showTitleScreen();
    // お知らせ・アップデート確認(ログイン状態に関わらず定期チェック)
    await loadLastSeenAnnouncement();
    checkAnnouncements();
    setInterval(checkAnnouncements, 20000);
    setInterval(checkForUpdate, 60000);
    // イベントカウントダウン(1秒ごとに更新、1分ごとにサーバーと再同期)
    await fetchEventsList();
    setInterval(tickEventCountdown, 1000);
    setInterval(fetchEventsList, 5000); // 短めの間隔にして、管理者がイベントを削除した際も全員の画面にすぐ反映されるようにする
  })();

})();

# 🤖 AIへの指示(このリポジトリを更新するAIは、必ず守ること)

## アップデートログ(`frontend/script.js` の `CHANGELOG`)の書き方
`CHANGELOG` はプレイヤーが画面で読むものです。次のルールで書いてください。

- **書くのは、プレイヤーが体験できる変化だけ。** 新機能・遊びやすくなった点・不具合の修正を、短い1行で書く
- **管理者以外に影響がないことは書かない。** (例: 管理者コマンドの追加・変更、管理者パネルの改善、管理者だけが使う機能)
- **コードの詳しい解説は書かない。** (例: ファイル名、関数名、DB・API・実装方法の説明、内部の仕組み)
- **Discord関係は一切書かない。** (Webhook、通知の形式、コピー欄、ご要望・不具合がDiscordに届く仕組みなど。過去のログにあれば消す)
- 管理者の機能がプレイヤーにも影響する場合(例: 管理者がギフトを送る → 全員に届く)は、**プレイヤー側の体験**として書く
  - 悪い例: 「管理者が/giftコマンドでコインを贈れます」
  - 良い例: 「運営からのプレゼントが届くと、開封できます」
- バージョン番号は、ユーザーが指定した番号を使う(指定がなければ、機能追加はマイナー、不具合修正のみはパッチを上げる)

## 変更したファイルの報告(作業を終えたら、必ず返信に書くこと)
作業を終えたら、ユーザーへの返信の最後に **変更したファイルの一覧** を書いてください。

- 「新規」「変更」「削除」を分けて、パスと一言の内容を書く(例: `変更: backend/app.py — ランキングにキャッシュを追加`)
- 変更していないファイルは書かない。実際に触ったファイルだけを、漏れなく書く
- 作業の途中で「どのファイルを変更したか」を聞かれたら、その時点の実際の状況(まだ何も変更していない場合は、その旨)を正直に答える
- このREADMEの「🤖 AIへの指示」を変えた場合も、一覧に含める

---

# NEXUS (by vortx) — GitHub Pages + Render(Flask) + Supabase 版

```
.
├── .github/workflows/
│   ├── pages.yml        ← frontend/ を GitHub Pages に自動公開
│   └── keepalive.yml    ← 10分おきにサーバーを起こす(スリープ対策)
├── render.yaml          ← バックエンド(Flask)のRender設定
├── backend/             ← Flask API(DBは Supabase Postgres)。app.py 本体 / halloween.py(ハロウィン本体 + 中身の数字 `class C` + 毎日ログボ・ウェルカムギフト `eng_*`) / minigames.py / social.py(投票・ギフト) / titles.py(称号)
└── frontend/            ← 静的サイト(config.js でバックエンドURLを指定)
    ├── icons/           ← アイコン・ロゴを置く(名前は icons/README.md)
    ├── loading.css      ← 起動時のロード画面(マークアップと動きは index.html の #bootLoader)
    ├── titles.js/.css   ← 称号の画面・名前の横の称号ラベル / 管理者の「投票の詳細」の見た目
    ├── theme.css        ← 色・質感(高級感のあるデザイン + ハロウィン演出)
    ├── anim.css         ← アニメーション(画面切替・ボタン・ウィンドウ・数字など)
    ├── minigames.js/.css ← ミニゲームの土台(メニュー・結果・ランキング) + 最初の6本 + 後半の「v3.6 新ゲーム12本」(ファイルの後半)
    ├── admin.js          ← 管理画面 + 後半に「ハロウィン パート2の画面」(ドア・畑・図鑑・スタンプ・みんなで・おばけ)と「ゲスト向けお誘い・毎日ログボ」(HW2 / CBEngage)
    ├── titles.css        ← 称号 + 後半に「ハロウィン パート2」「ゲスト向けお誘い」のCSS
    ├── gachafx.js/.css  ← ガチャ演出(宝箱 → ルーレット → 結果)
    ├── gifts.js/.css    ← ギフト開封(プレゼントボックス → 手紙 → アイテム)
    ├── social.js/.css   ← 投票 / メッセージ編集の見た目 / 管理者パネルの見た目
    ├── admin.js         ← 管理者パネル(コマンドを選んで、ボタンと選択肢で入力)
    ├── layout.css       ← 配置・形(ロビー型ホーム / ☰メニュー / ボトムシート / テトリス操作パッド)
    ├── manifest.webmanifest  ← 「ホーム画面に追加」用
    └── bgm/             ← mp3 はここに置き直す(zipには含めていません)
```

## 🖼 アイコン / 📷 チャット画像 / 🏅 バトルパスLv(v3.8.0)
- **アイコン**: 絵文字(60種)+色(8色)から選ぶ(=画像を使わないので容量ゼロ)か、画像をアップロード。`users.icon` に `e:🎃:3`(絵文字:色番号)または `i:画像ID` で保存。`POST /api/account/icon`(プリセット/初期化)・`POST /api/img/upload?kind=icon`(アップロード)
- **チャット画像**: 📷で添付 → アプリが長辺800px・約70KB以下のWebP(非対応端末はJPEG)に圧縮 → `POST /api/img/upload?kind=chat` → そのIDで `POST /api/chat/send {message, imageId}`。画像は `GET /api/img/<id>`(ブラウザに1年キャッシュさせるので通信も軽い)
- **DBの容量を使いすぎない工夫**(`backend/app.py` 冒頭の `IMG_*` / `ICON_MAX_BYTES` / `CHAT_IMG_MAX_BYTES` で調整):
  ①送る前に圧縮(アイコン128px・約10KB / チャット約60KB) ②サーバー側も上限を確認(アイコン24KB・チャット150KB・WebP/JPEGのみ) ③チャット画像は **72時間で自動削除**(メッセージは残り、画像は「期限切れ」表示)・全体でも300枚/30MBまで(超えたら古い順) ④アイコンは1人1枚(新しくすると古いのは消える・プリセットに戻すと画像は消える) ⑤送信されなかった画像・持ち主のいない画像・取り消されたメッセージの画像は1時間以内に掃除 ⑥1人あたり、アイコン6回/時・チャット画像15回/時まで。**最悪でも、チャット画像は約30MB+アイコン(1人約10KB)で頭打ち**
- 荒れたときは、`IMG_CHAT_ENABLED = False` でチャットへの画像送信を止められる(アイコンは別)
- 画像テーブル `images`(列は起動時に自動作成)。**ID変更・アカウント削除の対象にも入っている**
- **バトルパスLv**: 名前の横の `Lv.◯`。各APIが `lv`(= `battlepass_xp // BATTLEPASS_XP_PER_LEVEL + 1`)を返す。ランキング・チャット・フレンド・プロフィール・イベント/ミニゲームのランキングに表示(バトルパスのランキングは作っていない)
- 画面側は `whoHtml(o)`(アイコン+表示名+Lv)/ `avatarHtml` / `lvTag` を使う。外部ファイルからは `CB.who` / `CB.avatar`

## 📮 サポートチャット(運営との専用チャット)(v3.8.0)
- ご要望/不具合報告を**ログイン中に**送ると、Discordへの通知に加えて、運営との専用チャットが開く(ゲストはDiscordへの送信だけ。「ログインすると返信がもらえる」と案内)。1人が同時に開けるのは5件まで(`SUPPORT_MAX_OPEN`)
- 流れ: ①運営(管理者)が1つずつ返信(普通のチャット) ②運営が「終了」→ **どちらからも送れなくなる** ③送った本人に 👍/👎 が出る ④👍=「問題は解決しました(ご要望ならリクエストありがとうございました)」で完了 ⑤👎=元の内容つきの**新しいチャット**が開く(運営に未読+Discord通知)
- 運営側: 「ご要望・不具合報告」→「💬 運営とのやりとり」→「🛠 受信箱」(管理者だけ)。ユーザーのメッセージ・👎の再オープンは、Discord(ご要望/不具合報告のWebhook)にも届く
- API(すべてログイン必須): `GET /api/support/threads(?scope=admin)` / `GET /api/support/thread/<id>`(開くと自分側の未読が0に) / `POST …/send` / `POST …/close`(管理者のみ) / `POST …/review {result:'up'|'down'}` / `GET /api/support/summary`(通知バッジ用)。テーブル `support_threads` `support_messages`(起動時に自動作成)

## 🔔 ロビーの「お知らせバー」(v3.8.0)
- 未読のチャット(メンションは別表示)・**未投票の質問**・運営からの返信・評価待ち・フレンドの通知・受け取れるギフト・(管理者)未対応のサポートチャット を、ロビーの上に赤いチップで並べる。タップでその画面へ。何もなければ隠れる(`admin.js` 後半の `CBNotify` 相当)
- 運営から返信が来たときは、画面にトーストも出る

## 🪪 表示名 / ID変更 / 管理者ID(v3.7.0)
- **ID**: ログイン用(半角英数字とアンダースコア3〜20文字)。**7日に1回**だけ変更できる(`ID_CHANGE_DAYS`)。変更にはパスワードの確認が必要。管理者アカウントは変更不可
- **表示名**: ランキング・チャット・フレンド・対決・プロフィールなどに出る名前。日本語OK・16文字まで(`DISPLAY_NAME_MAX`)・何度でも変更OK・重複OK。空にするとIDが表示される。`users.display_name`(列は起動時に自動追加)
- 表示名の検査は `backend/app.py` の `clean_display_name`: 使える文字は文字・数字・一部の記号・絵文字。`< > & " ' \` や URL は不可。「vortx」「運営」「管理者」「NEXUS」などは、なりすまし防止のため管理者以外は不可(`RESERVED_NAME_*`)。画面側は必ず `nameOf()`(HTMLエスケープ)を通して出す
- API: `GET /api/account/info` / `POST /api/account/display-name` / `POST /api/account/change-id`(新しいトークンが返る)。ほかのAPI(ランキング・フレンド・チャット・対決・プロフィール・イベントランキング・ミニゲームランキング)は、`id` に加えて `name`(表示名。未設定ならID)を返す
- ID変更は、IDが入っている全テーブル(`USER_ID_COLUMNS`)をまとめて書き換える。**IDを持つ新しいテーブル/列を足したら、ここにも足すこと**(足さないとID変更で、そのデータが持ち主から外れる)
- **Discord通知**: ID変更のたびに、旧ID→新IDなどが届く。環境変数 `DISCORD_WEBHOOK_ID_CHANGE`(未設定なら `DISCORD_WEBHOOK_AUTH` のチャンネルに送る)
  1. Discordの通知を受けたいチャンネルを開く → 歯車(チャンネルの編集)→ 連携サービス → ウェブフック → 新しいウェブフック
  2. 名前をつけて「ウェブフックURLをコピー」(`https://discord.com/api/webhooks/…`)
  3. Render → サービス → Environment → Add Environment Variable → Key `DISCORD_WEBHOOK_ID_CHANGE` / Value に貼り付け → Save(再デプロイされる)
  4. 起動ログの「Discord Webhook 設定」に `ID_CHANGE: 設定あり` と出れば成功
- **管理者ID**: `spirit` → `vortx`(`ADMIN_USER_ID` / フロントの `ADMIN_USER_ID` / ギフトの送り主 `ENG_GIFT_FROM`)。旧 `spirit` のアカウントは、起動時に `migrate_admin_id()` が自動で `vortx` に引っ越す(パスワード・スキン・フレンド・記録・ギフトはそのまま。済んでいれば何もしない)。引っ越し後は `vortx` で再ログインが必要。`vortx` を先に別の人に取られていた場合は引っ越しをスキップしてログに警告を出す。予約ID(`RESERVED_IDS`)は新規登録・ID変更では使えない

## 🎃 ハロウィン パート2(v3.6.0)
- **中身の数字・文章は `backend/halloween.py` の `class C`**(図鑑24種・スタンプの報酬・ドアの出目・おみくじ・畑・みんなの目標・ミッション・交換所・ボーナスタイム)。ロジックと API は `backend/halloween.py`
- 新しい状態は `users.event_state` に入る(イベントIDが変わると全部リセット)。API(すべて `/api/event/halloween/` 以下):
  `tot/open`(3つのドア) / `fortune`(おみくじ) / `patch/plant`・`patch/harvest`(畑) / `ghost/catch`(さまようおばけ) / `dex/claim` / `stamps/claim` / `community`・`community/claim`(みんなで) / `guest-carryover`(ゲストのキャンディ引き継ぎ)
- `state` に `badges`(受け取れる数・タブの赤丸) / `boost`(いまのキャンディ倍率) / `dex` / `stamps` / `tot` / `patch` などが増えた
- ミッションは日替わり4・週替わり4。ロードは60段(50段目・60段目にスキン)。ガチャは8種(1スキン0.5% → 合計4.0%)。新スキン8種(`HALLOWEEN_SKINS` + `backend/halloween.py` の `GACHA_POOL` / `ROAD_SKINS` / `SHOP_SKINS` / `EXTRA_SKINS`)
- キャンディのボーナスタイム: 10/31=3倍、10/30・11/1=2倍、土日・毎晩20〜23時=1.5倍(いちばん高いものが1つだけ効く)。`C.BOOST_*`
- スタンプラリーの対象は `backend/minigames.py` の `GAMES`(ミニゲーム)から自動。ミニゲームを足したら、スタンプの数も自動で増える(称号 `hw_stamp_all` の必要数だけ手で合わせる)

## 🕹 ミニゲーム追加の手順(v3.6)
1. `backend/minigames.py` の `GAMES` に `'id': ('high'|'low', 最小, 最大, '単位')` を足す(範囲外の記録はサーバーが捨てる)
2. `frontend/minigames.js` の後半(v3.6の新ゲーム)に `start(stage, api)` を書き、一覧(`NEW`)に `{id, emoji, name, desc, unit, better, genre, start}` を足す(`genre` は action / puzzle / reflex / brain。記録が「0.1秒」などのときは `fmt` で表示を変える)
3. 終わったら `api.finish({ rating:0〜100, score, better, valid:true, text })`。`api.best` が自己ベスト
- 効果音は `playSound` の種類を追加(`snakeEat` `snakeTurn` `snakeDie` `snakeStart` `jump` `point` `hit` `note` `tick` `pop` `whoosh` `win` `bad`)

## 🎁 ゲスト向けの工夫と毎日ログインボーナス(v3.6)
- 毎日ログインボーナス(1年中): `GET /api/bonus/daily` / `POST /api/bonus/daily/claim`。報酬は `backend/halloween.py` の `ENG_DAILY_REWARDS`/ (7日サイクル)と `ENG_STREAK_BONUS`(3・14・30・60・100日連続の上乗せ)。テーブル `daily_bonus` は初回起動で自動作成
- ウェルカムギフト: 新規登録の直後に、既存の「ギフト」(🎁)として1件届く(`ENG_WELCOME_GIFT`)。ゲストでためたキャンディは登録後に1回だけ引き継ぎ(最大150、`C.GUEST_CARRYOVER_MAX`)
- ゲストにだけ見せるもの: ロビーの案内バー / 時々出るお知らせ(1日6回まで・4分以上あける・プレイ中は出さない。`admin.js` 後半の `NUDGE_*`) / アカウント画面のメリット一覧 / ミニゲーム結果のお誘い / ハロウィン画面の案内。文章は `halloween.py` の `ENG_GUEST_PERKS`(`/api/guest/perks`)で一元管理
- 称号に `streak` `dex` `stamps` `tot` `harvest` `ghost` の条件を追加(`titles.py`)

## 🎃 ハロウィンイベント(v3.0.0)

- 期間は **サーバー**が決めます(既定: 2026-10-17 〜 2026-11-08 日本時間。終了後 48時間は「報酬の受け取り・交換所」だけ使える)。
  **期限を過ぎるとガチャは自動で引けなくなり、ハロウィンUIも自動で元に戻ります(フロントの更新は不要)。**
  入手済みのスキンは終了後もずっと使えます。
- 期間を変える・延長するには、Renderの環境変数を設定して再起動:
  `HALLOWEEN_START` / `HALLOWEEN_END`(例 `2026-10-17T00:00:00+09:00`)/ `HALLOWEEN_GRACE_HOURS`
- 内容: 期間限定ガチャ(**専用通貨 🍬ハロウィンキャンディ**で1回80個・10連・天井1000回。コインは使わない)、ハロウィンロード(60段)、
  日替わり/週替わりミッション、毎日ログインボーナス(7日サイクル)、交換所、キャンディランキング
- キャンディの目安: アクティブに遊ぶ人で1日およそ500個、のんびりでも約200個。ガチャや交換所で使っても、ロードの進行(累計)は減りません
- 数値は `backend/halloween.py` の先頭付近(`GACHA_COST` など)で調整できます
- 来年以降: `backend/halloween.py` の `EVENT_ID` を変えると全員の進行がリセットされます。
- バックエンドは別ファイル `backend/halloween.py` です。テーブルの列(`users.event_state` / `duels.game`)は初回起動で自動追加されます。

## 🏷 称号(v3.5.0)
- 定義は `backend/titles.py` の `TITLES`(1行足すだけ)。条件の種類(`kind`)は先頭の説明を参照。獲得済みは `users.titles` に残り、付けている称号は `users.equipped_title`
- 名前の横に出る場所: ランキング / チャット / フレンド / プロフィール / ロビーの自分の名前の下
- **管理者専用**(`rarity='admin'`): 🌌星海の創造主 / ⚜運命の調律者 / 🕯夜明けを灯す番人 / 👑天蓋に座す者。管理者アカウント(`ADMIN_USER_ID`)だけが持てて、他の人の一覧には出ない(サーバーが判定)
- API: `GET /api/titles` / `POST /api/titles/equip`(列は初回起動で自動追加)

## 👀 投票の詳細(管理者のみ)
管理者パネル →「投票を管理」→ 各質問の「👀 投票の詳細」で、どのアカウントがどの選択肢にいつ投票したかが見られます(アカウント名で検索も可)。
API: `GET /api/admin/poll/<id>/voters`(管理者だけ)。一般の人の画面では、誰が投票したかは見えません。

## ⚡ 読み込みを速くした仕組み(v3.5.0)
- サーバー: 同じ内容を全員が何度も取りに来るAPI(ランキング5秒 / チャット1.5秒 / イベント一覧5秒 / お知らせ10秒)を短時間キャッシュ(`ttl_cache`)。書き込み時は `cache_drop` で作り直す
- サーバー: ランキングは自分の値も一緒に返す / フレンド一覧+リクエスト+DM未読を `GET /api/social/summary` 1回に / 投票・フレンドは1回の問い合わせに集約 / `/api/sync` は1回で済ませ、オンライン時刻は8秒以上空いたときだけ書く
- サーバー: チャット送信のたびに全件を並べ替えていた掃除を20回に1回へ / DB接続を4本先に張っておき、満杯のときはエラーにせず待つ / 索引を追加
- フロント: 開いた瞬間に前回の内容を表示して裏で更新 / 送信は返事をそのまま画面に足す / 画面を見ていないときの定期通信を停止 / 通信間隔を調整(イベント一覧5→15秒、ユーザー同期5→8秒、フレンド裏チェック8→12秒 など)
- 遅さの原因を調べるとき: 各レスポンスに `Server-Timing`(DBに使った時間・回数 / サーバー処理 / 合計)が付く。ブラウザの開発者ツール → Network → 遅いAPI → Timing で見られる。合計800msを超えたリクエストは Render のログにも `🐢` で出る。`db` が大きければDB側、`app` が大きければサーバー側、どちらも小さいのに遅ければ、ブラウザ↔サーバー間の距離(リージョン違い)やサーバーの起動待ち
- 通信の土台(`frontend/net.js`): サーバーへの接続を先読み / 起動時に眠っているサーバーを起こす / 読み込み(GET)は通信エラー・502/503/504で自動再試行(最大3回) / 同時の同じGETは1本にまとめる / 60秒で時間切れ。書き込み(POST)は二重実行を避けるため再試行しない
- 通信の土台(サーバー): CORSの事前確認を2時間キャッシュさせる(`max_age`。無いと呼び出しのたびに1往復増える) / JSONを1KB超でgzip / DBは1文だけの問い合わせを autocommit にして COMMIT の往復を省く / 2分以上使っていないDB接続は使う前に生存確認し、切れていたら捨てて再試行(書き込みは二重実行を避けて1回まで)
- 外部通知(Webhook)はログイン・登録などでは裏で送り、応答待ちで本処理を止めない。429・5xxは自動で再試行。管理者パネル「サーバー」→「外部通知の接続テスト」で設定と送信を一括確認できる
- 起動: ロード画面を出し、眠っているサーバーを最大4秒しか待たずに先へ進む。通信できなかっただけではログアウトしない(401/404のときだけ)

## 🗂 メニューの区分
ロビーも ☰メニューも、同じ4区分です(☰には検索欄つき)。新しい機能を足すときは、この区分のどれかに入れてください。
「あそぶ」ゲーム系 / 「あつめる」ガチャ・パス・イベント・クエスト・記録・称号 / 「みんなと」フレンド・チャット・ランキング・投票・ギフト / 「せってい」設定・サウンド・BGM・アカウント・更新履歴

## 🗳 投票・🎁 ギフト・✏️ メッセージ編集
- 投票: ゲスト以外が投票できる(やり直し可)。質問の作成・編集・終了・リセット・削除は管理者パネル →「投票を管理」
- ギフト: 管理者パネル →「ギフトを送る」(メッセージ + コイン / イベント通貨 / XP / イベントXP)。受け取る人は、ログイン時(ロビー)またはゲームオーバー後に開封する。
  ギフトの受け取りは、必ず `POST /api/gifts/claim`(サーバーが付与)を通す
- 「イベントXP」はハロウィンロードの進行(累計)だけを進める。「イベント通貨」は使えるキャンディ(累計も増える)
- メッセージ: 自分のメッセージをタップ → 編集 / 送信取り消し(サーバーチャットとDM。取り消すと相手の画面からも消える)
- 文字でコマンドを打ちたいときは、管理者パネルの「直接入力」。`/gift <ユーザーID|all> <コイン> <イベント通貨> <XP> <イベントXP> <メッセージ>` も使える
- テーブル(`polls` / `poll_votes` / `gifts`)と列(`edited_at` / `deleted`)は、初回起動で自動作成・追加される

## 🕹 ミニゲーム
ロビーの「ミニゲーム」から遊べます。遊ぶとコイン・バトルパスXP・(開催中は)ハロウィンキャンディがもらえます。
ゲームを増やすときは `frontend/minigames.js` の `GAMES` に1つ足すだけ(`start(stage, api)` を作り、終わったら `api.finish({...})`)。

## 🛠 v3.4.1 の修正メモ
- 🎫 **バトルパスが固まる問題**: ギフトなどで大量のXPが入るとレベルが数百万になり、全レベルぶんの報酬一覧を作って描画しようとして固まっていた。
  - サーバー: 未受取の件数・合計を10レベル周期の計算で一瞬で出す / 一覧は最新30レベルだけ返す / 受取済みは `{"upto": N, "extra": [...]}` の形で保存(旧形式のリストもそのまま読める)
  - `users.battlepass_xp` を `INTEGER` → `BIGINT` に(約21億XPで溢れないように。起動時に自動で変更される)
- 🎰 **ガチャ排出率**: 通常 1スキン0.4%(合計3.2%) / ハロウィン 1スキン0.5%(合計3.0%)。変えたいときは `backend/app.py` と `backend/halloween.py` の `GACHA_RATE_PER_SKIN` だけ
- 🏆 ランキング画面の「自動更新(5秒ごと)」表記を削除
- 🕹 **ミニゲームの軽量化**: 遊んでいる間は裏のロビー・ハロウィン背景の描画/アニメ/定期処理を止める(`body.mg-open`)。スネーク・フライトの絵文字や背景は事前描画。おばけたたきはレイアウトを動かさない作りに

## 📋 Discordに届くご要望・不具合
本文は2通りの形で届きます。
- 💻 PC用: コードブロック(```)。右上のコピーボタンでコピー(```でのコピーはPCのみ)
- 📱 スマホ用: 1行ごとに「`」1個で囲んだ形。タップしてコピー

## 🎨 アイコン
`frontend/icons/` に、`icons/README.md` の表の名前で画像を置いて push するだけです。

## 以前の更新(v2.1.0)

- 🎰 ガチャに **10連**(`POST /api/gacha/pull` に `{"count":10}`)。無料チケットを先に消費し、不足分をコインで支払う。10回ぶんを払えないときは実行されない。天井・被り還元は1回ずつ通常どおり判定
- 🎁 バトルパスに **まとめて受け取る**(`POST /api/battlepass/claim-all`)
- 🛠 DBを Supabase に。接続切れの自動リトライ、全テーブルのRLS有効化、ガチャ/一括受取は `FOR UPDATE` で二重消費防止
- 🌐 フロントを GitHub Pages 用に(バックエンドURLは `frontend/config.js`)
- 💤 スリープ対策(下記)

---

## 1. Supabase

1. Supabase でプロジェクトを作成
2. **Project Settings → Database → Connection string** から **Session pooler**(または Transaction pooler)の文字列をコピー
   - ⚠️ *Direct connection* は IPv6 専用で、Renderの無料枠(IPv4)からは繋がりません
   - パスワードに `@` `/` などの記号がある場合は URL エンコード
3. テーブルはバックエンド初回起動時に自動作成されます(`init_db`)。同時に全テーブルの **RLS を有効化**するので、anon キー経由では読めません

### 既存データ(Render Postgres)を移す場合

バックエンドを Supabase 向けに起動する**前**に実行:

```bash
pg_dump "旧DBのExternal URL" --no-owner --no-privileges --schema=public -f dump.sql
psql "SupabaseのSession pooler URL" -f dump.sql
```

その後バックエンドを起動すれば、足りない列の追加とRLS有効化が自動で行われます。

## 2. Render(バックエンド)

`render.yaml` で作成、または手動で Web Service(Root Directory: `backend`)。
Start Command は `gunicorn -w 1 --threads 8 --timeout 120 --keep-alive 30 -b 0.0.0.0:$PORT app:app`(ワーカーは1のまま。増やすと定期ジョブが二重に動きます)。Renderのダッシュボードで Start Command を手入力している場合は、`render.yaml` ではなくダッシュボード側を書き換えてください。

環境変数:

| 名前 | 内容 |
|---|---|
| `DATABASE_URL` | Supabase の接続文字列 |
| `JWT_SECRET` | 今と同じ値(ログイン維持のため) |
| `ALLOWED_ORIGINS` | `https://ユーザー名.github.io`(未設定なら全許可) |
| `DISCORD_WEBHOOK_*` | 4種類(AUTH / LOGIN / FEATURE_REQUEST / BUG_REPORT) |

⚠️ 以前の `app.py` にはDiscord Webhook URLが直書きされていました(今回削除)。GitHubに上がっていたなら、Discord側でWebhookを**作り直して**環境変数に設定してください。

## 3. GitHub Pages(フロントエンド)

1. リポジトリを push
2. **Settings → Pages → Source を「GitHub Actions」** に変更
3. `main` に push すると `frontend/` が公開されます(`https://ユーザー名.github.io/リポジトリ名/`)
4. バックエンドのURLが `https://pinkyburst.onrender.com` 以外なら `frontend/config.js` を書き換え
5. `frontend/bgm/` に mp3 を戻す(ファイル名は `script.js` の `MUSIC_LIBRARY` と同じ)

## 4. スリープ対策

| 対策 | 内容 |
|---|---|
| サーバー自己ping | Renderが設定する `RENDER_EXTERNAL_URL` に10分ごとアクセス(`/healthz`) |
| GitHub Actions | `keepalive.yml` が10分ごとに `/healthz?db=1` を叩く。起きていない場合は起こす役も |
| ページを開いた時 | フロントが即座に `/healthz` を叩き、開いている間も4分ごとに実行 |
| Supabase | サーバーが毎分DBへ問い合わせるため、無料枠の「1週間無アクセスで停止」を回避 |
| 画面スリープ | Screen Wake Lock API で端末の画面が消えないように(対応ブラウザのみ) |

注意:
- サーバー自身のpingは、**寝てしまった後は自分を起こせません**。起こす役は GitHub Actions / ページ表示が担います
- GitHub のスケジュール実行は数分遅れることがあり、**60日間リポジトリに動きがないと自動停止**されます。確実にしたいなら [UptimeRobot](https://uptimerobot.com) や [cron-job.org](https://cron-job.org) で `https://（サーバーURL）/healthz` を5分おきに監視するのが安心です
- Renderの無料枠には月の稼働時間の上限があります。1サービスを24時間動かす分には収まる想定ですが、他のサービスも無料枠で動かすなら確認してください
- 画面スリープ防止は、開いている間バッテリーを多めに使います

## ローカル開発

```bash
cd backend
python3 -m venv venv && source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # 値を編集して export するか、環境変数で渡す
python app.py
# 別ターミナルで
cd ../frontend && python3 -m http.server 8000
```
(ローカルで試すときは `frontend/config.js` の URL を `http://localhost:3000` に)

# -*- coding: utf-8 -*-
"""
🏷 称号
  GET  /api/titles               称号の一覧(獲得済み/未獲得・進み具合)と、いま付けている称号
  POST /api/titles/equip {id}    称号を付ける(id が null なら外す)

* 条件を満たした称号は users.titles(JSONB)に保存され、あとで条件を下回っても(例: コインを使っても)消えない。
* 付けている称号は users.equipped_title。ランキング・チャット・フレンド・プロフィールに名前と並んで出る。
* rarity='admin' の称号は管理者アカウントだけが持てる(サーバーが判定。他の人は付けられない)。
* v4.3: 管理者アカウントは「すべての称号」を自動で獲得する(条件なし)。管理者専用の称号は、他の人の一覧にも、
  管理者の名前の横(ランキング・チャット・フレンド・プロフィール)にも出ない(HIDE_ADMIN_TITLES_FROM_OTHERS)。
* 称号を足すときは TITLES に1行足すだけ。kind と need で条件を決める:
    score   全モードのベストスコアの最大値      coins    所持コイン(獲得した瞬間の値)
    play    プレイ時間(秒)                      bp       バトルパスのレベル
    pulls   ガチャを引いた回数                  skins    持っているスキンの数
    friends フレンドの人数                      votes    投票に参加した回数
    candy   ハロウィンのキャンディ累計           days     登録してからの日数
    streak  毎日ログインボーナスの最長連続日数   dex      おばけ図鑑に登録した数
    stamps  スタンプラリーのスタンプ数           tot      トリック・オア・トリートを開けた回数
    harvest かぼちゃを収穫した数                 ghost    さまようおばけをつかまえた数
    plays   遊んだ回数(全モード合計)             playstreak  連続して遊んだ日数の最長
    minis   遊んだミニゲームの種類               ach         獲得した実績の数            perfects  満点(★5)の回数
    always  ログインしていれば獲得(need は使わない)
    admin   管理者専用(条件では手に入らない)
"""
import json
from datetime import datetime

import season

# True: 管理者専用の称号は、管理者本人の画面以外には出さない(他の人の一覧にも、管理者の名前の横にも出ない)
HIDE_ADMIN_TITLES_FROM_OTHERS = True

from flask import request, jsonify

RARITY_ORDER = ['common', 'rare', 'epic', 'legendary', 'admin']

# id, 名前, 説明, レアリティ, 条件の種類, 必要な数
TITLES = [
    # --- はじめの一歩 ---
    ('newcomer',    '🌱 駆け出しブラスター',   'アカウントを作った',                     'common',    'always',  0),
    ('regular',     '🍬 キャンディ常連',       '登録してから7日たった',                   'common',    'days',    7),
    ('veteran',     '🏛 古参の守り人',         '登録してから60日たった',                  'rare',      'days',    60),
    # --- スコア ---
    ('score_1k',    '✨ ひよっこ爆破師',       'ベストスコア 1,000 点',                   'common',    'score',   1000),
    ('score_10k',   '💥 爆破の見習い',         'ベストスコア 10,000 点',                  'common',    'score',   10000),
    ('score_50k',   '🔥 連鎖の職人',           'ベストスコア 50,000 点',                  'rare',      'score',   50000),
    ('score_200k',  '⚡ 閃光のコンボ使い',     'ベストスコア 200,000 点',                 'epic',      'score',   200000),
    ('score_1m',    '🌠 百万の流星',           'ベストスコア 1,000,000 点',               'legendary', 'score',   1000000),
    # --- コイン ---
    ('coin_10k',    '🪙 小金持ち',             'コインを 10,000 枚もった',                'common',    'coins',   10000),
    ('coin_100k',   '💰 コイン長者',           'コインを 100,000 枚もった',               'rare',      'coins',   100000),
    ('coin_1m',     '🏦 黄金の大富豪',         'コインを 1,000,000 枚もった',             'epic',      'coins',   1000000),
    # --- プレイ時間 ---
    ('play_1h',     '⏳ ひと休みの旅人',       'プレイ時間 1 時間',                       'common',    'play',    3600),
    ('play_10h',    '🕰 時を忘れた人',         'プレイ時間 10 時間',                      'rare',      'play',    36000),
    ('play_50h',    '🌙 夜更かしの王',         'プレイ時間 50 時間',                      'epic',      'play',    180000),
    # --- バトルパス ---
    ('bp_10',       '🎫 パスの挑戦者',         'バトルパス Lv.10',                        'common',    'bp',      10),
    ('bp_50',       '🎖 パスの猛者',           'バトルパス Lv.50',                        'rare',      'bp',      50),
    ('bp_100',      '🏅 パスの覇者',           'バトルパス Lv.100',                       'epic',      'bp',      100),
    ('bp_250',      '🏔 雪嶺の探求者',         'ウィンターパス Lv.250',                   'epic',      'bp',      250),
    ('bp_500',      '🌌 氷原の支配者',         'ウィンターパス Lv.500',                   'legendary', 'bp',      500),
    ('bp_1000',     '🥶 絶対零度の覇者',       'ウィンターパス Lv.1000(1000レベル限定)',   'legendary', 'bp',      1000),
    # --- ガチャ・スキン ---
    ('pull_10',     '🎰 ガチャ初心者',         'ガチャを 10 回引いた',                    'common',    'pulls',   10),
    ('pull_100',    '🎲 ガチャの申し子',       'ガチャを 100 回引いた',                   'rare',      'pulls',   100),
    ('pull_500',    '🌀 沼の住人',             'ガチャを 500 回引いた',                   'epic',      'pulls',   500),
    ('skins_5',     '👕 おしゃれさん',         'スキンを 5 種類もった',                   'common',    'skins',   5),
    ('skins_15',    '🎨 スキンコレクター',     'スキンを 15 種類もった',                  'rare',      'skins',   15),
    ('skins_30',    '👑 衣装部屋の主',         'スキンを 30 種類もった',                  'epic',      'skins',   30),
    # --- みんなと ---
    ('friend_1',    '🤝 はじめての友',         'フレンドが 1 人できた',                   'common',    'friends', 1),
    ('friend_5',    '🎈 人気者',               'フレンドが 5 人できた',                   'rare',      'friends', 5),
    ('friend_15',   '🌐 輪の中心',             'フレンドが 15 人できた',                  'epic',      'friends', 15),
    ('vote_1',      '🗳 声を届けた人',         '投票に 1 回参加した',                     'common',    'votes',   1),
    ('vote_10',     '📣 みんなの代弁者',       '投票に 10 回参加した',                    'rare',      'votes',   10),
    # --- ハロウィン(2026) ---
    ('hw_1k',       '🎃 カボチャ拾い',         'ハロウィンのキャンディを累計 1,000 個',    'rare',      'candy',   1000),
    ('hw_10k',      '🦇 夜宴の住人',           'ハロウィンのキャンディを累計 10,000 個',   'epic',      'candy',   10000),
    ('hw_50k',      '🕯 ハロウィンの支配者',   'ハロウィンのキャンディを累計 50,000 個',   'legendary', 'candy',   50000),
    # --- 毎日ログイン(v3.6) ---
    ('login_7',     '📆 続けるのが得意',       '毎日ログインを 7 日連続',                  'rare',      'streak',  7),
    ('login_30',    '🗓 毎日の習慣',           '毎日ログインを 30 日連続',                 'epic',      'streak',  30),
    ('login_100',   '🏯 不動の常連',           '毎日ログインを 100 日連続',                'legendary', 'streak',  100),
    # --- ハロウィンパート2(v3.6) ---
    ('hw_dex_12',   '📖 おばけ博士',           'おばけ図鑑に 12 種類登録した',             'rare',      'dex',     12),
    ('hw_dex_24',   '👑 図鑑コンプリート',     'おばけ図鑑を 24 種類すべて集めた',         'legendary', 'dex',     24),
    ('hw_stamp_9',  '🎪 スタンプ集め',         'ミニゲームのスタンプを 9 個集めた',        'rare',      'stamps',  9),
    ('hw_stamp_all', '🎠 スタンプマスター',    'ミニゲームのスタンプを全部集めた',         'epic',      'stamps',  26),
    ('hw_tot_30',   '🚪 ドアたたきの名人',     'トリック・オア・トリートを 30 回',          'rare',      'tot',     30),
    ('hw_harvest_30', '🌾 かぼちゃ農家',       'かぼちゃを 30 個収穫した',                  'rare',      'harvest', 30),
    ('hw_ghost_60', '👻 おばけ捕り名人',       'さまようおばけを 60 回つかまえた',          'epic',      'ghost',   60),
    # --- 遊んだ回数・続けた日数・実績(v4.3) ---
    ('plays_100',   '🎮 遊び慣れた人',         'ゲームを 100 回遊んだ',                   'common',    'plays',   100),
    ('plays_1000',  '🕹 ゲーム好き',           'ゲームを 1,000 回遊んだ',                 'rare',      'plays',   1000),
    ('plays_10000', '🎖 ゲームの申し子',       'ゲームを 10,000 回遊んだ',                'epic',      'plays',   10000),
    ('pstreak_3',   '🔥 三日坊主じゃない',     '3 日連続で遊んだ',                        'common',    'playstreak', 3),
    ('pstreak_7',   '☃ 雪の日も欠かさず',      '7 日連続で遊んだ',                        'rare',      'playstreak', 7),
    ('pstreak_30',  '🧊 凍てつく継続力',       '30 日連続で遊んだ',                       'epic',      'playstreak', 30),
    ('pstreak_100', '🌨 吹雪でも止まらない',   '100 日連続で遊んだ',                      'legendary', 'playstreak', 100),
    ('minis_10',    '🧭 ミニゲーム探検家',     'ミニゲームを 10 種類遊んだ',              'rare',      'minis',   10),
    ('minis_all',   '🗺 ミニゲーム制覇',       'ミニゲームを全種類遊んだ',                'epic',      'minis',   31),
    ('ach_10',      '🏆 実績ハンター',         '実績を 10 個獲得した',                    'rare',      'ach',     10),
    ('ach_30',      '🥇 実績コレクター',       '実績を 30 個獲得した',                    'epic',      'ach',     30),
    ('perfect_1',   '⭐ はじめての満点',       'ミニゲームで満点(★5)を取った',           'common',    'perfects', 1),
    ('perfect_30',  '🌟 満点の常連',           'ミニゲームで満点(★5)を 30 回取った',     'epic',      'perfects', 30),
    # --- 管理者だけの称号(条件では手に入らない) ---
    ('adm_creator',   '🌌 星海の創造主',       '世界をつくった者だけが名乗れる',           'admin',     'admin',   0),
    ('adm_weaver',    '⚜ 運命の調律者',       'ルールを紡ぎ、運命を整える',               'admin',     'admin',   0),
    ('adm_keeper',    '🕯 夜明けを灯す番人',   'みんなの夜が明けるまで、灯りを守る',       'admin',     'admin',   0),
    ('adm_sovereign', '👑 天蓋に座す者',       'すべてを見渡す、ただひとりの席',           'admin',     'admin',   0),
]
BY_ID = {t[0]: t for t in TITLES}
ADMIN_TITLE_IDS = [t[0] for t in TITLES if t[3] == 'admin']

STATS_SQL = """
SELECT u.best_scores, u.coins, u.play_time, u.battlepass_xp, u.gacha_state, u.skins, u.event_state,
       u.created_at, u.titles, u.equipped_title, u.v43,
       (SELECT COUNT(*) FROM friends f WHERE f.user_id = u.id) AS friends,
       (SELECT COUNT(*) FROM poll_votes v WHERE v.user_id = u.id) AS votes,
       (SELECT COALESCE(MAX(d.best_streak), 0) FROM daily_bonus d WHERE d.user_id = u.id) AS login_streak
FROM users u WHERE u.id = %s
"""


def _as_json(v, default):
    if v is None:
        return default
    if isinstance(v, (dict, list)):
        return v
    try:
        return json.loads(v)
    except Exception:
        return default


def gather_stats(row):
    """DBの1行 → 条件判定用の数字"""
    bs = _as_json(row.get('best_scores'), {})
    best = 0
    for v in bs.values():
        try:
            best = max(best, int(v))
        except (TypeError, ValueError):
            pass
    gs = _as_json(row.get('gacha_state'), {})
    ev = _as_json(row.get('event_state'), {})
    ca = row.get('created_at')
    days = (datetime.utcnow() - ca).days if hasattr(ca, 'year') else 0
    v43row = _as_json(row.get('v43'), {})
    st43 = v43row.get('stats') or {}
    return {
        'score': best, 'coins': int(row.get('coins') or 0), 'play': int(row.get('play_time') or 0),
        'bp': season.level_of(row.get('battlepass_xp') or 0),
        'plays': int(st43.get('plays', 0) or 0), 'playstreak': int(st43.get('bestStreak', 0) or 0),
        'minis': len(st43.get('minisPlayed') or []), 'ach': len(v43row.get('ach') or {}),
        'perfects': int(st43.get('perfects', 0) or 0),
        'pulls': int(gs.get('totalPulls', 0) or 0), 'skins': len(_as_json(row.get('skins'), [])),
        'friends': int(row.get('friends') or 0), 'votes': int(row.get('votes') or 0),
        'candy': int(ev.get('totalCandies', 0) or 0), 'days': max(0, days),
        'streak': int(row.get('login_streak') or 0),
        'dex': len(ev.get('dex') or []), 'stamps': len(ev.get('stamps') or []),
        'tot': int(ev.get('totTotal', 0) or 0), 'harvest': int(ev.get('harvestTotal', 0) or 0),
        'ghost': int(ev.get('ghostTotal', 0) or 0),
    }


def earned_now(stats, user_id, admin_id):
    out = set()
    if user_id == admin_id:
        return {t[0] for t in TITLES}                         # v4.3: 管理者は、すべての称号を自動で獲得する
    for tid, _n, _d, rar, kind, need in TITLES:
        if kind == 'always':
            out.add(tid)
        elif kind == 'admin':
            if user_id == admin_id:
                out.add(tid)
        elif stats.get(kind, 0) >= need:
            out.add(tid)
    return out


def view_of(tid, user_id, admin_id):
    """他の人の画面に出す用。使えない称号(管理者専用を管理者以外が付けている等)は None"""
    t = BY_ID.get(tid or '')
    if not t:
        return None
    if t[3] == 'admin' and (user_id != admin_id or HIDE_ADMIN_TITLES_FROM_OTHERS):
        return None                                           # 管理者専用の称号は、他の人には見せない
    return {'id': t[0], 'n': t[1], 'r': t[3]}


def register(app, db_query, require_auth, ApiError, admin_id):
    def fail(e):
        return jsonify({'error': e.message}), e.status

    def load(user_id):
        rows = db_query(STATS_SQL, [user_id])
        if not rows:
            raise ApiError('ユーザーが見つかりません', 404)
        row = rows[0]
        stats = gather_stats(row)
        owned = set(_as_json(row.get('titles'), []))
        if user_id != admin_id:
            owned -= set(ADMIN_TITLE_IDS)                    # 念のため(管理者専用は他の人に残らない)
        gained = earned_now(stats, user_id, admin_id) - owned
        if gained:
            owned |= gained
            db_query('UPDATE users SET titles = %s WHERE id = %s RETURNING id', [json.dumps(sorted(owned)), user_id])
        return row, stats, owned, sorted(gained)

    @app.get('/api/titles')
    def titles_list():
        try:
            uid = require_auth()
            row, stats, owned, gained = load(uid)
            eq = row.get('equipped_title')
            if eq not in owned:
                eq = None
            items = []
            for tid, name, desc, rar, kind, need in TITLES:
                if rar == 'admin' and uid != admin_id:
                    continue                                 # 管理者専用は、他の人の一覧には出さない
                it = {'id': tid, 'name': name, 'desc': desc, 'rarity': rar, 'owned': tid in owned}
                if kind not in ('always', 'admin') and tid not in owned:
                    it['progress'] = min(stats.get(kind, 0), need)
                    it['need'] = need
                items.append(it)
            return jsonify({'titles': items, 'equipped': eq, 'newlyUnlocked': gained})
        except ApiError as e:
            return fail(e)
        except Exception as err:
            print(f'titles error: {err}')
            return jsonify({'error': 'サーバーエラー'}), 500

    @app.post('/api/titles/equip')
    def titles_equip():
        try:
            uid = require_auth()
            tid = (request.get_json(silent=True) or {}).get('id')
            if tid is not None:
                _row, _stats, owned, _g = load(uid)
                if tid not in BY_ID or tid not in owned:
                    raise ApiError('その称号はまだ持っていません', 403)
            db_query('UPDATE users SET equipped_title = %s WHERE id = %s RETURNING id', [tid, uid])
            return jsonify({'ok': True, 'equipped': tid, 'title': view_of(tid, uid, admin_id)})
        except ApiError as e:
            return fail(e)
        except Exception as err:
            print(f'titles equip error: {err}')
            return jsonify({'error': 'サーバーエラー'}), 500

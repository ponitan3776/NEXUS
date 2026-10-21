# -*- coding: utf-8 -*-
"""
🎃 ハロウィンイベント(期間限定)

* 期間はサーバーの時計で決まる。フロントのアップデートが無くても、終了時刻になれば
  ガチャ・ロード・ミッションは自動で閉じる(終了後 GRACE の間だけ「報酬の受け取り」と「交換所」は使える)。
* 期間は環境変数で変更できる:
    HALLOWEEN_START / HALLOWEEN_END  例: 2026-10-17T00:00:00+09:00 (タイムゾーン省略時は日本時間)
    HALLOWEEN_GRACE_HOURS            終了後の猶予(時間、既定48)
* ユーザーごとの進行状況は users.event_state(JSONB)に保存。イベントIDが変わると自動でリセット。
"""
import os
import json
import time
import random
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from flask import request, jsonify

JST = ZoneInfo('Asia/Tokyo')
EVENT_ID = 'halloween2026'


def _env_dt(name, default):
    raw = os.environ.get(name)
    if raw:
        try:
            dt = datetime.fromisoformat(raw)
            return dt if dt.tzinfo else dt.replace(tzinfo=JST)
        except ValueError:
            pass
    return default


START = _env_dt('HALLOWEEN_START', datetime(2026, 10, 17, 0, 0, tzinfo=JST))
END = _env_dt('HALLOWEEN_END', datetime(2026, 11, 8, 0, 0, tzinfo=JST))
try:
    GRACE = timedelta(hours=int(os.environ.get('HALLOWEEN_GRACE_HOURS', '48')))
except ValueError:
    GRACE = timedelta(hours=48)


def now_dt():
    return datetime.now(JST)


def phase(now=None):
    """upcoming(開催前) / active(開催中) / grace(終了後の猶予) / ended(完全終了)"""
    now = now or now_dt()
    if now < START:
        return 'upcoming'
    if now < END:
        return 'active'
    if now < END + GRACE:
        return 'grace'
    return 'ended'


# ===================== ハロウィンガチャ =====================
# ★専用通貨「ハロウィンキャンディ 🍬」で引く(コインは使わない)。
#   アクティブに遊ぶ人で1日およそ500個、のんびりでも約200個たまる想定 → 1回80個なら、期間中に数十〜百数十回引ける
GACHA_COST = 80                # 1回あたりのキャンディ(10連は800)
GACHA_RATE_PER_SKIN = 0.005    # 1スキンあたりの排出率(6種で合計3.0%)
GACHA_PITY = 1000              # 天井(未所持のスキンから優先して確定)
GACHA_DUP_CANDIES = 40         # 被り: 半分が戻ってくる
GACHA_MISS_CANDIES = 8         # ハズレ: 1割が戻ってくる

GACHA_POOL = [
    'hween_pumpkinking', 'hween_vampire', 'hween_ghostparade',
    'hween_witchbrew', 'hween_blackcat', 'hween_candycorn',
]
ROAD_SKINS = {20: 'hween_moonlight', 40: 'hween_eternalnight'}
SHOP_SKINS = ['hween_spiderweb', 'hween_batswarm']
ALL_SKIN_IDS = set(GACHA_POOL) | set(ROAD_SKINS.values()) | set(SHOP_SKINS)


# ===================== ハロウィンロード(累計キャンディで進む報酬) =====================
ROAD_TIERS = 40


def road_need(tier):
    return 45 * tier + 3 * tier * tier          # 10段=750 / 20段=2100 / 40段=6600


def road_reward(tier):
    if tier in ROAD_SKINS:
        r = {'type': 'skin', 'skinId': ROAD_SKINS[tier]}
        if tier == 40:
            r['extraCoins'] = 20000
        return r
    if tier % 10 == 0:
        return {'type': 'ticket', 'amount': 5}
    if tier % 5 == 0:
        return {'type': 'ticket', 'amount': 2}
    if tier % 3 == 0:
        return {'type': 'bpxp', 'amount': 1500}
    return {'type': 'coins', 'amount': 1000 + 150 * tier}


ROAD = [{'tier': t, 'need': road_need(t), 'reward': road_reward(t)} for t in range(1, ROAD_TIERS + 1)]


# ===================== ミッション =====================
DAILY_POOL = [
    {'id': 'd_games3',   'stat': 'games',     'target': 3,     'candies': 35, 'text': 'ゲームを3回プレイする'},
    {'id': 'd_games6',   'stat': 'games',     'target': 6,     'candies': 55, 'text': 'ゲームを6回プレイする'},
    {'id': 'd_lines20',  'stat': 'lines',     'target': 20,    'candies': 40, 'text': 'テトリスで合計20ライン消す'},
    {'id': 'd_lines60',  'stat': 'lines',     'target': 60,    'candies': 65, 'text': 'テトリスで合計60ライン消す'},
    {'id': 'd_score5k',  'stat': 'score_max', 'target': 5000,  'candies': 40, 'text': '1ゲームで5,000点を出す'},
    {'id': 'd_score20k', 'stat': 'score_max', 'target': 20000, 'candies': 65, 'text': '1ゲームで20,000点を出す'},
    {'id': 'd_tspin1',   'stat': 'tspin',     'target': 1,     'candies': 50, 'text': 'Tスピンを1回決める'},
    {'id': 'd_tspin3',   'stat': 'tspin',     'target': 3,     'candies': 70, 'text': 'Tスピンを3回決める'},
    {'id': 'd_vs1',      'stat': 'vs_games',  'target': 1,     'candies': 40, 'text': 'テトリスでAIと1回対戦する'},
    {'id': 'd_pulls3',   'stat': 'hw_pulls',  'target': 3,     'candies': 40, 'text': 'ハロウィンガチャを3回引く'},
    {'id': 'd_duel1',    'stat': 'duels',     'target': 1,     'candies': 55, 'text': 'フレンド対決を1回プレイする'},
]
WEEKLY_POOL = [
    {'id': 'w_games30',  'stat': 'games',     'target': 30,     'candies': 210, 'text': '今週ゲームを30回プレイする'},
    {'id': 'w_lines300', 'stat': 'lines',     'target': 300,    'candies': 225, 'text': '今週テトリスで300ライン消す'},
    {'id': 'w_tspin10',  'stat': 'tspin',     'target': 10,     'candies': 240, 'text': '今週Tスピンを10回決める'},
    {'id': 'w_pc1',      'stat': 'pc',        'target': 1,      'candies': 280, 'text': '今週パーフェクトクリアを1回決める'},
    {'id': 'w_pulls20',  'stat': 'hw_pulls',  'target': 20,     'candies': 210, 'text': '今週ハロウィンガチャを20回引く'},
    {'id': 'w_score60k', 'stat': 'score_max', 'target': 60000,  'candies': 250, 'text': '今週1ゲームで60,000点を出す'},
    {'id': 'w_vs5',      'stat': 'vs_games',  'target': 5,      'candies': 195, 'text': '今週テトリスでAIと5回対戦する'},
]


def _today():
    return now_dt().strftime('%Y-%m-%d')


def _week_key():
    y, w, _ = now_dt().isocalendar()
    return f'{y}-W{w:02d}'


def pick_missions(pool, key, n):
    return random.Random(f'{EVENT_ID}:{key}').sample(pool, n)


def daily_missions(date=None):
    return pick_missions(DAILY_POOL, date or _today(), 3)


def weekly_missions(week=None):
    return pick_missions(WEEKLY_POOL, week or _week_key(), 3)


# ===================== 交換所 =====================
SHOP = [
    {'id': 'coins', 'name': '🪙 5,000コイン', 'desc': 'すぐ使えるコイン', 'cost': 60, 'limit': 20,
     'give': {'type': 'coins', 'amount': 5000}},
    {'id': 'bpxp', 'name': '🎫 バトルパスXP +3,000', 'desc': 'バトルパスが一気に進む', 'cost': 70, 'limit': 10,
     'give': {'type': 'bpxp', 'amount': 3000}},
    {'id': 'hween_spiderweb', 'name': '🕸 スパイダーウェブ(スキン)', 'desc': '交換所限定スキン', 'cost': 2000, 'limit': 1,
     'give': {'type': 'skin', 'skinId': 'hween_spiderweb'}},
    {'id': 'hween_batswarm', 'name': '🦇 バットスウォーム(スキン)', 'desc': '交換所限定スキン', 'cost': 3500, 'limit': 1,
     'give': {'type': 'skin', 'skinId': 'hween_batswarm'}},
]
SHOP_BY_ID = {s['id']: s for s in SHOP}

# ログインボーナス(7日サイクル)
LOGIN_CYCLE = 7


def login_reward(day):
    r = {'candies': 20 + 10 * day, 'coins': 500 * day, 'tickets': 0}
    if day == LOGIN_CYCLE:
        r['tickets'] = 1
    return r


# ===================== 状態の読み書き =====================
def norm_state(st):
    """イベントIDが違えば初期化し、日替わり・週替わりの進捗を必要に応じてリセットする"""
    if not isinstance(st, dict) or st.get('id') != EVENT_ID:
        st = {'id': EVENT_ID}
    st.setdefault('candies', 0)
    st.setdefault('totalCandies', 0)
    st.setdefault('tickets', 0)
    st.setdefault('claimedRoad', [])
    st.setdefault('pity', 0)
    st.setdefault('pulls', 0)
    st.setdefault('shopBought', {})
    st.setdefault('streak', 0)
    st.setdefault('lastLogin', None)
    st.setdefault('lastReport', 0)
    today, wk = _today(), _week_key()
    if not isinstance(st.get('daily'), dict) or st['daily'].get('date') != today:
        st['daily'] = {'date': today, 'stats': {}, 'claimed': []}
    if not isinstance(st.get('weekly'), dict) or st['weekly'].get('week') != wk:
        st['weekly'] = {'week': wk, 'stats': {}, 'claimed': []}
    return st


def _progress(stats, m):
    return min(m['target'], int(stats.get(m['stat'], 0) or 0))


def _mission_view(missions, bucket):
    out = []
    for m in missions:
        p = _progress(bucket['stats'], m)
        out.append({'id': m['id'], 'text': m['text'], 'target': m['target'], 'progress': p,
                    'candies': m['candies'], 'done': p >= m['target'], 'claimed': m['id'] in bucket['claimed']})
    return out


def _add_stat(bucket, stat, amount):
    if stat == 'score_max':
        bucket['stats'][stat] = max(int(bucket['stats'].get(stat, 0) or 0), int(amount))
    else:
        bucket['stats'][stat] = int(bucket['stats'].get(stat, 0) or 0) + int(amount)


def add_stat_both(st, stat, amount):
    _add_stat(st['daily'], stat, amount)
    _add_stat(st['weekly'], stat, amount)


def add_candies(st, amount):
    st['candies'] += amount
    st['totalCandies'] += amount


def candies_for_game(score, lines, tspins, pcs, duel):
    c = 6 + min(30, score // 1200) + min(12, lines // 3) + 8 * min(tspins, 3) + 20 * min(pcs, 2) + (15 if duel else 0)
    return min(c, 90)


def apply_reward(reward, state):
    """報酬を適用する。state = {'coins', 'skins', 'st', 'bpxp'} を直接書き換える。説明文を返す"""
    t = reward['type']
    if t == 'coins':
        state['coins'] += reward['amount']
        return f"🪙{reward['amount']:,}"
    if t == 'ticket':
        state['st']['tickets'] += reward['amount']
        return f"🎟×{reward['amount']}"
    if t == 'bpxp':
        state['bpxp'] += reward['amount']
        return f"🎫XP+{reward['amount']:,}"
    if t == 'skin':
        if reward['skinId'] not in state['skins']:
            state['skins'].append(reward['skinId'])
        extra = reward.get('extraCoins', 0)
        if extra:
            state['coins'] += extra
        return f"スキン({reward['skinId']})" + (f" + 🪙{extra:,}" if extra else '')
    return ''


# ===================== DB(テストで差し替えやすいよう1か所に集約) =====================
def lock_user(cur, user_id):
    cur.execute('SELECT coins, skins, event_state, battlepass_xp FROM users WHERE id = %s FOR UPDATE', [user_id])
    return cur.fetchone()


def save_user(cur, user_id, s):
    cur.execute('UPDATE users SET coins=%s, skins=%s, event_state=%s, battlepass_xp=%s WHERE id=%s',
                [s['coins'], json.dumps(s['skins']), json.dumps(s['st']), s['bpxp'], user_id])


def load_state_from_row(row):
    skins = json.loads(row.get('skins') or '["default"]')
    return {
        'coins': int(row.get('coins') or 0),
        'skins': skins,
        'st': norm_state(row.get('event_state')),
        'bpxp': int(row.get('battlepass_xp') or 0),
    }


def time_info():
    return {
        'id': EVENT_ID, 'phase': phase(),
        'startsAt': START.isoformat(), 'endsAt': END.isoformat(),
        'graceEndsAt': (END + GRACE).isoformat(), 'serverNow': now_dt().isoformat(),
    }


# ===================== ルート登録 =====================
def register(app, db_query, db_transaction, require_auth, ApiError):

    def fail(e):
        return jsonify({'error': e.message}), e.status

    def guard(fn):
        def wrapper(*a, **k):
            try:
                return fn(*a, **k)
            except ApiError as e:
                return fail(e)
            except Exception as err:
                print(f'halloween error: {err}')
                return jsonify({'error': str(err) or 'サーバーエラー'}), 500
        wrapper.__name__ = fn.__name__
        return wrapper

    def user_view(s):
        st = s['st']
        today = _today()
        yesterday = (now_dt() - timedelta(days=1)).strftime('%Y-%m-%d')
        if st['lastLogin'] == today:
            streak_day = ((st['streak'] - 1) % LOGIN_CYCLE) + 1                # 今日受け取った日
        else:
            next_streak = st['streak'] + 1 if st['lastLogin'] == yesterday else 1
            streak_day = ((next_streak - 1) % LOGIN_CYCLE) + 1                 # これから受け取る日
        total = st['totalCandies']
        return {
            **time_info(),
            'coins': s['coins'], 'ownedSkins': s['skins'],
            'candies': st['candies'], 'totalCandies': total, 'tickets': st['tickets'],
            'login': {'claimedToday': st['lastLogin'] == today, 'streak': st['streak'], 'day': streak_day,
                      'cycle': LOGIN_CYCLE, 'rewards': [login_reward(d) for d in range(1, LOGIN_CYCLE + 1)]},
            'road': [{**t, 'reached': total >= t['need'], 'claimed': t['tier'] in st['claimedRoad']} for t in ROAD],
            'daily': _mission_view(daily_missions(), st['daily']),
            'weekly': _mission_view(weekly_missions(), st['weekly']),
            'shop': [{**{k: v for k, v in it.items() if k != 'give'}, 'bought': st['shopBought'].get(it['id'], 0),
                      'give': it['give']} for it in SHOP],
            'gacha': {'cost': GACHA_COST, 'ratePerSkin': GACHA_RATE_PER_SKIN,
                      'rateTotal': round(GACHA_RATE_PER_SKIN * len(GACHA_POOL), 4), 'pool': GACHA_POOL,
                      'pity': st['pity'], 'pityThreshold': GACHA_PITY, 'pulls': st['pulls'],
                      'dupCandies': GACHA_DUP_CANDIES, 'missCandies': GACHA_MISS_CANDIES, 'currency': 'candy'},
        }

    # --- 公開: 開催状況(ログイン不要。フロントはこれを見て、イベント画面・ガチャ・UIテーマを出し分ける) ---
    @app.get('/api/event/status')
    def event_status():
        return jsonify({'halloween': time_info()})

    @app.get('/api/event/halloween/state')
    @guard
    def hw_state():
        user_id = require_auth()
        with db_transaction() as cur:
            row = lock_user(cur, user_id)
            if not row:
                raise ApiError('ユーザーが見つかりません', 404)
            s = load_state_from_row(row)
            save_user(cur, user_id, s)       # 日替わり/週替わりのリセットを保存しておく
        return jsonify(user_view(s))

    def require_phase(*allowed):
        ph = phase()
        if ph not in allowed:
            msg = 'このイベントは終了しました' if ph in ('ended',) else 'まだ開催されていません'
            raise ApiError(msg, 403)

    # --- ゲーム結果の報告 → キャンディ獲得 & ミッション進行 ---
    @app.post('/api/event/halloween/report')
    @guard
    def hw_report():
        user_id = require_auth()
        if phase() != 'active':
            return jsonify({'ok': True, 'active': False})
        b = request.get_json(silent=True) or {}

        def num(key, hi):
            try:
                return max(0, min(hi, int(b.get(key) or 0)))
            except (TypeError, ValueError):
                return 0
        score, lines, tspins, pcs = num('score', 50_000_000), num('lines', 400), num('tspins', 100), num('pcs', 20)
        is_vs, is_duel = bool(b.get('vs')), bool(b.get('duel'))
        is_tetris = bool(b.get('tetris'))
        with db_transaction() as cur:
            row = lock_user(cur, user_id)
            if not row:
                raise ApiError('ユーザーが見つかりません', 404)
            s = load_state_from_row(row)
            st = s['st']
            before = {m['id'] for m in _mission_view(daily_missions(), st['daily']) + _mission_view(weekly_missions(), st['weekly']) if m['done']}
            now_ts = time.time()
            gained = 0
            if now_ts - float(st.get('lastReport') or 0) >= 8:       # 連打対策(8秒以内の連続報告は無視)
                gained = candies_for_game(score, lines, tspins, pcs, is_duel)
                add_candies(st, gained)
                add_stat_both(st, 'games', 1)
                add_stat_both(st, 'score_max', score)
                if is_tetris:
                    add_stat_both(st, 'lines', lines)
                if tspins:
                    add_stat_both(st, 'tspin', tspins)
                if pcs:
                    add_stat_both(st, 'pc', pcs)
                if is_vs:
                    add_stat_both(st, 'vs_games', 1)
                if is_duel:
                    add_stat_both(st, 'duels', 1)
            st['lastReport'] = now_ts
            save_user(cur, user_id, s)
            after_views = _mission_view(daily_missions(), st['daily']) + _mission_view(weekly_missions(), st['weekly'])
        newly = [m['text'] for m in after_views if m['done'] and m['id'] not in before]
        return jsonify({'ok': True, 'active': True, 'gained': gained, 'candies': st['candies'],
                        'totalCandies': st['totalCandies'], 'newlyCompleted': newly})

    # --- 毎日のログインボーナス(トリック・オア・トリート) ---
    @app.post('/api/event/halloween/login-bonus')
    @guard
    def hw_login_bonus():
        user_id = require_auth()
        require_phase('active')
        with db_transaction() as cur:
            s = load_state_from_row(lock_user(cur, user_id) or {})
            st = s['st']
            today = _today()
            if st['lastLogin'] == today:
                raise ApiError('今日のボーナスは受け取り済みです', 400)
            yesterday = (now_dt() - timedelta(days=1)).strftime('%Y-%m-%d')
            st['streak'] = st['streak'] + 1 if st['lastLogin'] == yesterday else 1
            st['lastLogin'] = today
            day = ((st['streak'] - 1) % LOGIN_CYCLE) + 1
            r = login_reward(day)
            add_candies(st, r['candies'])
            s['coins'] += r['coins']
            st['tickets'] += r['tickets']
            save_user(cur, user_id, s)
        return jsonify({'ok': True, 'day': day, 'reward': r, 'coins': s['coins'], 'candies': st['candies'],
                        'tickets': st['tickets'], 'streak': st['streak']})

    # --- ミッション報酬 ---
    @app.post('/api/event/halloween/missions/claim')
    @guard
    def hw_missions_claim():
        user_id = require_auth()
        require_phase('active', 'grace')
        b = request.get_json(silent=True) or {}
        with db_transaction() as cur:
            s = load_state_from_row(lock_user(cur, user_id) or {})
            st = s['st']
            targets = []
            for scope, missions in (('daily', daily_missions()), ('weekly', weekly_missions())):
                bucket = st[scope]
                for m in missions:
                    if m['id'] in bucket['claimed'] or _progress(bucket['stats'], m) < m['target']:
                        continue
                    if b.get('all') or (b.get('id') == m['id']):
                        targets.append((bucket, m))
            if not targets:
                raise ApiError('受け取れるミッション報酬がありません', 400)
            total = 0
            for bucket, m in targets:
                bucket['claimed'].append(m['id'])
                total += m['candies']
            add_candies(st, total)
            save_user(cur, user_id, s)
        return jsonify({'ok': True, 'claimedCount': len(targets), 'candies': total, 'total': st['candies']})

    # --- ハロウィンロード報酬 ---
    @app.post('/api/event/halloween/road/claim')
    @guard
    def hw_road_claim():
        user_id = require_auth()
        require_phase('active', 'grace')
        b = request.get_json(silent=True) or {}
        with db_transaction() as cur:
            s = load_state_from_row(lock_user(cur, user_id) or {})
            st = s['st']
            targets = [t for t in ROAD
                       if st['totalCandies'] >= t['need'] and t['tier'] not in st['claimedRoad']
                       and (b.get('all') or b.get('tier') == t['tier'])]
            if not targets:
                raise ApiError('受け取れる報酬がありません', 400)
            gained = []
            for t in targets:
                gained.append(apply_reward(t['reward'], s))
                st['claimedRoad'].append(t['tier'])
            save_user(cur, user_id, s)
        return jsonify({'ok': True, 'claimedCount': len(targets), 'gained': gained, 'coins': s['coins'],
                        'tickets': st['tickets'], 'ownedSkins': s['skins'], 'battlepassXp': s['bpxp']})

    # --- 交換所 ---
    @app.post('/api/event/halloween/shop/buy')
    @guard
    def hw_shop_buy():
        user_id = require_auth()
        require_phase('active', 'grace')
        b = request.get_json(silent=True) or {}
        item = SHOP_BY_ID.get(b.get('id'))
        if not item:
            raise ApiError('商品が見つかりません', 404)
        with db_transaction() as cur:
            s = load_state_from_row(lock_user(cur, user_id) or {})
            st = s['st']
            bought = st['shopBought'].get(item['id'], 0)
            if bought >= item['limit']:
                raise ApiError('交換上限に達しています', 400)
            if st['candies'] < item['cost']:
                raise ApiError('キャンディが足りません', 400)
            st['candies'] -= item['cost']
            st['shopBought'][item['id']] = bought + 1
            text = apply_reward(item['give'], s)
            save_user(cur, user_id, s)
        return jsonify({'ok': True, 'gained': text, 'candies': st['candies'], 'coins': s['coins'],
                        'tickets': st['tickets'], 'ownedSkins': s['skins'], 'battlepassXp': s['bpxp']})

    # --- ハロウィンガチャ(期間限定。終了時刻を過ぎると、フロントが古いままでもサーバーが拒否する) ---
    @app.post('/api/event/halloween/gacha/pull')
    @guard
    def hw_gacha_pull():
        user_id = require_auth()
        b = request.get_json(silent=True) or {}
        try:
            count = int(b.get('count') or 1)
        except (TypeError, ValueError):
            count = 0
        if count not in (1, 10):
            raise ApiError('回数が不正です', 400)
        with db_transaction() as cur:
            if phase() != 'active':
                raise ApiError('ハロウィンガチャの開催は終了しました', 403)
            s = load_state_from_row(lock_user(cur, user_id) or {})
            st = s['st']
            tickets_used = min(st['tickets'], count)
            candies_needed = (count - tickets_used) * GACHA_COST
            if st['candies'] < candies_needed:
                raise ApiError('キャンディが足りません', 400)
            st['candies'] -= candies_needed      # ※消費しても、ロードの進行(累計 totalCandies)は減らない
            st['tickets'] -= tickets_used
            results = []
            for i in range(count):
                st['pity'] += 1
                st['pulls'] += 1
                roll = random.random()
                natural = roll < GACHA_RATE_PER_SKIN * len(GACHA_POOL)
                pity_win = (not natural) and st['pity'] >= GACHA_PITY
                r = {'usedTicket': i < tickets_used, 'pityTriggered': False, 'skinId': None,
                     'coinsGained': 0, 'candiesGained': 0}
                if natural or pity_win:
                    unowned = [x for x in GACHA_POOL if x not in s['skins']]
                    sid = random.choice(unowned) if (pity_win and unowned) else random.choice(GACHA_POOL)
                    st['pity'] = 0
                    r['skinId'], r['pityTriggered'] = sid, pity_win
                    if sid in s['skins']:
                        r.update(resultType='duplicate', candiesGained=GACHA_DUP_CANDIES)
                    else:
                        s['skins'].append(sid)
                        r['resultType'] = 'win'
                else:
                    r.update(resultType='miss', candiesGained=GACHA_MISS_CANDIES)
                add_candies(st, r['candiesGained'])
                results.append(r)
            add_stat_both(st, 'hw_pulls', count)
            save_user(cur, user_id, s)
        return jsonify({'ok': True, 'count': count, 'results': results, 'spentCandies': candies_needed,
                        'ticketsUsed': tickets_used, 'coins': s['coins'], 'candies': st['candies'],
                        'tickets': st['tickets'], 'ownedSkins': s['skins'],
                        'pity': st['pity'], 'pityThreshold': GACHA_PITY, 'pulls': st['pulls']})

    # --- キャンディランキング ---
    @app.get('/api/event/halloween/ranking')
    @guard
    def hw_ranking():
        user_id = require_auth()
        rows = db_query(
            "SELECT id, (event_state->>'totalCandies')::bigint AS total FROM users "
            "WHERE event_state->>'id' = %s AND COALESCE((event_state->>'totalCandies')::bigint, 0) > 0 "
            "ORDER BY total DESC, id ASC LIMIT 20", [EVENT_ID])
        mine = db_query("SELECT (event_state->>'totalCandies')::bigint AS total FROM users "
                        "WHERE id = %s AND event_state->>'id' = %s", [user_id, EVENT_ID])
        my_total = int((mine[0]['total'] if mine else 0) or 0)
        my_rank = None
        if my_total > 0:
            r = db_query("SELECT COUNT(*) AS n FROM users WHERE event_state->>'id' = %s "
                         "AND (event_state->>'totalCandies')::bigint > %s", [EVENT_ID, my_total])
            my_rank = int(r[0]['n']) + 1
        return jsonify({'ranking': [{'id': r['id'], 'total': int(r['total'])} for r in rows],
                        'me': {'id': user_id, 'total': my_total, 'rank': my_rank}})

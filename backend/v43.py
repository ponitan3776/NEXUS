# -*- coding: utf-8 -*-
"""
🆕 v4.3 プロフィール・統計・実績・クラウド保存・演出の選択
  POST /api/v43/event     {game, kind, score, rating, ai}   1回遊んだ結果を記録(統計・連続日数・実績の判定)
  GET  /api/v43/profile                                     プロフィール(レベル・称号・統計・連続・実績・解放した演出)
  GET  /api/v43/collection                                  コレクション(スキン・称号・演出のid一覧)
  POST /api/v43/select    {kind, id}                        勝利演出 / レベルアップ演出 / テーマ を選ぶ(解放済みだけ)
  GET  /api/v43/save                                        クラウド保存(お気に入り・評価・履歴・設定など)を読む
  POST /api/v43/save      {data, rev}                       クラウド保存に書く(古い版は自動でバックアップに回る・最新3世代)
  POST /api/v43/save/restore {index}                        バックアップから戻す

* 保存先は users.v43(JSONB)1列だけ: { stats, ach, sel, save, rev, backups }
* 数の上限はない(統計の合計スコアなども Python の int なので桁数の制限なし)
"""
import json
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from flask import request, jsonify

import season

JST = ZoneInfo('Asia/Tokyo')
SAVE_MAX_BYTES = 200_000
BACKUPS_KEEP = 3
HISTORY_KEEP = 40
KINDS = {'victory': ('v_classic', season.VICTORY_FX), 'levelup': ('lu_default', season.LEVELUP_FX),
         'theme': ('theme:normal', season.THEMES)}

# 実績: id, 名前, 説明, アイコン, 種類(stat), 必要数, 隠し?, 報酬(コイン, XP)
# 隠し実績は、獲得するまで名前も条件も「？？？」で表示される
ACHIEVEMENTS = [
    ('first_play',   'はじめの一歩',       'ゲームを 1 回遊ぶ',                 '👣', 'plays', 1,      False, (100, 100)),
    ('plays_50',     '遊び始めの人',       'ゲームを 50 回遊ぶ',                '🎮', 'plays', 50,     False, (500, 500)),
    ('plays_300',    'ゲームの虜',         'ゲームを 300 回遊ぶ',               '🕹', 'plays', 300,    False, (2000, 2000)),
    ('plays_2000',   '遊びの達人',         'ゲームを 2,000 回遊ぶ',             '🎖', 'plays', 2000,   False, (10000, 8000)),
    ('mini_3',       'ミニゲームデビュー', 'ミニゲームを 3 種類遊ぶ',           '🎲', 'minis', 3,      False, (300, 300)),
    ('mini_10',      'ミニゲーム探検家',   'ミニゲームを 10 種類遊ぶ',          '🧭', 'minis', 10,     False, (1500, 1500)),
    ('mini_20',      'ミニゲーム名人',     'ミニゲームを 20 種類遊ぶ',          '🧩', 'minis', 20,     False, (5000, 4000)),
    ('mini_all',     'ミニゲーム制覇',     'ミニゲームを全種類遊ぶ',            '🗺', 'minis', 31,     False, (20000, 15000)),
    ('perfect_1',    'はじめての満点',     'ミニゲームで満点(★5)を取る',       '⭐', 'perfects', 1,   False, (500, 500)),
    ('perfect_10',   '満点クラブ',         'ミニゲームで満点を 10 回取る',      '🌟', 'perfects', 10,  False, (3000, 2500)),
    ('perfect_50',   '満点マスター',       'ミニゲームで満点を 50 回取る',      '💫', 'perfects', 50,  False, (15000, 10000)),
    ('streak_3',     '三日続いた',         '3 日連続で遊ぶ',                    '🔥', 'bestStreak', 3, False, (500, 500)),
    ('streak_7',     '一週間の習慣',       '7 日連続で遊ぶ',                    '📆', 'bestStreak', 7, False, (2000, 2000)),
    ('streak_30',    '一か月の継続',       '30 日連続で遊ぶ',                   '🗓', 'bestStreak', 30, False, (15000, 10000)),
    ('days_10',      '通い慣れた',         '合計 10 日遊ぶ',                    '🏠', 'days', 10,      False, (1000, 1000)),
    ('days_50',      '常連さん',           '合計 50 日遊ぶ',                    '🏯', 'days', 50,      False, (6000, 5000)),
    ('fav_5',        'お気に入り集め',     'お気に入りを 5 個登録する',         '💖', 'favs', 5,       False, (300, 300)),
    ('rate_5',       '評価の達人',         'ゲームを 5 個評価する',             '📝', 'rated', 5,      False, (300, 300)),
    ('titles_5',     '称号コレクター',     '称号を 5 個集める',                 '🏷', 'titlesOwned', 5, False, (800, 800)),
    ('titles_15',    '称号ハンター',       '称号を 15 個集める',                '🏅', 'titlesOwned', 15, False, (4000, 3000)),
    ('skins_5',      'おしゃれさん',       'スキンを 5 個もつ',                 '👕', 'skinsOwned', 5, False, (500, 500)),
    ('bp_10',        'パスの挑戦者',       'ウィンターパス Lv.10',              '❄', 'bpLevel', 10,   False, (500, 500)),
    ('bp_100',       '雪原を進む者',       'ウィンターパス Lv.100',             '🌨', 'bpLevel', 100, False, (8000, 0)),
    ('bp_500',       '氷原の旅人',         'ウィンターパス Lv.500',             '🏔', 'bpLevel', 500, False, (40000, 0)),
    ('bp_1000',      '絶対零度への到達',   'ウィンターパス Lv.1000',            '🥶', 'bpLevel', 1000, False, (200000, 0)),
    ('rich_1m',      '百万長者',           'コインを 1,000,000 枚もつ',         '💰', 'coins', 1_000_000, False, (0, 3000)),
    ('score_1m',     '百万点プレイヤー',   '累計スコア 1,000,000 点',           '🌠', 'totalScore', 1_000_000, False, (3000, 3000)),
    ('score_1b',     '十億点の道',         '累計スコア 1,000,000,000 点',       '☄', 'totalScore', 10 ** 9, False, (20000, 10000)),
    # --- 隠し実績 ---
    ('h_night',      '真夜中の遊び人',     '午前2時〜4時(日本時間)に遊ぶ',    '🌙', 'nightPlays', 1, True, (1000, 1000)),
    ('h_rapid',      'しつこい挑戦者',     '同じミニゲームを 1 日に 20 回遊ぶ', '🔁', 'maxSameDay', 20, True, (2000, 2000)),
    ('h_reflex',     '氷点下の指',         'ガイコツ反射神経で 180ms 以下',     '🧊', 'bestReflex', 1, True, (3000, 3000)),
    ('h_marathon',   'ひたすら一直線',     '1 日に 50 回遊ぶ',                  '🏃', 'maxDayPlays', 50, True, (3000, 3000)),
    ('h_comeback',   'おかえりなさい',     '30 日ぶりに遊ぶ',                   '👋', 'comeback', 1, True, (2000, 2000)),
    ('h_newyear',    '初雪の記念',         '12月に遊ぶ',                        '☃', 'decPlay', 1, True, (1500, 1500)),
]
ACH_BY_ID = {a[0]: a for a in ACHIEVEMENTS}


def _as_json(v, default):
    if v is None:
        return default
    if isinstance(v, (dict, list)):
        return v
    try:
        return json.loads(v)
    except Exception:
        return default


def today_key(now=None):
    return (now or datetime.now(JST)).strftime('%Y-%m-%d')


def update_stats(stats, ev, now=None):
    """1回の結果を統計に反映する(メモリ上の dict を書き換える)。ev = {game, kind, score, rating}"""
    now = now or datetime.now(JST)
    day = today_key(now)
    stats['plays'] = int(stats.get('plays', 0)) + 1
    game, kind = str(ev.get('game') or '')[:40], ev.get('kind') or 'mini'
    by = stats.setdefault('byGame', {})
    by[game] = int(by.get(game, 0)) + 1
    if len(by) > 120:                                       # 念のため(増えすぎ防止)
        for k in list(by)[:20]:
            by.pop(k, None)
    if kind == 'mini':
        mp = set(stats.get('minisPlayed') or [])
        mp.add(game)
        stats['minisPlayed'] = sorted(mp)[:200]
        if int(ev.get('rating') or 0) >= 100:
            stats['perfects'] = int(stats.get('perfects', 0)) + 1
        if game == 'reflex' and ev.get('score') is not None:
            try:
                sc = int(ev['score'])
                if 0 < sc <= 180:
                    stats['bestReflex'] = 1
            except (TypeError, ValueError):
                pass
    try:
        stats['totalScore'] = int(stats.get('totalScore', 0)) + max(0, min(season.BIG_MAX, int(ev.get('score') or 0)))
    except (TypeError, ValueError, OverflowError):
        pass
    # 連続日数
    last = stats.get('lastDay')
    if last != day:
        gap = None
        if last:
            try:
                gap = (datetime.strptime(day, '%Y-%m-%d') - datetime.strptime(last, '%Y-%m-%d')).days
            except ValueError:
                gap = None
        if gap == 1:
            stats['streak'] = int(stats.get('streak', 0)) + 1
        else:
            stats['streak'] = 1
        if gap is not None and gap >= 30:
            stats['comeback'] = 1
        stats['days'] = int(stats.get('days', 0)) + 1
        stats['lastDay'] = day
        stats['todayPlays'] = 0
        stats['todayByGame'] = {}
    stats['bestStreak'] = max(int(stats.get('bestStreak', 0)), int(stats.get('streak', 0)))
    stats['todayPlays'] = int(stats.get('todayPlays', 0)) + 1
    tg = stats.setdefault('todayByGame', {})
    tg[game] = int(tg.get(game, 0)) + 1
    stats['maxDayPlays'] = max(int(stats.get('maxDayPlays', 0)), stats['todayPlays'])
    stats['maxSameDay'] = max(int(stats.get('maxSameDay', 0)), tg[game])
    if 2 <= now.hour < 4:
        stats['nightPlays'] = int(stats.get('nightPlays', 0)) + 1
    if now.month == 12:
        stats['decPlay'] = 1
    return stats


def evaluate(stats, ctx):
    """獲得済みになる実績のid集合。ctx = 統計以外の数字(coins, bpLevel, titlesOwned, skinsOwned, favs, rated)"""
    merged = dict(stats)
    merged['minis'] = len(stats.get('minisPlayed') or [])
    merged.update(ctx or {})
    out = set()
    for aid, _n, _d, _i, kind, need, _h, _r in ACHIEVEMENTS:
        if int(merged.get(kind, 0) or 0) >= need:
            out.add(aid)
    return out


def ach_view(aid, unlocked_at=None):
    a = ACH_BY_ID[aid]
    return {'id': aid, 'name': a[1], 'desc': a[2], 'icon': a[3], 'hidden': a[6],
            'reward': {'coins': a[7][0], 'xp': a[7][1]}, 'at': unlocked_at}


def unlocked_cosmetics(row, is_admin):
    """使える演出・テーマ(無料 + バトルパス等で解放したもの)。管理者は全部"""
    if is_admin:
        allc = set(season.FREE_COSMETICS) | set(season.VICTORY_FX) | set(season.LEVELUP_FX) | {'theme:' + k for k in season.THEMES}
        return sorted(allc)
    got = set(season.FREE_COSMETICS) | set(_as_json(row.get('unlocks'), []))
    return sorted(got)


def register(app, db_query, db_transaction, require_auth, ApiError, admin_id, bp_level_of=None, get_user_id_optional=None):
    bp_level_of = bp_level_of or season.level_of

    def fail(e):
        return jsonify({'error': e.message}), e.status

    def guard(fn):
        def wrapper(*a, **k):
            try:
                return fn(*a, **k)
            except ApiError as e:
                return fail(e)
            except ValueError as e:
                return jsonify({'error': str(e)}), 400
            except Exception as err:
                print(f'v43 error ({fn.__name__}): {err}')
                return jsonify({'error': 'サーバーエラー'}), 500
        wrapper.__name__ = fn.__name__
        return wrapper

    def ctx_of(row, v):
        sv = v.get('save') or {}
        return {'coins': int(row.get('coins') or 0), 'bpLevel': bp_level_of(row.get('battlepass_xp')),
                'titlesOwned': len(_as_json(row.get('titles'), [])), 'skinsOwned': len(_as_json(row.get('skins'), [])),
                'favs': len(sv.get('favs') or []), 'rated': len(sv.get('ratings') or {})}

    def grant_new(cur, user_id, row, v, new_ids):
        """新しい実績を v に記録し、報酬(コイン・XP)を付ける。通知用の一覧を返す"""
        out = []
        coins = xp = 0
        now = datetime.now(JST).isoformat()
        ach = v.setdefault('ach', {})
        for aid in new_ids:
            if aid in ach:
                continue
            ach[aid] = now
            a = ACH_BY_ID[aid]
            coins += a[7][0]
            xp += a[7][1]
            out.append(ach_view(aid, now))
        if coins or xp:
            cur.execute('UPDATE users SET coins = COALESCE(coins,0) + %s, battlepass_xp = COALESCE(battlepass_xp,0) + %s WHERE id = %s',
                        [coins, xp, user_id])
        return out, coins, xp

    def load_locked(cur, user_id):
        cur.execute('SELECT coins, battlepass_xp, titles, skins, unlocks, v43 FROM users WHERE id = %s FOR UPDATE', [user_id])
        row = cur.fetchone()
        if not row:
            raise ApiError('ユーザーが見つかりません', 404)
        return row, _as_json(row.get('v43'), {})

    @app.post('/api/v43/event')
    @guard
    def v43_event():
        uid = require_auth()
        b = request.get_json(silent=True) or {}
        ev = {'game': b.get('game'), 'kind': 'mini' if b.get('kind') == 'mini' else 'main',
              'score': b.get('score'), 'rating': b.get('rating')}
        try:
            ev['score'] = season.parse_big(ev['score'])
        except ValueError:
            ev['score'] = 0
        try:
            ev['rating'] = max(0, min(100, int(ev['rating'] or 0)))
        except (TypeError, ValueError):
            ev['rating'] = 0
        with db_transaction() as cur:
            row, v = load_locked(cur, uid)
            stats = v.setdefault('stats', {})
            update_stats(stats, ev)
            hist = v.setdefault('history', [])
            hist.insert(0, {'g': ev['game'], 'k': ev['kind'], 's': str(ev['score']), 'r': ev['rating'],
                            't': datetime.now(JST).isoformat(timespec='seconds'), 'ai': bool(b.get('ai'))})
            del hist[HISTORY_KEEP:]
            got = evaluate(stats, ctx_of(row, v)) - set((v.get('ach') or {}).keys())
            new_list, coins, xp = grant_new(cur, uid, row, v, sorted(got))
            cur.execute('UPDATE users SET v43 = %s WHERE id = %s', [json.dumps(v), uid])
        return jsonify({'ok': True, 'newAch': new_list, 'bonusCoins': coins, 'bonusXp': xp,
                        'streak': stats.get('streak', 0), 'bestStreak': stats.get('bestStreak', 0), 'plays': stats.get('plays', 0)})

    @app.get('/api/v43/profile')
    @guard
    def v43_profile():
        uid = require_auth()
        rows = db_query('SELECT id, display_name, icon, coins, best_score, play_time, created_at, battlepass_xp, titles, '
                        'equipped_title, skins, unlocks, v43 FROM users WHERE id = %s', [uid])
        if not rows:
            raise ApiError('ユーザーが見つかりません', 404)
        row = rows[0]
        v = _as_json(row.get('v43'), {})
        stats = v.get('stats') or {}
        is_admin = uid == admin_id
        lv, into, need = season.progress_of(row.get('battlepass_xp') or 0)
        # 実績の判定(統計以外の数字が変わっただけで解除される実績もあるので、開いたときにも確かめる)
        got = evaluate(stats, ctx_of(row, v)) - set((v.get('ach') or {}).keys())
        new_list = []
        if got:
            with db_transaction() as cur:
                row2, v = load_locked(cur, uid)
                stats = v.get('stats') or {}
                got = evaluate(stats, ctx_of(row2, v)) - set((v.get('ach') or {}).keys())
                new_list, _c, _x = grant_new(cur, uid, row2, v, sorted(got))
                cur.execute('UPDATE users SET v43 = %s WHERE id = %s', [json.dumps(v), uid])
        ach = v.get('ach') or {}
        achs = []
        for a in ACHIEVEMENTS:
            have = a[0] in ach
            if a[6] and not have:                          # 隠し実績: 獲得するまで中身は出さない
                achs.append({'id': a[0], 'hidden': True, 'name': '？？？', 'desc': '隠し実績(条件は秘密)', 'icon': '❓',
                             'have': False, 'reward': None})
            else:
                it = ach_view(a[0], ach.get(a[0]))
                it['have'] = have
                if not have:
                    cur_val = _progress_value(a[4], stats, ctx_of(row, v))
                    it['progress'] = min(cur_val, a[5])
                    it['need'] = a[5]
                achs.append(it)
        sel = v.get('sel') or {}
        return jsonify({
            'id': row['id'], 'name': row.get('display_name') or row['id'], 'icon': row.get('icon') or '',
            'level': lv, 'xpIntoLevel': into, 'xpPerLevel': need,
            'coins': int(row.get('coins') or 0), 'bestScore': int(row.get('best_score') or 0),
            'playTime': int(row.get('play_time') or 0),
            'joinedAt': row['created_at'].isoformat() if row.get('created_at') else None,
            'equippedTitle': row.get('equipped_title'),
            'stats': {'plays': stats.get('plays', 0), 'days': stats.get('days', 0), 'streak': _live_streak(stats),
                      'bestStreak': stats.get('bestStreak', 0), 'perfects': stats.get('perfects', 0),
                      'minisPlayed': len(stats.get('minisPlayed') or []), 'totalScore': stats.get('totalScore', 0),
                      'byGame': stats.get('byGame') or {}, 'todayPlays': stats.get('todayPlays', 0) if stats.get('lastDay') == today_key() else 0},
            'history': v.get('history') or [],
            'achievements': achs, 'achCount': len(ach), 'achTotal': len(ACHIEVEMENTS), 'newAch': new_list,
            'selected': {k: sel.get(k, KINDS[k][0]) for k in KINDS},
            'unlocked': unlocked_cosmetics(row, is_admin),
            'isAdmin': is_admin,
        })

    def _live_streak(stats):
        """連続日数。昨日までに途切れていたら 0 と表示する(次に遊ぶまでは更新されないため)"""
        last = stats.get('lastDay')
        if not last:
            return 0
        try:
            gap = (datetime.strptime(today_key(), '%Y-%m-%d') - datetime.strptime(last, '%Y-%m-%d')).days
        except ValueError:
            return 0
        return int(stats.get('streak', 0)) if gap <= 1 else 0

    def _progress_value(kind, stats, ctx):
        m = dict(stats)
        m['minis'] = len(stats.get('minisPlayed') or [])
        m.update(ctx or {})
        try:
            return int(m.get(kind, 0) or 0)
        except (TypeError, ValueError):
            return 0

    @app.get('/api/v43/collection')
    @guard
    def v43_collection():
        uid = require_auth()
        rows = db_query('SELECT skins, titles, unlocks, equipped_skin, equipped_title FROM users WHERE id = %s', [uid])
        if not rows:
            raise ApiError('ユーザーが見つかりません', 404)
        row = rows[0]
        is_admin = uid == admin_id
        cat = {'victory': [{'id': k, 'name': n} for k, n in season.VICTORY_FX.items()],
               'levelup': [{'id': k, 'name': n} for k, n in season.LEVELUP_FX.items()],
               'theme': [{'id': 'theme:' + k, 'name': n} for k, n in season.THEMES.items()]}
        return jsonify({'skins': _as_json(row.get('skins'), ['default']), 'titles': _as_json(row.get('titles'), []),
                        'unlocked': unlocked_cosmetics(row, is_admin), 'catalog': cat,
                        'winterSkins': {k: {'name': v[0], 'level': v[1]} for k, v in season.WINTER_SKINS.items()},
                        'equippedSkin': row.get('equipped_skin'), 'equippedTitle': row.get('equipped_title')})

    @app.post('/api/v43/select')
    @guard
    def v43_select():
        uid = require_auth()
        b = request.get_json(silent=True) or {}
        kind, cid = b.get('kind'), str(b.get('id') or '')
        if kind not in KINDS:
            raise ApiError('種類が不明です', 400)
        if cid not in KINDS[kind][1] and cid.replace('theme:', '') not in KINDS[kind][1]:
            raise ApiError('その演出は存在しません', 400)
        with db_transaction() as cur:
            row, v = load_locked(cur, uid)
            if cid not in unlocked_cosmetics(row, uid == admin_id):
                raise ApiError('まだ解放していません(ウィンターパスで手に入ります)', 403)
            v.setdefault('sel', {})[kind] = cid
            cur.execute('UPDATE users SET v43 = %s WHERE id = %s', [json.dumps(v), uid])
        return jsonify({'ok': True, 'kind': kind, 'id': cid})

    # ---------- クラウド保存(お気に入り・評価・履歴・設定・チュートリアル既読 など) ----------
    @app.get('/api/v43/save')
    @guard
    def v43_save_get():
        uid = require_auth()
        rows = db_query('SELECT v43 FROM users WHERE id = %s', [uid])
        v = _as_json(rows[0].get('v43'), {}) if rows else {}
        return jsonify({'data': v.get('save') or {}, 'rev': int(v.get('rev') or 0),
                        'backups': [{'rev': b.get('rev'), 'at': b.get('at')} for b in (v.get('backups') or [])]})

    @app.post('/api/v43/save')
    @guard
    def v43_save_post():
        uid = require_auth()
        b = request.get_json(silent=True) or {}
        data = b.get('data')
        if not isinstance(data, dict):
            raise ApiError('保存する内容が正しくありません', 400)
        raw = json.dumps(data, ensure_ascii=False)
        if len(raw.encode('utf-8')) > SAVE_MAX_BYTES:
            raise ApiError('保存できる大きさを超えています', 413)
        with db_transaction() as cur:
            row, v = load_locked(cur, uid)
            old = v.get('save')
            rev = int(v.get('rev') or 0)
            if old and old != data:                         # いまの内容を、バックアップに回す(最新3世代)
                bk = v.setdefault('backups', [])
                bk.insert(0, {'rev': rev, 'at': datetime.now(JST).isoformat(timespec='seconds'), 'data': old})
                del bk[BACKUPS_KEEP:]
            if old != data:
                rev += 1
            v['save'], v['rev'] = data, rev
            cur.execute('UPDATE users SET v43 = %s WHERE id = %s', [json.dumps(v), uid])
        return jsonify({'ok': True, 'rev': rev})

    @app.post('/api/v43/save/restore')
    @guard
    def v43_save_restore():
        uid = require_auth()
        idx = (request.get_json(silent=True) or {}).get('index')
        with db_transaction() as cur:
            row, v = load_locked(cur, uid)
            bk = v.get('backups') or []
            if not isinstance(idx, int) or not (0 <= idx < len(bk)):
                raise ApiError('そのバックアップはありません', 404)
            chosen = bk[idx]
            cur_save = v.get('save')
            v['save'] = chosen.get('data') or {}
            v['rev'] = int(v.get('rev') or 0) + 1
            if cur_save:
                bk.insert(0, {'rev': v['rev'] - 1, 'at': datetime.now(JST).isoformat(timespec='seconds'), 'data': cur_save})
                del bk[BACKUPS_KEEP:]
            v['backups'] = bk
            cur.execute('UPDATE users SET v43 = %s WHERE id = %s', [json.dumps(v), uid])
        return jsonify({'ok': True, 'data': v['save'], 'rev': v['rev']})

# -*- coding: utf-8 -*-
"""
❄ ウィンターパス(v4.3.0) — バトルパスの計算と報酬表(DBにもFlaskにも依存しない、純粋なロジックだけ)

* レベルが上がるほど、次のレベルに必要なXPが増える(等差数列)
      レベル L → L+1 に必要なXP  = BASE_XP + STEP_XP × (L-1)      (1000, 1025, 1050, …)
      レベル L に着いたときの累計XP = BASE_XP×(L-1) + STEP_XP×(L-1)(L-2)/2
  レベルからXP / XPからレベルは、ループを使わない式(整数の平方根)で出す → XPが何桁でも一瞬・正確
* 報酬は「25レベルで1周する基本報酬」(コイン or チケット。100レベルごとに倍率アップ、最大10倍)
  + 「特別報酬」(1000レベルまでだけ。スキン・演出・テーマ・コインのボーナス)
  1001レベル以降は、基本報酬だけがずっと続く。「1000レベル限定」の報酬は、1000レベルまでしか手に入らない
* 数が巨大でも重くならないよう、未受取の合計は式で出す(1レベルずつ数えない)
"""
import json
from math import isqrt

SEASON_ID = 'winter2026'
SEASON_NAME = '❄ ウィンターパス 2026-27'
BASE_XP = 1000
STEP_XP = 25
CYCLE = 25                 # 基本報酬の周期(レベル数)
TIER_SIZE = 100            # 何レベルごとに報酬の倍率が上がるか
TIER_MAX_MULT = 10         # 倍率の上限
LIMITED_MAX = 1000         # 特別報酬(1000レベル限定を含む)がもらえるのは、このレベルまで
VIEW_AHEAD = 12            # 画面に出す「これから」のレベル数
VIEW_PENDING_MAX = 30      # 画面に出す「受け取れる」のレベル数(新しいほうから)

# 数字の桁数の上限(DBは NUMERIC で桁数の制限なし。JavaScript の数字が壊れない 300 桁を、実用上の上限にしている)
BIG_DIGITS = 300
BIG_MAX = 10 ** BIG_DIGITS - 1


# ===================== 巨大な数の読み取り =====================
def parse_big(v, name='数', allow_zero=True):
    """ユーザー入力(整数・数字だけの文字列・整数とみなせる小数)→ int。おかしい値は ValueError"""
    if isinstance(v, bool):
        raise ValueError(f'{name}は数字で指定してください')
    if v is None or v == '':
        return 0
    if isinstance(v, int):
        n = v
    elif isinstance(v, float):
        if v != v or v in (float('inf'), float('-inf')):
            raise ValueError(f'{name}は数字で指定してください')
        n = int(v)
    else:
        s = str(v).strip().replace(',', '').replace('_', '').replace(' ', '')
        if s.startswith('+'):
            s = s[1:]
        try:
            if s.isdigit():
                if len(s) > BIG_DIGITS + 5:
                    raise ValueError(f'{name}は {BIG_DIGITS} 桁までです')
                n = int(s)
            else:
                from decimal import Decimal, InvalidOperation
                try:
                    d = Decimal(s)
                except InvalidOperation:
                    raise ValueError(f'{name}は数字で指定してください')
                if not d.is_finite():
                    raise ValueError(f'{name}は数字で指定してください')
                if d.adjusted() > BIG_DIGITS:
                    raise ValueError(f'{name}は {BIG_DIGITS} 桁までです')
                n = int(d)
        except OverflowError:
            raise ValueError(f'{name}が大きすぎます')
    if n < 0:
        raise ValueError(f'{name}は 0 以上で指定してください')
    if n > BIG_MAX:
        raise ValueError(f'{name}は {BIG_DIGITS} 桁までです')
    if n == 0 and not allow_zero:
        raise ValueError(f'{name}は 1 以上で指定してください')
    return n


def clamp_big(v):
    """0〜BIG_MAX に収める(DBに入れる直前の保険)"""
    try:
        n = int(v)
    except (TypeError, ValueError, OverflowError):
        return 0
    return max(0, min(BIG_MAX, n))


# ===================== レベルとXP =====================
def xp_to_reach(level):
    """レベル level に着くための累計XP(レベル1は0)"""
    n = max(0, int(level) - 1)
    return BASE_XP * n + STEP_XP * n * (n - 1) // 2


def xp_for_level(level):
    """レベル level から次のレベルへ進むのに必要なXP"""
    return BASE_XP + STEP_XP * (max(1, int(level)) - 1)


def level_of(xp):
    """累計XP → レベル(整数の平方根で、何桁でも正確)"""
    xp = max(0, int(xp or 0))
    k = 2 * BASE_XP - STEP_XP
    r = isqrt(k * k + 8 * STEP_XP * xp)
    n = (r - k) // (2 * STEP_XP)           # n = レベル - 1 の見積もり(最大でも1ずれる)
    while xp_to_reach(n + 2) <= xp:
        n += 1
    while n > 0 and xp_to_reach(n + 1) > xp:
        n -= 1
    return n + 1


def progress_of(xp):
    """(レベル, そのレベルの中での進み, そのレベルに必要な量)"""
    xp = max(0, int(xp or 0))
    lv = level_of(xp)
    return lv, xp - xp_to_reach(lv), xp_for_level(lv)


# ===================== 基本報酬(25レベルで1周・100レベルごとに倍率) =====================
# 位置1〜25。チケットの位置(5の倍数)は None
_COIN_CYCLE = {1: 100, 2: 120, 3: 140, 4: 160, 6: 200, 7: 220, 8: 240, 9: 260,
               11: 300, 12: 320, 13: 340, 14: 360, 16: 400, 17: 420, 18: 440, 19: 460,
               21: 500, 22: 520, 23: 540, 24: 560}
_TICKET_CYCLE = {5: 1, 10: 1, 15: 1, 20: 1, 25: 2}
_COIN_CYCLE_SUM = sum(_COIN_CYCLE.values())
_TICKET_CYCLE_SUM = sum(_TICKET_CYCLE.values())


def _pos(level):
    return (level - 1) % CYCLE + 1


def tier_mult(level):
    return 1 + min((level - 1) // TIER_SIZE, TIER_MAX_MULT - 1)


def primary_reward(level):
    """そのレベルの基本報酬  {'type':'coins'|'ticket', 'amount':n}"""
    p = _pos(level)
    if p in _TICKET_CYCLE:
        return {'type': 'ticket', 'amount': _TICKET_CYCLE[p]}
    return {'type': 'coins', 'amount': _COIN_CYCLE[p] * tier_mult(level)}


def _band_mult_sum(full_bands):
    """倍率の合計(帯 0..full_bands-1 の倍率 1,2,..,10,10,10… の和)"""
    if full_bands <= TIER_MAX_MULT:
        return full_bands + full_bands * (full_bands - 1) // 2
    first = TIER_MAX_MULT + TIER_MAX_MULT * (TIER_MAX_MULT - 1) // 2
    return first + (full_bands - TIER_MAX_MULT) * TIER_MAX_MULT


def primary_totals_upto(n):
    """レベル 1〜n の基本報酬の合計 (コイン, チケット)。ループなしの式 + 最後の100レベル未満だけ数える"""
    n = int(n)
    if n <= 0:
        return 0, 0
    full, rem = divmod(n, TIER_SIZE)
    cycles_per_band = TIER_SIZE // CYCLE
    coins = _COIN_CYCLE_SUM * cycles_per_band * _band_mult_sum(full)
    tickets = _TICKET_CYCLE_SUM * cycles_per_band * full
    base = full * TIER_SIZE
    for lv in range(base + 1, base + rem + 1):
        r = primary_reward(lv)
        if r['type'] == 'coins':
            coins += r['amount']
        else:
            tickets += r['amount']
    return coins, tickets


def primary_totals(lo, hi):
    if hi < lo:
        return 0, 0
    c1, t1 = primary_totals_upto(hi)
    c0, t0 = primary_totals_upto(lo - 1)
    return c1 - c0, t1 - t0


# ===================== 特別報酬(1000レベルまで) =====================
# 見た目(演出・テーマ)の中身はフロント(v43.js)にある。ここは「id と名前」だけ
VICTORY_FX = {   # 勝利演出
    'v_classic': '🎉 クラシック', 'v_snow': '❄ 雪舞い', 'v_sparkle': '✨ きらめき',
    'v_frost': '🧊 霜の花', 'v_aurora': '🌌 オーロラ', 'v_iceburst': '💥 アイスバースト',
    'v_blizzard': '🌨 ブリザード', 'v_diamond': '💎 ダイヤモンドダスト', 'v_zero': '🥶 絶対零度',
}
LEVELUP_FX = {   # レベルアップ演出
    'lu_default': '⬆ スタンダード', 'lu_snow': '❄ 粉雪', 'lu_frost': '🧊 フロスト',
    'lu_aurora': '🌌 オーロラ', 'lu_crystal': '💠 クリスタル', 'lu_nova': '🌟 ノヴァ', 'lu_zero': '🥶 絶対零度',
}
THEMES = {       # 画面テーマ
    'normal': '🌈 ノーマル', 'dark': '🌙 ダーク', 'retro': '🕹 レトロ', 'winter': '❄ ウィンター',
    'glacier': '🏔 氷河', 'polar': '🌃 極夜',
}
FREE_COSMETICS = ['v_classic', 'v_snow', 'v_sparkle', 'lu_default', 'lu_snow',
                  'theme:normal', 'theme:dark', 'theme:retro', 'theme:winter']

WINTER_SKINS = {   # id: (名前, 到達レベル)  ★ 'winter_absolutezero' は 1000レベル限定
    'winter_powder':       ('❄ 粉雪', 20),
    'winter_icecrystal':   ('🧊 氷晶', 50),
    'winter_blizzard':     ('🌨 吹雪', 80),
    'winter_frostglass':   ('🪟 霜ガラス', 120),
    'winter_aurora':       ('🌌 オーロラ', 180),
    'winter_glacier':      ('🏔 氷河', 250),
    'winter_snowowl':      ('🦉 雪原のフクロウ', 350),
    'winter_northstar':    ('⭐ 北極星', 450),
    'winter_diamonddust':  ('💎 ダイヤモンドダスト', 600),
    'winter_polarnight':   ('🌃 極夜', 750),
    'winter_frozenthrone': ('👑 氷の玉座', 900),
    'winter_absolutezero': ('🥶 絶対零度', 1000),
}
ALL_SKIN_IDS = set(WINTER_SKINS)

# 演出・テーマの解放レベル
_COSMETIC_LEVELS = [
    (10, 'lu_snow'), (30, 'v_frost'), (40, 'theme:glacier'), (60, 'lu_frost'), (100, 'v_aurora'),
    (140, 'lu_aurora'), (160, 'theme:polar'), (200, 'v_iceburst'), (300, 'lu_crystal'),
    (400, 'v_blizzard'), (550, 'lu_nova'), (700, 'v_diamond'), (1000, 'v_zero'), (1000, 'lu_zero'),
]
# 'lu_snow' は無料枠にも入っているが、Lv10 の報酬としても出す(すでに持っていれば何も起きない)


def cosmetic_label(cid):
    if cid.startswith('theme:'):
        return '🎨 テーマ「%s」' % THEMES.get(cid[6:], cid[6:])
    if cid in VICTORY_FX:
        return '🏆 勝利演出「%s」' % VICTORY_FX[cid]
    if cid in LEVELUP_FX:
        return '⬆ レベルアップ演出「%s」' % LEVELUP_FX[cid]
    return cid


def _build_specials():
    sp = {}

    def add(lv, item):
        sp.setdefault(lv, []).append(item)

    for lv in range(10, LIMITED_MAX + 1, 10):                       # 10レベルごとのボーナスコイン
        add(lv, {'type': 'coins', 'amount': 1000 * (1 + lv // 100), 'label': ''})
    for lv in range(50, LIMITED_MAX + 1, 50):                       # 50レベルごとにチケット+2
        add(lv, {'type': 'ticket', 'amount': 2, 'label': ''})
    for sid, (name, lv) in WINTER_SKINS.items():
        add(lv, {'type': 'skin', 'id': sid, 'label': '🎨 スキン「%s」' % name, 'limited': sid == 'winter_absolutezero'})
    for lv, cid in _COSMETIC_LEVELS:
        add(lv, {'type': 'cosmetic', 'id': cid, 'label': cosmetic_label(cid), 'limited': lv == LIMITED_MAX})
    for lv, items in sp.items():                                    # ラベルを付ける
        for it in items:
            if not it.get('label'):
                it['label'] = ('🪙 ボーナス %s コイン' % format(it['amount'], ',')) if it['type'] == 'coins' \
                    else ('🎫 ボーナス チケット×%d' % it['amount'])
    # 1000レベル限定の称号(タイトルは称号システム側で、レベル到達で自動獲得される。ここは表示用)
    add(LIMITED_MAX, {'type': 'title', 'id': 'bp_1000', 'label': '🏷 称号「🥶 絶対零度の覇者」', 'limited': True})
    add(500, {'type': 'title', 'id': 'bp_500', 'label': '🏷 称号「🌌 氷原の支配者」'})
    add(250, {'type': 'title', 'id': 'bp_250', 'label': '🏷 称号「🏔 雪嶺の探求者」'})
    return sp


SPECIALS = _build_specials()
SPECIAL_LEVELS = sorted(SPECIALS)
# 称号は「到達したら自動で獲得」なので、受け取りでは何もしない(表示だけ)
TITLE_ONLY = {'title'}


def reward_items(level):
    """そのレベルの報酬を全部(基本 + 特別)。label つき"""
    p = primary_reward(level)
    items = [dict(p, label=('🪙 %s コイン' % format(p['amount'], ',')) if p['type'] == 'coins'
                  else ('🎫 ガチャ無料チケット×%d' % p['amount']))]
    if level <= LIMITED_MAX:
        items += [dict(x) for x in SPECIALS.get(level, [])]
    return items


def summarize(items):
    """items の中の コイン合計・チケット合計"""
    coins = sum(i['amount'] for i in items if i['type'] == 'coins')
    tickets = sum(i['amount'] for i in items if i['type'] == 'ticket')
    return coins, tickets


# ===================== 受け取り済みの保存(upto + extra) =====================
def load_claimed(raw):
    """DBの値 → (upto, extra)。旧形式(リスト)も読める"""
    if isinstance(raw, str):
        try:
            raw = json.loads(raw)
        except Exception:
            raw = None
    if isinstance(raw, dict):
        upto = int(raw.get('upto') or 0)
        extra = {int(x) for x in (raw.get('extra') or [])}
    else:
        upto, extra = 0, {int(x) for x in (raw or [])}
    return normalize(upto, extra)


def normalize(upto, extra):
    extra = {x for x in extra if x > upto}
    while (upto + 1) in extra:
        upto += 1
        extra.discard(upto)
    return upto, extra


def dump_claimed(upto, extra):
    return json.dumps({'upto': int(upto), 'extra': sorted(int(x) for x in extra)})


def is_claimed(level, upto, extra):
    return level <= upto or level in extra


def pending(level, upto, extra):
    """到達済み・未受取の (件数, コイン合計, チケット合計, 特別報酬のリスト[{level, items}])"""
    count = max(0, level - upto)
    coins, tickets = primary_totals(upto + 1, level)
    specials = []
    for lv in SPECIAL_LEVELS:
        if lv <= upto or lv > level or lv in extra:
            continue
        its = [i for i in SPECIALS[lv]]
        c, t = summarize(its)
        coins += c
        tickets += t
        specials.append({'level': lv, 'items': [dict(i) for i in its]})
    for lv in extra:                                     # 個別に受け取り済みのレベルの基本報酬を引く
        if upto < lv <= level:
            count -= 1
            p = primary_reward(lv)
            if p['type'] == 'coins':
                coins -= p['amount']
            else:
                tickets -= p['amount']
    return count, coins, tickets, specials


def view_window(level, upto, extra):
    """画面に出す報酬の一覧: 受け取れるもの(新しい順に最大 VIEW_PENDING_MAX) と、これから来るもの"""
    rows = []
    lv = level
    seen = 0
    # 受け取れるもの: 新しいレベルから遡って、未受取だけ集める(遡る範囲は有限)
    while lv >= 1 and seen < VIEW_PENDING_MAX and lv > upto:
        if not is_claimed(lv, upto, extra):
            rows.append(_row(lv, level, upto, extra))
            seen += 1
        lv -= 1
        if level - lv > 5000:                             # 念のための打ち切り
            break
    rows.reverse()
    # 直近で受け取り済みのもの(2レベル分、見た目の連続性のため)
    recent = []
    for l2 in range(max(1, level - 1), level + 1):
        if is_claimed(l2, upto, extra) and all(r['level'] != l2 for r in rows):
            recent.append(_row(l2, level, upto, extra))
    for l2 in range(level + 1, level + 1 + VIEW_AHEAD):
        rows.append(_row(l2, level, upto, extra))
    return recent + rows


def _row(lv, level, upto, extra):
    return {'level': lv, 'items': reward_items(lv), 'claimed': is_claimed(lv, upto, extra), 'reached': lv <= level}


def specials_view(level, upto, extra):
    """1000レベルまでの特別報酬(スキン・演出・テーマ・称号。ボーナスのコインだけの節目は除く)の一覧"""
    out = []
    for lv in SPECIAL_LEVELS:
        its = [i for i in SPECIALS[lv] if i['type'] in ('skin', 'cosmetic', 'title')]
        if not its:
            continue
        out.append({'level': lv, 'items': [dict(i) for i in its],
                    'claimed': is_claimed(lv, upto, extra), 'reached': lv <= level,
                    'limited': any(i.get('limited') for i in its)})
    return out

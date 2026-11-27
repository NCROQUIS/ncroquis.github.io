# 체스룸 레슨 64개 데이터 만들기. 판정에 쓰는 정답·목표는 python-chess로 모두 검사함
import json, random, sys, itertools, chess
random.seed(20261127)
OUT = sys.argv[1]
mined = json.load(open('/tmp/lsgen/mined.json'))
tac = []
for f in ('/tmp/lsgen/res0.json', '/tmp/lsgen/res1.json'):
    try: tac += json.load(open(f))
    except Exception: pass
PZ = None
src = open('/home/claude/chessroom/puzzles.js').read()
PZ = json.loads(src[src.index('['):src.rindex(']') + 1])
PZC = {c['id']: c for c in PZ}

LESSONS, SECS = [], []
def sec(name): SECS.append({'name': name, 'from': len(LESSONS)})
def lesson(t, d, steps):
    assert steps, t
    LESSONS.append({'t': t, 'd': d, 'steps': steps})

def white_view(fen, uci=None):
    """흑 차례면 판을 위아래·색을 뒤집어 늘 백(아래쪽)이 두게 함"""
    b = chess.Board(fen)
    if b.turn == chess.BLACK:
        b = b.mirror()
        if uci:
            m = chess.Move.from_uci(uci)
            uci = chess.Move(chess.square_mirror(m.from_square), chess.square_mirror(m.to_square), m.promotion).uci()
    b.halfmove_clock = 0; b.fullmove_number = 1
    return (b.fen(), uci) if uci is not None else b.fen()

# ---------- 별 모으기: 기물 하나로 별 칸을 모두 지나감 ----------
DIRS = {'R': [(1,0),(-1,0),(0,1),(0,-1)], 'B': [(1,1),(1,-1),(-1,1),(-1,-1)]}
DIRS['Q'] = DIRS['R'] + DIRS['B']
KN = [(1,2),(2,1),(2,-1),(1,-2),(-1,-2),(-2,-1),(-2,1),(-1,2)]
KG = DIRS['Q']
def sq(n): return chess.parse_square(n)
def moves1(p, s, occ_own, occ_enemy, first_pawn=True):
    f, r = chess.square_file(s), chess.square_rank(s); out = []
    ok = lambda ff, rr: 0 <= ff < 8 and 0 <= rr < 8
    if p in 'RBQ':
        for df, dr in DIRS[p]:
            ff, rr = f+df, r+dr
            while ok(ff, rr):
                t = chess.square(ff, rr)
                if t in occ_own: break
                out.append(t)
                if t in occ_enemy: break
                ff += df; rr += dr
    elif p in 'NK':
        for df, dr in (KN if p == 'N' else KG):
            ff, rr = f+df, r+dr
            if ok(ff, rr) and chess.square(ff, rr) not in occ_own: out.append(chess.square(ff, rr))
    elif p == 'P':
        t = chess.square(f, r+1) if r < 7 else None
        if t is not None and t not in occ_own and t not in occ_enemy:
            out.append(t)
            if r == 1:
                t2 = chess.square(f, r+2)
                if t2 not in occ_own and t2 not in occ_enemy: out.append(t2)
        for df in (-1, 1):
            if ok(f+df, r+1) and chess.square(f+df, r+1) in occ_enemy: out.append(chess.square(f+df, r+1))
    return out
def stars_par(p, start, stars, enemies=(), own=()):
    """별(+잡을 적 기물)을 모두 모으는 최소 수. 못 모으면 None"""
    stars = [sq(x) for x in stars]; en0 = frozenset(sq(x) for x in enemies); own = set(sq(x) for x in own)
    goal = frozenset(stars) | en0
    from collections import deque
    st0 = (sq(start), goal, en0); seen = {st0}; dq = deque([(st0, 0)])
    while dq:
        (s, left, en), d = dq.popleft()
        if not left: return d
        if d > 14: continue
        for t in moves1(p, s, own, en):
            nl = left - {t}; ne = en - {t}
            if p == 'P' and chess.square_rank(t) == 7: continue
            st = (t, nl, ne)
            if st not in seen: seen.add(st); dq.append((st, d+1))
    return None
def stars_fen(p, start, enemies=(), own=()):
    b = chess.Board(None)
    b.set_piece_at(sq(start), chess.Piece.from_symbol(p))
    for e in enemies: b.set_piece_at(sq(e), chess.Piece.from_symbol('p'))
    for o in own: b.set_piece_at(sq(o), chess.Piece.from_symbol('P'))
    b.turn = chess.WHITE; b.castling_rights = 0
    return b.board_fen() + ' w - - 0 1'
def stars(say, p, start, st, enemies=(), own=()):
    par = stars_par(p, start, st, enemies, own); assert par, (p, start, st)
    return {'k': 'stars', 'say': say, 'fen': stars_fen(p, start, enemies, own), 'st': list(st), 'par': par}

# ---------- 공통 검사 ----------
def goal_moves(fen, g):
    b = chess.Board(fen); out = []
    for m in b.legal_moves:
        b2 = b.copy(); b2.push(m)
        okk = {'check': b2.is_check() and not b2.is_checkmate(), 'mate': b2.is_checkmate(),
               'castle': b.is_castling(m), 'promo': m.promotion == chess.QUEEN, 'ep': b.is_en_passant(m),
               'mpromo': m.promotion is not None and b2.is_checkmate(), 'any': True}[g]
        if okk: out.append(m.uci())
    return out
def goal(say, fen, g, why=None):
    ms = goal_moves(fen, g); assert ms, (fen, g)
    d = {'k': 'goal', 'say': say, 'fen': fen, 'g': g}
    if why: d['why'] = why
    return d
def move(say, fen, ok, why=None):
    b = chess.Board(fen); legal = {m.uci() for m in b.legal_moves}
    for u in ok: assert u in legal, (fen, u)
    d = {'k': 'move', 'say': say, 'fen': fen, 'ok': ok}
    if why: d['why'] = why
    return d
def line(say, fen, ln):
    b = chess.Board(fen)
    for u in ln: m = chess.Move.from_uci(u); assert m in b.legal_moves, (fen, u); b.push(m)
    return {'k': 'line', 'say': say, 'fen': fen, 'ln': ln}
def quiz(say, q, o, a, fen=None, why=None):
    d = {'k': 'quiz', 'say': say, 'q': q, 'o': o, 'a': a}
    if fen: chess.Board(fen); d['fen'] = fen
    if why: d['why'] = why
    return d
def tap(say, s, fen=None):
    sq(s); d = {'k': 'tap', 'say': say, 'sq': s}
    if fen: d['fen'] = fen
    return d
def play(say, fen, g, elo, mx):
    b = chess.Board(fen); assert b.is_valid() and not b.is_game_over(), fen
    return {'k': 'play', 'say': say, 'fen': fen, 'g': g, 'elo': elo, 'max': mx}
def mate_n(say, fen, n, line_=None):
    d = {'k': 'mate', 'say': say, 'fen': fen, 'n': n}
    if line_: d['ln'] = line_
    return d
START = chess.STARTING_FEN

# ---------- 무작위 판 만들기 ----------
FILES = 'abcdefgh'
def rnd_board(white, black, tries=20000, cond=None):
    for _ in range(tries):
        b = chess.Board(None); b.turn = chess.WHITE; b.castling_rights = 0
        sqs = random.sample(range(64), len(white) + len(black)); okk = True
        for p, s in zip(white + black, sqs):
            if p.upper() == 'P' and chess.square_rank(s) in (0, 7): okk = False; break
            b.set_piece_at(s, chess.Piece.from_symbol(p))
        if not okk or not b.is_valid() or b.is_game_over(): continue
        if cond is None or cond(b): return b
    raise RuntimeError('no board')
def mate_in(b, n):
    """b(백 차례)에서 n수 안에 강제 메이트가 있는지 (작은 판 전용)"""
    def win(b, n):
        if n == 0: return False
        for m in b.legal_moves:
            b.push(m)
            if b.is_checkmate(): b.pop(); return True
            if n > 1 and not b.is_game_over():
                allw = True
                for r in list(b.legal_moves):
                    b.push(r); w = win(b, n-1); b.pop()
                    if not w: allw = False; break
                if allw: b.pop(); return True
            b.pop()
        return False
    return win(b, n)
def mate1_count(b): return [m.uci() for m in b.legal_moves if (b.push(m) or True) and (b.is_checkmate(), b.pop())[0]]

# ===================== 1. 체스판과 기물 =====================
sec('체스판과 기물')
lesson('체스판', '체스판은 가로 8칸, 세로 8칸, 모두 64칸이에요. 밝은 칸과 어두운 칸이 번갈아 있고, 두는 사람 오른쪽 아래 구석은 늘 밝은 칸이에요.', [
    quiz('체스판을 살펴봐요', '체스판의 칸은 모두 몇 개일까요?', ['32칸', '64칸', '100칸'], 1),
    quiz('구석 칸의 색', '내 오른쪽 아래 구석 칸은 무슨 색일까요?', ['밝은 칸', '어두운 칸'], 0, why='판을 놓을 때 오른쪽 아래가 밝은 칸이 되게 놓아요.'),
    tap('왼쪽 아래 구석 칸을 눌러요', 'a1'),
])
lesson('칸의 이름', '세로줄(파일)은 왼쪽부터 a~h, 가로줄(랭크)은 아래부터 1~8이에요. 파일과 랭크를 붙이면 칸 이름이 돼요. 예를 들어 e4는 e줄의 4번째 칸이에요.', [
    tap('e4 칸을 눌러요', 'e4'), tap('d5 칸을 눌러요', 'd5'), tap('h8 칸을 눌러요', 'h8'),
    tap('c6 칸을 눌러요', 'c6'), tap('f2 칸을 눌러요', 'f2'),
])
lesson('룩', '룩은 앞뒤·좌우로 곧게, 원하는 만큼 움직여요. 다른 기물을 뛰어넘지는 못해요.', [
    stars('룩으로 별을 모두 모아요', 'R', 'a1', ['a6', 'e6']),
    stars('별을 모두 모아요', 'R', 'h1', ['h7', 'b7', 'b3']),
    stars('별을 모두 모아요', 'R', 'd4', ['d8', 'a8', 'a1', 'h1']),
])
lesson('비숍', '비숍은 대각선으로 원하는 만큼 움직여요. 그래서 처음 선 칸과 같은 색 칸에만 다닐 수 있어요.', [
    stars('비숍으로 별을 모아요', 'B', 'c1', ['f4', 'h6']),
    stars('별을 모두 모아요', 'B', 'f1', ['b5', 'e8', 'h5']),
    stars('별을 모두 모아요', 'B', 'a1', ['h8', 'e3', 'b4']),
    quiz('비숍의 칸 색', '흰 칸에서 시작한 비숍이 어두운 칸에 갈 수 있을까요?', ['갈 수 있어요', '갈 수 없어요'], 1, why='대각선으로만 움직여서 늘 같은 색 칸에 있어요.'),
])
lesson('퀸', '퀸은 룩과 비숍을 합친 기물이에요. 곧게도, 대각선으로도 원하는 만큼 움직여요.', [
    stars('퀸으로 별을 모아요', 'Q', 'd1', ['d7', 'a4']),
    stars('별을 모두 모아요', 'Q', 'a1', ['h8', 'h2', 'b7']),
    stars('별을 모두 모아요', 'Q', 'e4', ['b1', 'b7', 'g8', 'h3', 'c3']),
])
lesson('나이트', '나이트는 L자로 움직여요: 한 방향으로 2칸, 옆으로 1칸. 체스에서 유일하게 다른 기물을 뛰어넘을 수 있어요.', [
    stars('나이트로 별을 모아요', 'N', 'b1', ['c3', 'd5']),
    stars('별을 모두 모아요', 'N', 'g1', ['e2', 'g3', 'h5']),
    stars('폰을 뛰어넘어 별을 모아요', 'N', 'd4', ['f5', 'd6', 'b5'], own=['e5', 'd5', 'c5', 'e4', 'c4']),
])
lesson('킹', '킹은 어느 방향으로든 1칸씩 움직여요. 가장 중요한 기물이라 잡히면 안 돼요.', [
    stars('킹으로 별을 모아요', 'K', 'e1', ['e3', 'f4']),
    stars('별을 모두 모아요', 'K', 'd4', ['d6', 'f6', 'f4']),
    stars('별을 모두 모아요', 'K', 'a1', ['c3', 'a4', 'd1']),
])
lesson('폰: 이동', '폰은 앞으로만 1칸 가요. 처음 자리에서는 한 번에 2칸 갈 수도 있어요. 뒤로는 못 가요.', [
    stars('폰을 별까지 밀어요', 'P', 'e2', ['e4', 'e6']),
    stars('처음엔 2칸, 그다음은 1칸씩', 'P', 'b2', ['b4', 'b5', 'b7']),
    quiz('폰의 첫 이동', '폰은 언제 2칸을 갈 수 있을까요?', ['아무 때나', '처음 자리에 있을 때만', '상대 폰을 잡을 때'], 1),
])
lesson('폰: 잡기', '폰은 앞으로 가지만, 잡을 때는 앞쪽 대각선 1칸에 있는 기물을 잡아요. 바로 앞의 기물은 잡지 못해요.', [
    stars('대각선으로 상대 폰을 잡아요', 'P', 'c2', [], enemies=['d3']),
    stars('상대 폰을 모두 잡아요', 'P', 'd2', [], enemies=['e3', 'd4']),
    stars('상대 폰을 모두 잡아요', 'P', 'b2', [], enemies=['c3', 'b4', 'c5']),
    quiz('막힌 폰', '폰 바로 앞에 상대 기물이 있으면 잡을 수 있을까요?', ['잡을 수 있어요', '잡을 수 없어요'], 1, why='폰은 대각선으로만 잡아요. 앞이 막히면 멈춰요.'),
])
lesson('기물 배치', '처음 배치: 맨 아랫줄에 룩·나이트·비숍·퀸·킹·비숍·나이트·룩, 그 앞줄에 폰 8개. 퀸은 자기 색 칸(백 퀸은 d1 밝은 칸)에 서요.', [
    tap('백 킹이 처음 서는 칸을 눌러요', 'e1', START),
    tap('백 퀸이 처음 서는 칸을 눌러요', 'd1', START),
    quiz('나이트 자리', '백 나이트는 처음에 어느 칸들에 있을까요?', ['a1·h1', 'b1·g1', 'c1·f1'], 1, fen=START),
    quiz('흑 퀸', '흑 퀸은 처음에 어느 칸에 있을까요?', ['d8', 'e8'], 0, fen=START, why='퀸은 자기 색 칸에 서요. 흑 퀸은 어두운 d8이에요.'),
])

# ===================== 2. 목표와 특별 규칙 =====================
sec('목표와 특별 규칙')
def check_pos():
    return rnd_board(['K', random.choice('QRBN'), 'P'], ['k', 'p', random.choice('nbr')],
        cond=lambda b: goal_moves(b.fen(), 'check') and not goal_moves(b.fen(), 'mate') and not b.is_check() and len(goal_moves(b.fen(), 'check')) <= 3)
lesson('체크', '킹을 공격하는 것을 체크라고 해요. 체크를 받은 쪽은 다음 수에 반드시 체크에서 벗어나야 해요.', [
    goal('상대 킹에게 체크를 걸어요', check_pos().fen(), 'check'),
    goal('체크를 걸어요', check_pos().fen(), 'check'),
    goal('체크를 걸어요', check_pos().fen(), 'check'),
])
def escape_kind(b, kind):
    """백이 체크를 받은 판에서, 둘 수 있는 수가 모두 kind(king/block/capture)인 판"""
    if not b.is_check() or b.is_checkmate(): return False
    ms = list(b.legal_moves)
    def k(m):
        if b.piece_type_at(m.from_square) == chess.KING: return 'king'
        if b.is_capture(m): return 'capture'
        return 'block'
    kinds = {k(m) for m in ms}
    return kinds == {kind}
def esc(kind, w, bl):
    b = rnd_board(w, bl, tries=300000, cond=lambda b: (b.turn == chess.WHITE) and escape_kind(b, kind))
    return b.fen()
def rnd_checked(w, bl, kind):
    for _ in range(400000):
        b = chess.Board(None); b.castling_rights = 0
        sqs = random.sample(range(64), len(w)+len(bl)); okk = True
        for p, s in zip(w+bl, sqs):
            if p.upper() == 'P' and chess.square_rank(s) in (0, 7): okk = False; break
            b.set_piece_at(s, chess.Piece.from_symbol(p))
        if not okk: continue
        b.turn = chess.WHITE
        if not b.is_valid(): continue
        if escape_kind(b, kind): return b.fen()
    raise RuntimeError(kind)
lesson('체크에서 벗어나기', '체크에서 벗어나는 방법은 세 가지예요: 킹이 피하기, 사이를 막기, 체크한 기물을 잡기.', [
    goal('킹을 옮겨 체크를 피해요', rnd_checked(['K', 'P', 'P'], ['k', 'r', 'n'], 'king'), 'any'),
    goal('기물로 사이를 막아요', rnd_checked(['K', 'B', 'P'], ['k', 'q'], 'block'), 'any'),
    goal('체크한 기물을 잡아요', rnd_checked(['K', 'R', 'N'], ['k', 'q', 'p'], 'capture'), 'any'),
])
# 메이트 1수: 게임 마지막 수에서 (기물이 적은 판 우선)
def piece_count(fen): return sum(1 for c in fen.split()[0] if c.isalpha())
MATES = []
for m in mined['mates']:
    f, u = white_view(m['fen'], m['uci']); MATES.append({'fen': f, 'uci': u, 'n': piece_count(f)})
def classify_mate(fen, u):
    b = chess.Board(fen); mv = chess.Move.from_uci(u); p = b.piece_at(mv.from_square).symbol().upper()
    b.push(mv); k = b.king(chess.BLACK); kr = chess.square_rank(k)
    nb = [s for s in chess.SQUARES if chess.square_distance(s, k) == 1]
    own = all(b.piece_at(s) and b.piece_at(s).color == chess.BLACK for s in nb)
    if p == 'N' and own: return 'smother'
    if p in 'RQ' and kr == 7 and chess.square_rank(mv.to_square) == 7 and all(
            (b.piece_at(s) and b.piece_at(s).color == chess.BLACK) for s in nb if chess.square_rank(s) == 6): return 'backrank'
    return 'other'
for m in MATES: m['c'] = classify_mate(m['fen'], m['uci'])
used = set()
def take_mates(cls, n, maxp=40):
    out = []
    for m in sorted(MATES, key=lambda x: x['n']):
        if m['c'] == cls and m['fen'] not in used and m['n'] <= maxp:
            used.add(m['fen']); out.append(m)
            if len(out) == n: break
    assert len(out) == n, cls
    return out
lesson('체크메이트', '체크를 받았는데 벗어날 방법이 하나도 없으면 체크메이트예요. 체크메이트를 하면 이겨요.', [
    goal('한 수로 체크메이트해요', m['fen'], 'mate') for m in take_mates('other', 3)] + [
    quiz('메이트가 되면', '체크메이트가 되면 어떻게 될까요?', ['킹을 잡고 계속해요', '바로 대국이 끝나요', '한 수 무르고 다시 둬요'], 1),
])
stale_fen = '7k/8/6Q1/8/8/8/8/6K1 b - - 0 1'
assert chess.Board(stale_fen).is_stalemate()
def kq_mate1_with_stale():
    return rnd_board(['K', 'Q'], ['k'], tries=500000, cond=lambda b: goal_moves(b.fen(), 'mate') and any(
        (b.push(m) or True) and (b.is_stalemate(), b.pop())[0] for m in list(b.legal_moves))).fen()
lesson('스테일메이트', '내 차례인데 체크는 아니면서 둘 수 있는 수가 하나도 없으면 스테일메이트, 곧 무승부예요. 이기고 있을 때 조심해야 해요.', [
    quiz('이 판은?', '흑 차례예요. 이 판은 무엇일까요?', ['체크메이트', '스테일메이트', '대국이 계속돼요'], 1, fen=stale_fen, why='흑 킹은 체크가 아니지만 갈 곳이 없어요.'),
    goal('스테일메이트 말고 체크메이트해요', kq_mate1_with_stale(), 'mate', why='stale'),
    goal('이번에도 체크메이트해요', kq_mate1_with_stale(), 'mate', why='stale'),
])
lesson('캐슬링', '캐슬링은 킹을 룩 쪽으로 2칸 옮기고, 룩을 킹 너머로 옮기는 특별한 수예요. 킹을 안전한 구석으로 보내요. 킹을 2칸 옮기면 돼요.', [
    goal('킹 쪽으로 캐슬링해요', 'r3k2r/pppq1ppp/2npbn2/2b1p3/2B1P3/2NPBN2/PPPQ1PPP/R3K2R w KQkq - 0 1', 'castle'),
    move('퀸 쪽으로 캐슬링해요', 'r3k2r/pppq1ppp/2npbn2/2b1p3/2B1P3/2NPBN2/PPPQ1PPP/R3K2R w KQkq - 0 1', ['e1c1']),
])
lesson('캐슬링할 수 없을 때', '이럴 때는 캐슬링을 못 해요: 킹이나 그 룩이 한 번이라도 움직였을 때, 지금 체크를 받고 있을 때, 킹이 지나가거나 도착할 칸을 상대가 공격할 때, 사이에 기물이 있을 때.', [
    quiz('체크 중', '킹이 체크를 받고 있어요. 캐슬링할 수 있을까요?', ['할 수 있어요', '할 수 없어요'], 1, fen='4k3/8/8/8/1b6/8/8/R3K2R w KQ - 0 1'),
    quiz('지나가는 칸', '흑 비숍이 f1을 노려요. 킹 쪽 캐슬링을 할 수 있을까요?', ['할 수 있어요', '할 수 없어요'], 1, fen='4k3/8/8/8/8/7b/8/R3K2R w KQ - 0 1', why='킹이 지나가는 f1을 상대가 공격하고 있어요.'),
    quiz('퀸 쪽은?', '같은 판에서 퀸 쪽 캐슬링은 할 수 있을까요?', ['할 수 있어요', '할 수 없어요'], 0, fen='4k3/8/8/8/8/7b/8/R3K2R w KQ - 0 1', why='퀸 쪽으로 지나가는 d1·c1은 공격받지 않아요.'),
    quiz('움직인 킹', '킹이 한 번 움직였다가 제자리로 돌아왔어요. 캐슬링할 수 있을까요?', ['할 수 있어요', '할 수 없어요'], 1),
])
promo_fens = []
for fen in ['8/4P3/8/8/2k5/8/8/4K3 w - - 0 1', '8/1P6/8/8/5k2/8/8/2K5 w - - 0 1']:
    assert goal_moves(fen, 'promo'); promo_fens.append(fen)
pm = rnd_board(['K', 'P', 'R'], ['k', 'p', 'p'], tries=500000, cond=lambda b: goal_moves(b.fen(), 'mpromo') and not [u for u in goal_moves(b.fen(), 'mate') if len(u) == 4]).fen()
lesson('폰 승격', '폰이 맨 끝 줄에 닿으면 퀸·룩·비숍·나이트 가운데 하나로 바뀌어요. 대부분 가장 강한 퀸을 골라요.', [
    goal('폰을 끝까지 밀어 퀸으로 바꿔요', promo_fens[0], 'promo'),
    goal('퀸으로 바꿔요', promo_fens[1], 'promo'),
    goal('승격으로 체크메이트해요', pm, 'mpromo'),
])
ep1 = 'rnbqkbnr/ppp1p1pp/8/3pPp2/8/8/PPPP1PPP/RNBQKBNR w KQkq f6 0 1'
ep2 = '4k3/8/8/1pP5/8/8/8/4K3 w - b6 0 1'
assert goal_moves(ep1, 'ep') and goal_moves(ep2, 'ep')
lesson('앙파상', '상대 폰이 처음 자리에서 2칸 나와 내 폰 바로 옆에 섰다면, 바로 다음 수에 한해 1칸만 나온 것처럼 대각선으로 잡을 수 있어요. 이것이 앙파상이에요.', [
    goal('방금 2칸 나온 f폰을 앙파상으로 잡아요', ep1, 'ep'),
    goal('앙파상으로 잡아요', ep2, 'ep'),
    quiz('기회는 언제?', '앙파상은 언제까지 할 수 있을까요?', ['언제든지', '상대가 2칸 나온 바로 다음 수에만', '내 폰이 5번째 줄에 있는 동안'], 1),
])
lesson('다른 무승부', '스테일메이트 말고도 무승부가 있어요: 서로 합의, 같은 판이 세 번 나옴, 50수 동안 폰 이동·잡기가 없음, 메이트할 기물이 모자람.', [
    quiz('기물 부족', '백 킹과 비숍, 흑 킹만 남았어요. 이 대국은?', ['백이 이길 수 있어요', '무승부예요'], 1, fen='4k3/8/8/8/8/3B4/8/4K3 w - - 0 1', why='킹과 비숍만으로는 메이트할 수 없어요.'),
    quiz('기물 부족 2', '백 킹과 룩, 흑 킹이 남았어요. 이 대국은?', ['백이 이길 수 있어요', '무승부예요'], 0, fen='4k3/8/8/8/8/8/8/R3K3 w - - 0 1'),
    quiz('반복', '같은 판이 몇 번 나오면 무승부를 할 수 있을까요?', ['2번', '3번', '5번'], 1),
    quiz('50수', '50수 동안 무엇이 없으면 무승부일까요?', ['체크', '폰 이동과 기물 잡기', '캐슬링'], 1),
])
lesson('기보 쓰는 법', '수를 적을 때는 기물 글자 + 도착 칸으로 써요. K 킹, Q 퀸, R 룩, B 비숍, N 나이트, 폰은 글자 없이 칸만 써요. x는 잡기, +는 체크, #은 체크메이트, O-O는 킹 쪽 캐슬링이에요.', [
    quiz('Nf3', 'Nf3은 무슨 뜻일까요?', ['나이트가 f3으로', '킹이 f3으로', '폰이 f3으로'], 0),
    tap('"e4"는 폰이 어디로 간 수일까요? 그 칸을 눌러요', 'e4', START),
    quiz('기호', 'Bxe5+ 에서 x와 +는?', ['x 잡기, + 체크', 'x 체크, + 잡기', 'x 승격, + 메이트'], 0),
    quiz('캐슬링 기호', 'O-O-O는 무엇일까요?', ['킹 쪽 캐슬링', '퀸 쪽 캐슬링', '무승부 제안'], 1),
])

# ===================== 3. 첫 체크메이트 =====================
sec('첫 체크메이트')
def kxk_mate1(wp):
    return rnd_board(['K'] + wp, ['k'], tries=800000, cond=lambda b: goal_moves(b.fen(), 'mate') and not b.is_check()).fen()
def kxk_play(wp, cond=None):
    def c(b):
        k = b.king(chess.BLACK)
        return 2 <= chess.square_file(k) <= 5 and 2 <= chess.square_rank(k) <= 5 and not b.is_check() and (cond is None or cond(b))
    return rnd_board(['K'] + wp, ['k'], tries=500000, cond=c).fen()
lesson('룩 두 개로 체크메이트', '룩 두 개가 번갈아 줄을 막으며 킹을 끝 줄로 몰아요(사다리 메이트). 한 룩이 줄을 막고 다른 룩이 다음 줄에서 체크해요.', [
    goal('한 수로 체크메이트해요', kxk_mate1(['R', 'R']), 'mate'),
    goal('한 수로 체크메이트해요', kxk_mate1(['R', 'R']), 'mate'),
    play('룩 두 개로 체크메이트해요', kxk_play(['R', 'R']), 'mate', 1200, 40),
])
lesson('퀸으로 체크메이트', '퀸과 킹으로 상대 킹을 끝으로 몰아요. 퀸이 나이트처럼 한 칸 떨어져 따라가며 킹의 공간을 줄이고, 마지막에 내 킹이 다가와 도와줘요.', [
    goal('한 수로 체크메이트해요', kxk_mate1(['Q']), 'mate'),
    goal('한 수로 체크메이트해요', kxk_mate1(['Q']), 'mate'),
    play('퀸과 킹으로 체크메이트해요', kxk_play(['Q']), 'mate', 1200, 40),
])
lesson('스테일메이트 주의', '상대 킹을 몰다가 갈 곳만 없애고 체크를 안 하면 스테일메이트로 비겨요. 상대 킹에게 늘 숨 쉴 칸이 있는지 확인해요.', [
    goal('스테일메이트 없이 체크메이트해요', kq_mate1_with_stale(), 'mate', why='stale'),
    goal('스테일메이트 없이 체크메이트해요', kq_mate1_with_stale(), 'mate', why='stale'),
    goal('스테일메이트 없이 체크메이트해요', kq_mate1_with_stale(), 'mate', why='stale'),
])
lesson('룩으로 체크메이트', '룩 하나로도 이길 수 있어요. 룩으로 킹을 줄에 가두고, 내 킹을 마주 세운 뒤 끝 줄에서 체크하면 메이트예요.', [
    goal('한 수로 체크메이트해요', kxk_mate1(['R']), 'mate'),
    goal('한 수로 체크메이트해요', kxk_mate1(['R']), 'mate'),
    play('룩과 킹으로 체크메이트해요', kxk_play(['R']), 'mate', 1200, 60),
])
lesson('백랭크 메이트', '킹이 끝 줄에 있고 앞이 자기 폰으로 막혀 있으면, 끝 줄에 들어온 룩이나 퀸 한 번에 메이트가 돼요.', [
    goal('끝 줄로 들어가 체크메이트해요', m['fen'], 'mate') for m in take_mates('backrank', 3)])
lesson('스머더드 메이트', '킹이 자기 기물에 둘러싸여 움직일 칸이 없을 때, 나이트 체크 한 번으로 끝나요. 숨이 막힌다는 뜻의 메이트예요.', [
    goal('나이트로 체크메이트해요', m['fen'], 'mate') for m in take_mates('smother', 3, 40)])

# ===================== 4. 기물의 가치 =====================
sec('기물의 가치')
lesson('기물의 가치', '기물마다 대략의 점수가 있어요: 폰 1, 나이트 3, 비숍 3, 룩 5, 퀸 9. 킹은 값을 매길 수 없어요. 교환할 때 이 점수를 비교해요.', [
    quiz('룩의 점수', '룩은 몇 점일까요?', ['3점', '5점', '9점'], 1),
    quiz('더 귀한 기물', '어느 쪽이 더 가치 있을까요?', ['나이트 1개', '룩 1개'], 1),
    quiz('교환', '내 나이트를 주고 상대 퀸을 받으면?', ['손해예요', '이득이에요', '같아요'], 1),
    quiz('비숍 둘', '비숍 2개와 비슷한 가치는?', ['룩 1개 + 폰 1개', '퀸 1개', '폰 2개'], 0, why='비숍 둘은 6점, 룩+폰도 6점이에요.'),
])
# 전술 후보(마스터 대국에서 엔진으로 고른 '하나뿐인 좋은 수')를 백 시점으로
TAC = []
for t in tac:
    f, u = white_view(t['fen'], t['best']); b = chess.Board(f); mv = chess.Move.from_uci(u)
    if mv not in b.legal_moves: continue
    TAC.append({'fen': f, 'u': u, 'gain': t['bv'] - t['base'], 'played': white_view(t['fen'], t['uci'])[1] == u})
def ttype(t):
    b = chess.Board(t['fen']); mv = chess.Move.from_uci(t['u']); p = b.piece_at(mv.from_square)
    cap = b.piece_at(mv.to_square); b2 = b.copy(); b2.push(mv)
    tags = set()
    if b2.is_checkmate(): tags.add('mate1')
    if cap and not b.is_attacked_by(chess.BLACK, mv.to_square) and cap.piece_type != chess.PAWN: tags.add('free')
    if len(b2.checkers()) == 2: tags.add('double')
    # 포크: 움직인 기물이 값진 상대 기물(킹·퀸·룩·비숍·나이트) 둘 이상을 공격
    att = [s for s in b2.attacks(mv.to_square) if b2.piece_at(s) and b2.piece_at(s).color == chess.BLACK and b2.piece_at(s).piece_type != chess.PAWN]
    if len(att) >= 2 and not cap: tags.add('nfork' if p.piece_type == chess.KNIGHT else 'fork')
    # 디스커버드: 다른 내 슬라이더가 새로 값진 기물이나 킹을 공격
    for s in chess.SQUARES:
        q = b.piece_at(s)
        if q and q.color == chess.WHITE and s != mv.from_square and q.piece_type in (chess.BISHOP, chess.ROOK, chess.QUEEN):
            before = {x for x in b.attacks(s)}; after = {x for x in b2.attacks(s)}
            for x in after - before:
                tp = b2.piece_at(x)
                if tp and tp.color == chess.BLACK and tp.piece_type in (chess.KING, chess.QUEEN, chess.ROOK) and mv.from_square in chess.SquareSet(chess.between(s, x)):
                    tags.add('disc')
    # 핀·스큐어: 움직인 슬라이더의 줄 위에 상대 기물 둘
    if p.piece_type in (chess.BISHOP, chess.ROOK, chess.QUEEN) and not b2.is_checkmate():
        for x in b2.attacks(mv.to_square):
            tp = b2.piece_at(x)
            if not tp or tp.color != chess.BLACK: continue
            df = (chess.square_file(x) > chess.square_file(mv.to_square)) - (chess.square_file(x) < chess.square_file(mv.to_square))
            dr = (chess.square_rank(x) > chess.square_rank(mv.to_square)) - (chess.square_rank(x) < chess.square_rank(mv.to_square))
            ff, rr = chess.square_file(x) + df, chess.square_rank(x) + dr
            while 0 <= ff < 8 and 0 <= rr < 8:
                y = chess.square(ff, rr); tq = b2.piece_at(y)
                if tq:
                    if tq.color == chess.BLACK:
                        V = {1: 1, 2: 3, 3: 3, 4: 5, 5: 9, 6: 100}
                        if V[tq.piece_type] > V[tp.piece_type] and tq.piece_type in (chess.KING, chess.QUEEN, chess.ROOK): tags.add('pin')
                        if V[tp.piece_type] > V[tq.piece_type] and tp.piece_type in (chess.KING, chess.QUEEN) and tq.piece_type != chess.PAWN: tags.add('skewer')
                    break
                ff += df; rr += dr
    if cap and 'free' not in tags: tags.add('trade')
    if cap:
        # 잡힌 기물이 지키던 상대 기물이, 잡은 뒤에 지켜지지 않고 내 공격을 받으면 '방어자 없애기'
        for x in b.attacks(mv.to_square):
            tp = b.piece_at(x)
            if tp and tp.color == chess.BLACK and tp.piece_type in (chess.KNIGHT, chess.BISHOP, chess.ROOK, chess.QUEEN) and x != mv.to_square:
                if b.is_attacked_by(chess.WHITE, x) and not b2.is_attacked_by(chess.BLACK, x) and b2.is_attacked_by(chess.WHITE, x): tags.add('defender')
    if p.piece_type == chess.PAWN and chess.square_rank(mv.to_square) >= 5: tags.add('pawn')
    return tags
for t in TAC: t['tags'] = ttype(t)
tused = set()
def take_tac(tag, n, extra=lambda t: True):
    pool = [t for t in TAC if tag in t['tags'] and t['fen'] not in tused and extra(t)]
    pool.sort(key=lambda t: (not t['played'], piece_count(t['fen'])))
    out = pool[:n]
    for t in out: tused.add(t['fen'])
    assert len(out) == n, (tag, len(pool))
    return out
def tsteps(tag, say, n=3, extra=lambda t: True):
    return [move(say, t['fen'], [t['u']]) for t in take_tac(tag, n, extra)]
lesson('보호받지 않는 기물', '아무도 지켜 주지 않는 기물을 "매달린 기물"이라고 해요. 상대의 매달린 기물은 공짜로 잡을 수 있어요.', tsteps('free', '지켜지지 않은 기물을 잡아요'))
lesson('공격과 방어', '기물이 공격받으면 피하거나, 지키거나, 공격한 기물을 잡아요. 공격받는 기물보다 공격한 기물이 싸면 꼭 피해야 해요.', [
    quiz('어떻게 할까?', '내 퀸을 상대 폰이 공격해요. 가장 좋은 생각은?', ['퀸으로 다른 기물을 지킨다', '퀸을 안전한 곳으로 피한다', '그냥 둔다'], 1, why='퀸(9점)이 폰(1점)에게 잡히면 큰 손해예요.'),
    quiz('지키기', '내 나이트를 상대 나이트가 공격하고, 내 폰이 나이트를 지키고 있어요. 상대가 잡으면?', ['내가 손해', '서로 같아요', '내가 이득'], 1, why='나이트를 주고 나이트를 되찾아요.'),
] + tsteps('trade', '가장 좋은 수를 찾아요', 2))
lesson('기물 교환', '같은 값끼리 바꾸는 것은 교환, 싼 기물로 비싼 기물을 잡는 것은 이득이에요. 잡기 전에 상대가 다시 잡을 수 있는지 세어 봐요.', tsteps('trade', '이득이 되는 교환을 찾아요', 3))
lesson('상대의 노림수', '상대가 수를 두면 먼저 "무엇을 노리는가?"를 물어요. 체크, 잡기, 위협을 확인하면 실수가 크게 줄어요.', [
    quiz('먼저 볼 것', '상대가 수를 둔 뒤 가장 먼저 확인할 것은?', ['내 계획', '상대가 노리는 수', '시계'], 1),
] + tsteps('mate1', '상대가 방심했어요. 한 수로 끝내요', 2))
lesson('공짜 기물 함정', '공짜처럼 보이는 기물이 함정일 때도 있어요. 잡은 뒤 상대가 무엇을 할 수 있는지 한 수 더 봐요.', [
    quiz('함정', '공짜로 보이는 폰을 잡기 전에 확인할 것은?', ['잡은 뒤 내 기물이 안전한지', '폰의 색', '남은 시간'], 0),
] + tsteps('free', '안전하게 이득을 보는 수를 찾아요', 2))

# ===================== 5. 게임을 시작하는 법 =====================
sec('게임을 시작하는 법')
lesson('중앙', '판 가운데 네 칸(d4·e4·d5·e5)을 차지하면 기물이 움직이기 좋아요. 첫 수로 중앙 폰을 2칸 밀어요.', [
    tap('중앙 네 칸 가운데 e4를 눌러요', 'e4'),
    move('중앙 폰을 2칸 밀어요', START, ['e2e4', 'd2d4']),
    quiz('중앙', '중앙 네 칸이 아닌 것은?', ['d4', 'e5', 'c3'], 2),
])
e4e5 = 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2'
lesson('기물 전개', '오프닝에서는 나이트와 비숍을 빨리 꺼내요. 나이트는 보통 비숍보다 먼저, 중앙을 향해 꺼내요.', [
    move('나이트를 중앙 쪽으로 꺼내요', e4e5, ['g1f3', 'b1c3']),
    move('비숍을 꺼내요', 'r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3', ['f1c4', 'f1b5']),
    quiz('가장자리 나이트', '나이트를 a3·h3 같은 가장자리로 꺼내면?', ['더 좋아요', '움직일 곳이 줄어요'], 1),
])
lesson('킹의 안전', '기물을 꺼냈으면 캐슬링으로 킹을 구석에 숨겨요. 가운데 남은 킹은 공격받기 쉬워요.', [
    goal('캐슬링으로 킹을 숨겨요', 'r1bqk2r/pppp1ppp/2n2n2/2b1p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4', 'castle'),
    quiz('캐슬링 뒤', '캐슬링한 뒤 킹 앞의 폰들은?', ['함부로 밀지 않아요', '모두 밀어요'], 0, why='킹 앞 폰은 킹을 지키는 벽이에요.'),
])
lesson('퀸은 천천히', '오프닝에 퀸을 일찍 꺼내면 상대가 나이트·비숍으로 퀸을 쫓으며 공짜로 기물을 꺼내요.', [
    quiz('이른 퀸', '두 번째 수에 퀸을 꺼내면 생기는 일은?', ['상대가 퀸을 쫓으며 기물을 꺼내요', '바로 이겨요'], 0),
    move('퀸 대신 기물을 꺼내요', e4e5, ['g1f3', 'b1c3', 'f1c4']),
])
lesson('같은 기물 두 번', '오프닝에서는 같은 기물을 여러 번 움직이기보다 아직 안 나온 기물을 꺼내요.', [
    quiz('좋은 습관', '오프닝에서 더 좋은 것은?', ['나이트를 세 번 움직이기', '서로 다른 기물을 하나씩 꺼내기'], 1),
    move('아직 안 나온 기물을 꺼내요', 'r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3', ['f1c4', 'f1b5', 'b1c3', 'd2d4']),
])
lesson('이탈리안 게임', '많이 두는 오프닝을 따라 해 봐요. 1.e4 e5 2.Nf3 Nc6 3.Bc4 — 중앙 폰, 나이트, 비숍 순서로 빠르게 꺼내요.', [
    line('e4 → Nf3 → Bc4 순서로 둬요', START, ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1c4']),
    line('이번엔 d4로 시작해요: d4 → c4', START, ['d2d4', 'd7d5', 'c2c4']),
])

# ===================== 6. 전술 =====================
sec('전술')
lesson('포크', '한 기물이 상대 기물 두 개를 한꺼번에 공격하는 것을 포크라고 해요. 상대는 하나만 지킬 수 있어요.', tsteps('fork', '두 기물을 한꺼번에 노려요'))
lesson('나이트 포크', '나이트는 뛰어넘어 공격해서 포크를 걸기 가장 좋은 기물이에요. 킹과 퀸을 함께 노리는 수를 찾아요.', tsteps('nfork', '나이트로 포크를 걸어요'))
lesson('핀', '핀은 뒤에 더 귀한 기물이 있어서 앞의 기물이 움직이지 못하게 묶는 거예요.', tsteps('pin', '상대 기물을 묶어요'))
lesson('스큐어', '스큐어는 핀의 반대예요. 귀한 기물을 공격해 비키게 한 뒤 뒤에 있는 기물을 잡아요.', tsteps('skewer', '꼬치처럼 꿰어 공격해요', 2))
lesson('디스커버드 어택', '한 기물이 비켜서면 뒤에 숨은 기물의 공격이 드러나요. 비키는 기물도 공격하면 한 번에 두 곳을 노려요.', tsteps('disc', '기물을 비켜 숨은 공격을 드러내요'))
lesson('더블 체크', '두 기물이 동시에 체크하면 막거나 잡을 수 없어서 킹이 움직일 수밖에 없어요.', tsteps('double', '두 기물로 동시에 체크해요', 2))
lesson('방어자 없애기', '상대 기물을 지키는 기물을 먼저 잡거나 쫓아내면, 지켜지던 기물이 무너져요.', tsteps('defender', '지키는 기물을 먼저 잡아요', 3))
M2 = []
for e in PZC['m2']['list']:
    f, k = e.split('|')[:2]
    if piece_count(f) > 22: continue
    keys = [x for x in k.split(',') if x]
    if not keys: continue
    f, k0 = white_view(f, keys[0]); keys = [k0]
    b = chess.Board(f)
    if not keys: continue
    mv = chess.Move.from_uci(keys[0])
    if mv not in b.legal_moves: continue
    chk = b.gives_check(mv)
    V = {1: 1, 2: 3, 3: 3, 4: 5, 5: 9, 6: 0}
    pv = V[b.piece_type_at(mv.from_square)]; cap = b.piece_type_at(mv.to_square)
    sac = b.is_attacked_by(chess.BLACK, mv.to_square) and pv >= 3 and (cap is None or V[cap] < pv)
    if piece_count(f) > 16 and not sac: continue
    if not mate_in(chess.Board(f), 2) or mate_in(chess.Board(f), 1): continue
    M2.append({'fen': f, 'chk': chk, 'sac': sac})
    if len(M2) >= 300 and sum(m["sac"] for m in M2) >= 10: break
m2used = set()
def m2_pick(n, cond):
    pool = [m for m in M2 if cond(m) and m['fen'] not in m2used]
    random.shuffle(pool); out = pool[:n]
    for m in out: m2used.add(m['fen'])
    assert len(out) == n, ('m2', len(pool), len(M2), sum(m['sac'] for m in M2))
    return [m['fen'] for m in out]
lesson('체크로 몰아붙이기', '체크는 상대가 반드시 받아야 하는 수예요. 체크를 이어 가면 상대에게 생각할 틈을 주지 않고 메이트까지 갈 수 있어요.', [mate_n('체크로 시작해 2수 안에 메이트해요', f, 2) for f in m2_pick(3, lambda m: m['chk'])])
lesson('메이트를 부르는 희생', '기물을 내주더라도 메이트가 되면 이겨요. 퀸을 주고 메이트하는 수도 있어요.', [mate_n('기물을 내주고 2수 안에 메이트해요', f, 2) for f in m2_pick(3, lambda m: m['sac'])])
lesson('백랭크 약점', '끝 줄의 킹 앞을 폰이 막고 있으면 백랭크 메이트를 노릴 수 있어요. 지키는 기물을 먼저 떼어 내요.', [
    goal('끝 줄을 파고들어요', m['fen'], 'mate') for m in take_mates('backrank', 3)])
lesson('폰을 퀸으로', '끝 줄 가까이 간 폰은 아주 위험한 무기예요. 막는 기물이 없을 때 밀어 승격해요.', [
    goal('폰을 퀸으로 바꿔요', rnd_board(['K', 'P', 'R'], ['k', 'r'], tries=500000, cond=lambda b: any(chess.square_rank(s) == 6 for s in b.pieces(chess.PAWN, chess.WHITE)) and goal_moves(b.fen(), 'promo') and not b.is_check()).fen(), 'promo'),
] + tsteps('pawn', '폰으로 이득을 봐요', 2))
lesson('전술 종합', '지금까지 배운 포크·핀·스큐어·디스커버드 어택을 섞었어요. 체크·잡기·위협 순서로 찾아봐요.', [
    move('가장 좋은 수를 찾아요', t['fen'], [t['u']]) for t in sorted([t for t in TAC if t['fen'] not in tused and t['played'] and t['gain'] >= 250], key=lambda t: piece_count(t['fen']))[:4]])
for t in LESSONS[-1]['steps']: tused.add(t['fen'])

# ===================== 7. 엔드게임 =====================
sec('엔드게임')
def race(win):
    """폰과 킹의 경주. win이면 상대 킹이 폰을 못 따라잡는 판(정사각형 밖, 여유 2칸)"""
    def c(b):
        p = list(b.pieces(chess.PAWN, chess.WHITE))[0]; k = b.king(chess.BLACK); wk = b.king(chess.WHITE)
        f, r = chess.square_file(p), chess.square_rank(p)
        steps = 7 - max(r, 2) + (1 if r == 1 else 0)
        dist = chess.square_distance(k, chess.square(f, 7))
        if chess.square_distance(wk, p) <= 2 or chess.square_distance(wk, k) < 3: return False
        return (dist - 1 > steps + 1) if win else (dist <= steps - 1)
    return rnd_board(['K', 'P'], ['k'], tries=500000, cond=c).fen()
lesson('정사각형 규칙', '폰에서 끝 줄까지를 한 변으로 하는 정사각형을 그려 봐요. 상대 킹이 그 안에 들어오지 못하면 폰은 혼자 승격해요.', [
    quiz('따라잡을까?', '백 차례예요. 흑 킹이 폰을 따라잡을 수 있을까요?', ['따라잡아요', '못 따라잡아요'], 1, fen=race(True)),
    quiz('따라잡을까?', '백 차례예요. 흑 킹이 폰을 따라잡을 수 있을까요?', ['따라잡아요', '못 따라잡아요'], 0, fen=race(False)),
    play('폰을 끝까지 밀어 승격해요', race(True), 'promo', 1600, 20),
])
def kp_key():
    """킹이 폰 앞 '핵심 칸'에 선 킹+폰 대 킹 (이기는 판)"""
    def c(b):
        p = list(b.pieces(chess.PAWN, chess.WHITE))[0]; f, r = chess.square_file(p), chess.square_rank(p)
        if f in (0, 7) or r < 1 or r > 4: return False
        wk = b.king(chess.WHITE); kf, kr = chess.square_file(wk), chess.square_rank(wk)
        if not (abs(kf - f) <= 1 and kr == r + 2): return False
        bk = b.king(chess.BLACK)
        return chess.square_distance(bk, p) > 1 and chess.square_rank(bk) > r
    return rnd_board(['K', 'P'], ['k'], tries=800000, cond=c).fen()
lesson('킹도 싸워요', '엔드게임에서는 킹이 강한 기물이 돼요. 내 킹이 폰 앞으로 나가 길을 열어 줘요.', [
    quiz('엔드게임의 킹', '기물이 거의 없는 엔드게임에서 킹은?', ['구석에 숨어요', '앞으로 나와 싸워요'], 1),
    play('킹으로 길을 열어 폰을 승격해요', kp_key(), 'promo', 1600, 30),
])
lesson('대립 (오포지션)', '두 킹이 한 칸을 사이에 두고 마주 보면, 그때 둘 차례가 아닌 쪽이 대립을 가졌다고 해요. 대립을 가진 킹이 상대 킹을 밀어내요.', [
    quiz('대립', '두 킹이 e4·e6에서 마주 보고 흑 차례예요. 대립을 가진 쪽은?', ['백', '흑'], 0, fen='8/8/4k3/8/4K3/8/8/8 b - - 0 1', why='둘 차례가 아닌 쪽이 대립을 가져요.'),
    quiz('대립 2', '같은 자리에서 백 차례라면 대립을 가진 쪽은?', ['백', '흑'], 1, fen='8/8/4k3/8/4K3/8/8/8 w - - 0 1'),
    play('대립을 이용해 폰을 승격해요', kp_key(), 'promo', 1600, 30),
])
lesson('킹과 폰 대 킹', '폰보다 킹이 앞서고, 폰 두 줄 앞(핵심 칸)에 킹이 서면 이겨요. 폰은 킹이 길을 연 뒤에 밀어요.', [
    play('폰을 승격해요', kp_key(), 'promo', 1600, 30), play('한 번 더 해 봐요', kp_key(), 'promo', 1600, 30),
])
lesson('룩으로 킹 가두기', '룩으로 줄을 막아 상대 킹을 좁은 곳에 가두고, 조금씩 줄을 줄여 가요.', [
    play('룩과 킹으로 체크메이트해요', kxk_play(['R']), 'mate', 1200, 60),
])
lesson('통과한 폰', '앞을 막는 상대 폰도, 옆줄에서 잡을 상대 폰도 없는 폰을 통과한 폰이라고 해요. 엔드게임에서 아주 강해요.', [
    quiz('통과한 폰', '통과한 폰이란?', ['앞과 옆줄에 막을 상대 폰이 없는 폰', '한 번 움직인 폰', '두 칸 나간 폰'], 0),
    play('통과한 폰을 밀어 승격해요', race(True), 'promo', 1600, 20),
])
lesson('퀸 빨리 메이트하기', '퀸으로 메이트할 때는 상대 킹과 나이트 한 번 뛴 거리에 퀸을 두며 따라가면 빨라요. 끝에 킹을 불러와요.', [
    play('퀸과 킹으로 체크메이트해요', kxk_play(['Q']), 'mate', 1600, 30),
])
lesson('비기는 법 알기', '불리할 때는 무승부도 좋은 결과예요. 기물 부족, 스테일메이트, 반복으로 비길 수 있어요.', [
    quiz('비길 수 있을까', '백 킹+나이트, 흑 킹만 남았어요. 결과는?', ['백 승리', '무승부'], 1, fen='4k3/8/8/8/8/5N2/8/4K3 w - - 0 1'),
    quiz('불리할 때', '지고 있을 때 노려 볼 만한 것은?', ['스테일메이트·반복', '빨리 기권'], 0),
])

# ===================== 8. 실전 =====================
sec('실전')
lesson('2수 메이트', '첫 수로 상대를 꼼짝 못 하게 만들고, 두 번째 수에 메이트해요. 상대가 어떤 수로 받아도 메이트가 있어야 해요.', [mate_n('2수 안에 체크메이트해요', f, 2) for f in m2_pick(3, lambda m: True)])
m3 = [e.split('|') for e in PZC['m3']['list'][:300]]
m3 = sorted(m3, key=lambda x: piece_count(x[0]))[:2]
def wv_line(f, ln):
    b = chess.Board(f)
    if b.turn == chess.WHITE: return white_view(f), ln
    out = []
    for u in ln:
        m = chess.Move.from_uci(u); out.append(chess.Move(chess.square_mirror(m.from_square), chess.square_mirror(m.to_square), m.promotion).uci())
    return white_view(f), out
m3v = [wv_line(f, ln.split(',')) for f, ln, n in m3]
for f, ln in m3v:
    b = chess.Board(f)
    for u in ln: b.push(chess.Move.from_uci(u))
    assert b.is_checkmate(), f
lesson('3수 메이트', '수가 길어지면 상대의 응수를 하나씩 따져 봐요. 체크로 시작하는 경우가 많아요.', [mate_n('3수 안에 체크메이트해요', f, 3, ln) for f, ln in m3v])
lesson('수를 고르는 순서', '수를 고를 때는 체크 → 잡기 → 위협 순서로 살펴보면 좋은 수를 놓치지 않아요.', [
    quiz('순서', '가장 먼저 살펴볼 수는?', ['체크', '폰 밀기', '킹 옮기기'], 0),
] + [move('가장 좋은 수를 찾아요', t['fen'], [t['u']]) for t in sorted([t for t in TAC if t['fen'] not in tused and t['gain'] >= 300], key=lambda t: piece_count(t['fen']))[:3]])
for t in LESSONS[-1]['steps']:
    if 'fen' in t: tused.add(t['fen'])
lesson('계획 세우기', '좋은 수가 안 보이면 가장 놀고 있는 기물을 좋은 자리로 옮겨요. 약한 상대 폰이나 열린 줄을 노리는 것도 좋은 계획이에요.', [
    quiz('놀고 있는 기물', '계획이 없을 때 해 볼 만한 것은?', ['가장 안 좋은 기물을 좋은 곳으로', '아무 폰이나 밀기'], 0),
    quiz('열린 줄', '폰이 하나도 없는 세로줄에는 어떤 기물을 두면 좋을까요?', ['룩', '나이트', '킹'], 0),
])
lesson('시간 관리', '시간이 있는 대국에서는 시계도 기물이에요. 쉬운 수는 빨리, 중요한 순간에는 시간을 써요.', [
    quiz('시간', '시간이 다 떨어지면?', ['그 사람이 져요', '무승부예요', '시간이 다시 채워져요'], 0, why='상대에게 메이트할 기물이 없으면 무승부예요.'),
    quiz('+2초', '"3분 +2초"에서 +2초는?', ['한 수 둘 때마다 2초를 더 받아요', '첫 수만 2초', '2초 안에 둬야 해요'], 0),
])
lesson('졸업 대국', '이제 배운 것을 모두 써 볼 시간이에요. AI와 한 판 둬서 이겨 봐요.', [
    play('AI(레이팅 600)를 이겨요', START, 'mate', 600, 300),
])
assert len(LESSONS) == 64, len(LESSONS)
# 섹션 정보 붙이기
for i, s in enumerate(SECS):
    end = SECS[i+1]['from'] if i+1 < len(SECS) else len(LESSONS)
    for j in range(s['from'], end): LESSONS[j]['sec'] = i
data = {'secs': [s['name'] for s in SECS], 'list': LESSONS}
head = '/* 레슨 64개: 체스룸이 직접 만든 설명과 문제. 판은 python-chess로 검사함. 일부 국면은 JWTC 10.7.0(MIT) 연습 대국·퍼즐에서 가져와 백 시점으로 바꿈 */\n'
open(OUT, 'w').write(head + 'window.LESSONS=' + json.dumps(data, ensure_ascii=False, separators=(',', ':')) + ';\n')
print('ok', len(LESSONS), sum(len(l['steps']) for l in LESSONS), 'tac', len(TAC))
import collections
print(collections.Counter(tg for t in TAC for tg in t['tags']))

"""Enzonic 用の起動ファイル(Startup Command / PY_FILE に `run.py` を指定するだけで動く)。

gunicorn を1ワーカー + 複数スレッドで起動する。
  ・ワーカーを増やすと、定期実行ジョブ(イベント・週替わりチャレンジ)が二重に動くので 1 のまま
  ・待ち受けるポートは、環境変数 PORT → SERVER_PORT(Enzonic のパネルが割り当てる値)の順に探す
  ・スレッド数は環境変数 WEB_THREADS で変えられる(既定 8)
"""
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
os.chdir(HERE)  # どこから起動されても app.py(app:app)が見つかるように

port = (os.environ.get('PORT') or os.environ.get('SERVER_PORT') or '3000').strip()
if not port.isdigit():
    sys.exit(f'PORT / SERVER_PORT の値が数字ではありません: {port!r}')
threads = (os.environ.get('WEB_THREADS') or '8').strip()
if not threads.isdigit():
    threads = '8'

args = [
    sys.executable, '-m', 'gunicorn',
    '-w', '1', '--threads', threads,
    '--timeout', '120', '--keep-alive', '30',
    '-b', f'0.0.0.0:{port}',
    'app:app',
]
print('▶ ' + ' '.join(args), flush=True)
os.execv(sys.executable, args)  # このプロセスを gunicorn に置き換える(停止の合図もそのまま届く)

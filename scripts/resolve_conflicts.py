# -*- coding: utf-8 -*-
"""变基冲突解析：改名块取 HEAD（鲸鱼娘游戏厅），其余块取 OURS（本提交功能改动）。
用法：python resolve_conflicts.py   然后 git add -A && git rebase --continue
"""
import io, re, subprocess, sys, os

os.chdir(r"C:\Users\Administrator\.zcode\workspace\default\bigbluefish")

def resolve_file(path):
    s = io.open(path, encoding='utf-8').read()
    pattern = re.compile(r"<<<<<<< HEAD\n(.*?)=======\n(.*?)>>>>>>> [^\n]*\n", re.S)
    unsure = []
    def repl(m):
        head, ours = m.group(1), m.group(2)
        # 两边都是"游戏厅"改名性质的块：取 HEAD（最新名字）
        if '游戏厅' in head and '游戏厅' in ours:
            return head
        # 其余视为功能性改动：取 OURS
        if head.strip() == ours.strip():
            return ours
        unsure.append((path, head[:80], ours[:80]))
        return ours
    resolved = pattern.sub(repl, s)
    if '<<<<<<<' in resolved:
        unsure.append((path, 'UNRESOLVED MARK LEFT', ''))
    io.open(path, 'w', encoding='utf-8', newline='\n').write(resolved)
    return unsure

for _ in range(30):
    r = subprocess.run(['git', 'diff', '--name-only', '--diff-filter=U'], capture_output=True, text=True)
    files = [f for f in r.stdout.split('\n') if f.strip()]
    if not files:
        print('no conflicts left in this round')
        break
    all_unsure = []
    for f in files:
        all_unsure += resolve_file(f)
    for u in all_unsure:
        print('UNSURE:', u)
    subprocess.run(['git', 'add', '-A'])
    c = subprocess.run(['git', '-c', 'core.editor=true', 'rebase', '--continue'], capture_output=True, text=True)
    out = (c.stdout + c.stderr).strip()
    print('rebase:', out.split('\n')[0] if out else '(clean)')
    if 'Successfully rebased' in out or 'successfully rebased' in out.lower():
        print('REBASE DONE')
        break
    if c.returncode != 0 and 'CONFLICT' not in out:
        print('rebase stopped (non-conflict):', out[:300])
        sys.exit(1)
print(subprocess.run(['git', 'status', '--short'], capture_output=True, text=True).stdout[:300])

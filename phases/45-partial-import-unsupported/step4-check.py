import io
a = io.open('CLAUDE.md', encoding='utf-8').read(); b = io.open('AGENTS.md', encoding='utf-8').read()
for prefix in ('| 도면 인식(로컬)', '| R17'):
    ra = [l for l in a.splitlines() if l.startswith(prefix)]
    rb = [l for l in b.splitlines() if l.startswith(prefix)]
    assert ra and ra == rb, (prefix, ra, rb)
adr = io.open('docs/ADR.md', encoding='utf-8').read()
assert '### ADR-047' in adr and 'ADR-048' not in adr
risks = io.open('docs/RISKS.md', encoding='utf-8').read()
assert 'R17' in risks
print('docs ok')

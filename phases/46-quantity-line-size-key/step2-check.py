import io
a = io.open('CLAUDE.md', encoding='utf-8').read(); b = io.open('AGENTS.md', encoding='utf-8').read()
ra = [l for l in a.splitlines() if l.startswith('| R17')]
rb = [l for l in b.splitlines() if l.startswith('| R17')]
assert ra and ra == rb and 'ADR-048' in ra[0], (ra, rb)
adr = io.open('docs/ADR.md', encoding='utf-8').read()
assert '### ADR-048' in adr and 'ADR-049' not in adr
risks = io.open('docs/RISKS.md', encoding='utf-8').read()
assert 'R17' in risks and 'ADR-048' in risks
print('docs ok')

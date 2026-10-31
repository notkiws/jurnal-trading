#!/usr/bin/env python3
"""Gabung index.html + style.css + app.js jadi satu file statis (site/index.html)."""
import pathlib, shutil, sys

src = pathlib.Path(__file__).parent / 'src'
out = pathlib.Path(__file__).parent / 'site'
out.mkdir(exist_ok=True)

html = (src / 'index.html').read_text()
css = (src / 'style.css').read_text()
js = (src / 'app.js').read_text()

html = html.replace('<link rel="stylesheet" href="style.css">', '<style>\n' + css + '\n</style>')
html = html.replace('<script src="app.js"></script>', '<script>\n' + js + '\n</script>')
(out / 'index.html').write_text(html)
(out / '.nojekyll').write_text('')
(out / '_headers').write_text("""/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: no-referrer
  X-Frame-Options: DENY
""")
print('site/index.html', round(len(html) / 1024, 1), 'KB')

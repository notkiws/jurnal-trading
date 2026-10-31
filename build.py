#!/usr/bin/env python3
"""Gabungkan src/index.html + style.css + app.js jadi satu file statis: index.html (root)."""
import pathlib

root = pathlib.Path(__file__).parent
src = root / 'src'

html = (src / 'index.html').read_text()
css = (src / 'style.css').read_text()
js = (src / 'app.js').read_text()

html = html.replace('<link rel="stylesheet" href="style.css">', '<style>\n' + css + '\n</style>')
html = html.replace('<script src="app.js"></script>', '<script>\n' + js + '\n</script>')
(root / 'index.html').write_text(html)
print('index.html', round(len(html) / 1024, 1), 'KB')

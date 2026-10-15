#!/usr/bin/env python3
"""Build browsable magnon guides from the repository's Markdown sources."""

import argparse
import html
import os
from pathlib import Path
import re
from urllib.parse import urlsplit, urlunsplit

from render_homepage import render_markdown


ROOT = Path(__file__).resolve().parents[3]


def rewrite_guide_links(rendered, source, sources):
    """Rewrite only local links to guides that this build actually renders."""
    def replace(match):
        url = urlsplit(html.unescape(match[1]))
        if url.scheme or url.netloc or not url.path.endswith('.md'):
            return match[0]
        if (source.parent / url.path).resolve() not in sources:
            return match[0]
        target = urlunsplit(('', '', str(Path(url.path).with_suffix('.html')), url.query, url.fragment))
        return 'href="' + html.escape(target, quote=True) + '"'

    return re.sub(r'href="([^"]+)"', replace, rendered)


def render_page(source, sources):
    prefix = Path(os.path.relpath(ROOT, source.parent)).as_posix() + '/'
    title = html.escape(source.read_text(encoding='utf-8').splitlines()[0].lstrip('# '))
    content = rewrite_guide_links(render_markdown(source), source, sources)
    links = [('index.html', 'Home'), ('phonon.html', 'Phonons'),
             ('magnon.html', 'Magnons'), ('exciton.html', 'Excitons'),
             ('structure.html', 'Structures')]
    navigation = ''.join(f'<li><a href="{prefix}{url}">{label}</a></li>' for url, label in links)
    return f'''<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>{title} — Phonon website</title>
    <link rel="icon" type="image/svg+xml" href="{prefix}favicon.svg">
    <link rel="stylesheet" href="{prefix}css/style.css">
    <link rel="stylesheet" href="{prefix}css/documentation.css">
</head>
<body>
    <nav aria-label="Site"><ul class="navigation">{navigation}</ul></nav>
    <main class="documentation">
        <nav class="documentation-links" aria-label="Magnon guides">
            <a href="{prefix}magnon.html">Back to magnon viewer</a>
            <a href="{prefix}doc/magnons/README.html">Viewer guide</a>
            <a href="{prefix}exporters/sunny/README.html">Sunny exporter</a>
            <a href="{prefix}exporters/spinw/README.html">SpinW exporter</a>
        </nav>
        {content}
    </main>
</body>
</html>
'''


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', default='build', help='Built website directory')
    output = Path(parser.parse_args().output).resolve()
    sources = {p.resolve() for directory in ['doc/magnons', 'exporters/sunny', 'exporters/spinw']
               for p in (ROOT / directory).glob('*.md')}
    for source in sorted(sources):
        destination = output / source.relative_to(ROOT).with_suffix('.html')
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_text(render_page(source, sources), encoding='utf-8')
    # Keep GitHub's README links as Markdown, but make their rendered homepage
    # equivalents navigate to the same HTML guides as the viewer.
    homepage = output / 'index.html'
    if homepage.exists():
        homepage.write_text(rewrite_guide_links(homepage.read_text(encoding='utf-8'),
                                               ROOT / 'README.md', sources), encoding='utf-8')
    print(f'Rendered {len(sources)} magnon guide pages in {output}')


if __name__ == '__main__':
    main()

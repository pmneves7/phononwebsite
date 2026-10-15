import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { JSDOM } from 'jsdom';

function read(relPath) {
  const absPath = path.join(process.cwd(), relPath);
  return fs.readFileSync(absPath, 'utf8');
}

describe('Build smoke tests', () => {
  it('produces minified bundle artifacts', () => {
    const requiredFiles = [
      'build/main.js',
      'build/main.js.map',
      'build/main.min.js',
      'build/main.min.js.map',
      'build/exciton.js',
      'build/exciton.js.map',
      'build/exciton.min.js',
      'build/exciton.min.js.map',
      'build/magnon.js',
      'build/magnon.js.map',
      'build/magnon.min.js',
      'build/magnon.min.js.map',
    ];

    for (const file of requiredFiles) {
      assert.ok(fs.existsSync(path.join(process.cwd(), file)), `Missing ${file}`);
    }
  });

  it('does not leak Node fs imports into browser bundle', () => {
    const mainJs = read('build/main.js');
    const mainMinJs = read('build/main.min.js');
    assert.ok(!mainJs.includes("from 'fs'"), 'build/main.js must not import fs');
    assert.ok(!mainMinJs.includes("from 'fs'"), 'build/main.min.js must not import fs');
  });

  it('uses minified production entrypoint', () => {
    const html = read('phonon.html');
    assert.ok(
      html.includes('<script src="main.min.js" type="module"></script>'),
      'phonon.html should load main.min.js'
    );
  });

  it('uses minified exciton entrypoint', () => {
    const html = read('exciton.html');
    assert.ok(
      html.includes('<script src="exciton.min.js" type="module"></script>'),
      'exciton.html should load exciton.min.js'
    );
  });

  it('ships the magnon entrypoint, examples, and export guides', () => {
    assert.ok(read('build/magnon.html').includes('<script src="magnon.min.js" type="module"></script>'));
    const examples = JSON.parse(read('build/data/magnons/models.json'));
    for (const example of examples) assert.ok(fs.existsSync(path.join('build', example.file)));
    for (const file of ['doc/magnons/FORMAT.md', 'exporters/sunny/README.md', 'exporters/spinw/README.md', 'exporters/magnopy/README.md']) {
      assert.ok(fs.existsSync(path.join('build', file)), `Missing magnon guide: ${file}`);
    }
    for (const file of fs.readdirSync('build/exporters', { recursive: true })) {
      assert.ok(!/(^|\/)(__pycache__|\.pytest_cache|[^/]+\.egg-info|build|dist|\.venv)(\/|$)/.test(file),
        `Local Python artifact must not be deployed: ${file}`);
    }
  });

  it('serves readable magnon export guides with working local navigation', () => {
    const buildRoot = path.resolve('build');
    const site = 'https://magnon-docs.test/';
    const documents = new Map();
    const document = file => {
      if (!documents.has(file)) documents.set(file, JSDOM.fragment(read(`build/${file}`)));
      return documents.get(file);
    };
    const checkLink = (file, href) => {
      const target = new URL(href, new URL(file, site));
      if (target.origin !== new URL(site).origin) return;
      const relative = decodeURIComponent(target.pathname).slice(1);
      const absolute = path.resolve(buildRoot, relative);
      assert.ok(absolute.startsWith(`${buildRoot}${path.sep}`), `${file}: link escapes build: ${href}`);
      assert.ok(fs.existsSync(absolute), `${file}: missing link target: ${href}`);
      if (target.hash) {
        assert.ok(document(relative).getElementById(decodeURIComponent(target.hash.slice(1))),
          `${file}: missing link fragment: ${href}`);
      }
    };

    const viewer = document('magnon.html');
    const guideLink = [...viewer.querySelectorAll('a[href]')].find(a => a.textContent === 'Export guide');
    assert.equal(guideLink?.getAttribute('href'), 'doc/magnons/README.html#export-a-calculation');
    checkLink('magnon.html', guideLink.getAttribute('href'));

    for (const solver of ['sunny', 'spinw', 'magnopy']) {
      const guide = document(`exporters/${solver}/README.html`);
      assert.match(guide.querySelector('h1')?.textContent || '', new RegExp(solver, 'i'));
      assert.ok([...guide.querySelectorAll('pre code')].some(code => code.textContent.includes('export_magnons(')),
        `${solver}: missing rendered export example`);
    }
    for (const directory of ['doc/magnons', 'exporters/sunny', 'exporters/spinw', 'exporters/magnopy']) {
      for (const source of fs.readdirSync(directory).filter(file => file.endsWith('.md'))) {
        const file = `${directory}/${source.replace(/\.md$/, '.html')}`;
        for (const link of document(file).querySelectorAll('[href]')) checkLink(file, link.getAttribute('href'));
      }
    }
    const homeLinks = [...document('index.html').querySelectorAll('a[href]')]
      .filter(link => /^(doc\/magnons|exporters\/(sunny|spinw|magnopy))\//.test(link.getAttribute('href')));
    assert.ok(homeLinks.length >= 4, 'Homepage must link to the magnon and all three exporter guides');
    for (const link of homeLinks) {
      assert.match(link.getAttribute('href'), /\.html(?:[?#]|$)/);
      checkLink('index.html', link.getAttribute('href'));
    }
  });

  it('keeps exciton datasets in the shared standard format', () => {
    const datasets = [
      'data/excitondb/bn/absorptionspectra.json',
      'data/excitondb/mos2/absorptionspectra.json',
      'data/excitondb/mote2/absorptionspectra.json',
    ];

    for (const dataset of datasets) {
      const data = JSON.parse(read(dataset));
      assert.ok(Array.isArray(data['E/ev[1]']), `${dataset} should provide E/ev[1]`);
      assert.ok(Array.isArray(data['EPS-Im[2]']), `${dataset} should provide EPS-Im[2]`);
      assert.ok(Array.isArray(data['EPS-Re[3]']), `${dataset} should provide EPS-Re[3]`);
      assert.ok(Array.isArray(data['EPSo-Im[4]']), `${dataset} should provide EPSo-Im[4]`);
      assert.ok(Array.isArray(data['EPSo-Re[5]']), `${dataset} should provide EPSo-Re[5]`);
      assert.ok(Array.isArray(data.lattice), `${dataset} should provide a primitive lattice`);
      assert.ok(Array.isArray(data.supercell_lattice), `${dataset} should provide a supercell lattice for the grid`);
      assert.ok(!('eps' in data), `${dataset} should not use the legacy eps matrix format`);
    }
  });
});

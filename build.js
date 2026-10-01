#!/usr/bin/env node
/**
 * Builds dist/index.html from template.html + content.md.
 * No dependencies — content.md uses a small hand-rolled format:
 *   # Section          -> starts a section (maps to a key like "chapter01")
 *   ## Entry            -> starts a repeating item inside the "Timeline" section
 *   Key: value          -> a single- or multi-line field (only known keys split fields)
 *   Blank line            separates paragraphs inside Body/Blurb fields
 */

const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const CONTENT_PATH = path.join(ROOT, 'content.md');
const TEMPLATE_PATH = path.join(ROOT, 'template.html');
const DIST_DIR = path.join(ROOT, 'dist');

const KNOWN_KEYS = new Set([
  'Tagline', 'Age', 'School', 'Stat',
  'Label', 'Title', 'Name', 'Instrument',
  'Quote', 'Quote-By',
  'Body',
  'Eyebrow', 'Subtitle',
  'Line', 'Meta',
  'Date', 'Link', 'Easter-Egg', 'Undated',
  'Blurb', 'Tags',
]);

const SECTION_TO_KEY = {
  'Hero': 'hero',
  'Chapter 01': 'chapter01',
  'Chapter 02': 'chapter02',
  'Chapter 03': 'chapter03',
  'Chapter 04': 'chapter04',
  'Chapter 05': 'chapter05',
  'Volume': 'volume',
  'Colophon': 'colophon',
  'Timeline': 'timeline',
};

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function inline(str) {
  // escape, then allow **bold**
  return escapeHtml(str).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
}

function paragraphs(raw) {
  if (!raw) return '';
  return raw
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${inline(p.replace(/\n/g, ' '))}</p>`)
    .join('\n');
}

// Parses a block of lines into { Key: rawMultilineString }
function parseFields(lines) {
  const fields = {};
  let currentKey = null;
  let currentLines = [];

  function flush() {
    if (currentKey) {
      fields[currentKey] = currentLines.join('\n').trim();
    }
    currentLines = [];
  }

  for (const line of lines) {
    const match = line.match(/^([A-Za-z][A-Za-z-]*):\s?(.*)$/);
    if (match && KNOWN_KEYS.has(match[1])) {
      flush();
      currentKey = match[1];
      currentLines = [match[2]];
    } else if (currentKey) {
      currentLines.push(line);
    }
  }
  flush();
  return fields;
}

function parseContent(raw) {
  const lines = raw.replace(/\r\n/g, '\n').split('\n');
  const sections = {};
  let currentSectionKey = null;
  let currentSectionLines = [];
  let timelineEntryBlocks = [];
  let inTimeline = false;
  let currentEntryLines = null;

  function flushSection() {
    if (!currentSectionKey) return;
    if (currentSectionKey === 'timeline') {
      if (currentEntryLines) {
        timelineEntryBlocks.push(currentEntryLines);
        currentEntryLines = null;
      }
      sections.timeline = timelineEntryBlocks.map((block) => parseFields(block));
    } else {
      sections[currentSectionKey] = parseFields(currentSectionLines);
    }
    currentSectionLines = [];
  }

  for (const line of lines) {
    const h1 = line.match(/^#\s+(.+)$/);
    const h2 = line.match(/^##\s+Entry\s*$/);

    if (h1) {
      flushSection();
      const name = h1[1].trim();
      currentSectionKey = SECTION_TO_KEY[name] || name.toLowerCase().replace(/\s+/g, '');
      inTimeline = currentSectionKey === 'timeline';
      currentEntryLines = null;
      timelineEntryBlocks = [];
      continue;
    }

    if (inTimeline && h2) {
      if (currentEntryLines) timelineEntryBlocks.push(currentEntryLines);
      currentEntryLines = [];
      continue;
    }

    if (inTimeline) {
      if (currentEntryLines) currentEntryLines.push(line);
    } else {
      currentSectionLines.push(line);
    }
  }
  flushSection();
  return sections;
}

function renderTimelineEntries(entries) {
  return entries
    .map((e) => {
      const isUndated = (e.Undated || '').trim().toLowerCase() === 'true';
      const easterEgg = e['Easter-Egg']
        ? `\n      <details>\n        <summary>Reveal the intended easter egg</summary>\n        <p>${inline(e['Easter-Egg'])}</p>\n      </details>`
        : '';
      return `    <article class="entry${isUndated ? ' undated' : ''}">
      <div class="entry-date">${inline(e.Date || '')}</div>
      <h3 class="entry-title">${inline(e.Title || '')}</h3>
      ${paragraphs(e.Blurb || '')}${easterEgg}
      <a class="entry-link" href="${escapeHtml(e.Link || '#')}" target="_blank" rel="noopener">Read the doc &rarr;</a>
    </article>`;
    })
    .join('\n');
}

function renderTags(rawTags) {
  if (!rawTags) return '';
  return rawTags
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean)
    .map((t) => `<span class="tag">${inline(t)}</span>`)
    .join('\n        ');
}

function get(obj, key, fallback) {
  return obj && obj[key] !== undefined ? obj[key] : fallback || '';
}

function renderNavItems(data) {
  const items = [
    { id: 'chapter-01', num: '01', label: get(data.chapter01, 'Label', 'Profile') },
    { id: 'chapter-02', num: '02', label: get(data.chapter02, 'Label', 'The Vow') },
    { id: 'chapter-03', num: '03', label: get(data.chapter03, 'Label', 'Scars') },
    { id: 'chapter-04', num: '04', label: get(data.chapter04, 'Label', 'The Craft') },
    { id: 'chapter-05', num: '05', label: get(data.chapter05, 'Label', 'Beyond the Page') },
    { id: 'bibliography', num: 'II', label: get(data.volume, 'Title', 'The Bibliography') },
    { id: 'colophon', num: '—', label: 'Colophon' },
  ];
  return items
    .map(
      (item) =>
        `    <li><a href="#${item.id}" data-nav-link><span class="nav-list-num">${item.num}</span><span class="nav-list-label">${inline(item.label)}</span></a></li>`
    )
    .join('\n');
}

function build() {
  const raw = fs.readFileSync(CONTENT_PATH, 'utf8');
  const data = parseContent(raw);
  let html = fs.readFileSync(TEMPLATE_PATH, 'utf8');

  const simpleReplacements = {
    'hero.tagline': inline(get(data.hero, 'Tagline')),
    'hero.age': inline(get(data.hero, 'Age')),
    'hero.school': inline(get(data.hero, 'School')),
    'hero.stat': inline(get(data.hero, 'Stat')),

    'chapter01.label': inline(get(data.chapter01, 'Label')),
    'chapter01.title': inline(get(data.chapter01, 'Title')),
    'chapter01.name': inline(get(data.chapter01, 'Name')),
    'chapter01.instrument': inline(get(data.chapter01, 'Instrument')),
    'chapter01.body': paragraphs(get(data.chapter01, 'Body')),
    'chapter01.quote': inline(get(data.chapter01, 'Quote')),
    'chapter01.quote_by': inline(get(data.chapter01, 'Quote-By')),

    'chapter02.label': inline(get(data.chapter02, 'Label')),
    'chapter02.title': inline(get(data.chapter02, 'Title')),
    'chapter02.body': paragraphs(get(data.chapter02, 'Body')),
    'chapter02.quote': inline(get(data.chapter02, 'Quote')),
    'chapter02.quote_by': inline(get(data.chapter02, 'Quote-By')),

    'chapter03.label': inline(get(data.chapter03, 'Label')),
    'chapter03.title': inline(get(data.chapter03, 'Title')),
    'chapter03.body': paragraphs(get(data.chapter03, 'Body')),
    'chapter03.quote': inline(get(data.chapter03, 'Quote')),
    'chapter03.quote_by': inline(get(data.chapter03, 'Quote-By')),

    'chapter04.label': inline(get(data.chapter04, 'Label')),
    'chapter04.title': inline(get(data.chapter04, 'Title')),
    'chapter04.body': paragraphs(get(data.chapter04, 'Body')),

    'chapter05.label': inline(get(data.chapter05, 'Label')),
    'chapter05.title': inline(get(data.chapter05, 'Title')),
    'chapter05.body': paragraphs(get(data.chapter05, 'Body')),
    'chapter05.tags': renderTags(get(data.chapter05, 'Tags')),

    'volume.eyebrow': inline(get(data.volume, 'Eyebrow')),
    'volume.title': inline(get(data.volume, 'Title')),
    'volume.subtitle': inline(get(data.volume, 'Subtitle')),

    'colophon.line': inline(get(data.colophon, 'Line')),
    'colophon.meta': get(data.colophon, 'Meta'), // allows the <br/> in content.md

    'timeline.entries': renderTimelineEntries(data.timeline || []),
    'nav.items': renderNavItems(data),
  };

  for (const [token, value] of Object.entries(simpleReplacements)) {
    html = html.split(`{{${token}}}`).join(value);
  }

  if (!fs.existsSync(DIST_DIR)) fs.mkdirSync(DIST_DIR, { recursive: true });
  fs.writeFileSync(path.join(DIST_DIR, 'index.html'), html, 'utf8');

  const photosSrc = path.join(ROOT, 'photos');
  const photosDist = path.join(DIST_DIR, 'photos');
  if (fs.existsSync(photosSrc)) {
    fs.mkdirSync(photosDist, { recursive: true });
    for (const file of fs.readdirSync(photosSrc)) {
      fs.copyFileSync(path.join(photosSrc, file), path.join(photosDist, file));
    }
  }

  console.log('Built dist/index.html + dist/photos/');
}

build();

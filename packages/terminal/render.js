export function wrap(text, width) {
  if (![40, 80].includes(width) && width !== 39) throw new Error('Unsupported terminal width.');
  // A terminal cell is one printable ASCII character, including imported labels.
  const clean = String(text).replace(/[–—]/g, '-').replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/·/g, '/').replace(/×/g, 'x').replace(/÷/g, '/').normalize('NFKD').replace(/[^\x20-\x7e\n]/g, '?');
  const lines = [];
  for (let line of clean.split('\n')) {
    while (line.length > width) {
      let cut = line.lastIndexOf(' ', width);
      if (cut < 1) cut = width;
      lines.push(line.slice(0, cut)); line = line.slice(cut).trimStart();
    }
    lines.push(line);
  }
  return lines;
}

export function renderView(view, width) {
  const lines = ['='.repeat(width), ...wrap(view.title, width), '='.repeat(width)];
  for (const row of view.rows) {
    if (width === 80 && row.length === 2) {
      const left = wrap(row[0], 39), right = wrap(row[1], 39);
      for (let i = 0; i < Math.max(left.length, right.length); i++) lines.push((left[i] ?? '').padEnd(40) + (right[i] ?? ''));
    } else for (const cell of row) lines.push(...wrap(cell, width));
  }
  for (const line of view.lines) lines.push(...wrap(line, width));
  if (view.advice?.length) {
    lines.push('', view.adviceTitle || 'ADVISOR');
    for (const line of view.advice) lines.push(...wrap(`* ${line}`, width));
  }
  return lines.join('\n');
}

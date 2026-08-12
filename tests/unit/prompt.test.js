// tests/unit/prompt.test.js - pure parseCommand() logic (no DOM needed).
const { parseCommand } = require('../../app/prompt.js');

const m = {
  posts: [{ slug: 'proxmox-lab', title: 'P' }],
  projects: [{ slug: 'ha-proxmox', title: 'H' }],
};

test('nav commands', () => {
  expect(parseCommand('open posts', m)).toEqual({ kind: 'nav', url: '/posts.html' });
  expect(parseCommand('cd projects', m)).toEqual({ kind: 'nav', url: '/projects.html' });
  expect(parseCommand('cat proxmox-lab', m)).toEqual({ kind: 'nav', url: '/posts/proxmox-lab.html' });
  expect(parseCommand('whoami', m)).toEqual({ kind: 'nav', url: '/about.html' });
});

test('ls prints slugs', () => {
  expect(parseCommand('ls posts', m).lines.join(' ')).toContain('proxmox-lab');
});

test('unknown command', () => {
  expect(parseCommand('frobnicate --now', m).lines[0]).toMatch(/command not found/);
});

describe('easter eggs', () => {
  test('sudo is denied, with attitude', () => {
    expect(parseCommand('sudo rm -rf /', m).lines[0]).toMatch(/not in the sudoers file/);
  });
  test('sudo hire lucas grants rainbow permission', () => {
    const r = parseCommand('sudo hire lucas', m);
    expect(r.lines[0]).toMatch(/permission granted/);
    expect(r.cls).toContain('lolcat');
  });
  test('rm hits the read-only filesystem', () => {
    expect(parseCommand('rm -rf /', m).lines[0]).toMatch(/read-only filesystem/);
  });
  test('neofetch goes to about', () => {
    expect(parseCommand('neofetch', m)).toEqual({ kind: 'nav', url: '/about.html' });
  });
  test('fortune always prints something', () => {
    for (let i = 0; i < 10; i++) expect(parseCommand('fortune', m).lines[0].length).toBeGreaterThan(0);
  });
  test('eggs lists the fun commands', () => {
    const out = parseCommand('eggs', m).lines.join('\n');
    for (const c of ['sudo hire lucas', 'fortune', 'coffee', 'sl', 'cmatrix']) expect(out).toContain(c);
  });
  test('help advertises eggs and ctrl+/', () => {
    const out = parseCommand('help', m).lines.join('\n');
    expect(out).toContain('eggs');
    expect(out).toContain('ctrl+/');
  });
  test('sl and coffee ride the rainbow; cmatrix knows neo', () => {
    expect(parseCommand('sl', m).cls).toContain('lolcat');
    expect(parseCommand('coffee', m).cls).toContain('lolcat');
    expect(parseCommand('cmatrix', m).lines[0]).toMatch(/neo/);
  });
  test('man lucas has a manual; man other does not', () => {
    expect(parseCommand('man lucas', m).lines.join('\n')).toMatch(/LUCAS\(1\)/);
    expect(parseCommand('man tar', m).lines[0]).toMatch(/No manual entry/);
  });
});

test('contact starts wizard; clear clears', () => {
  expect(parseCommand('contact', m)).toEqual({ kind: 'wizard' });
  expect(parseCommand('clear', m)).toEqual({ kind: 'clear' });
});

// Additional coverage beyond the brief's exact cases.
describe('parseCommand extras', () => {
  test('open resolves other workspace names', () => {
    expect(parseCommand('open about', m)).toEqual({ kind: 'nav', url: '/about.html' });
    expect(parseCommand('open roadmap', m)).toEqual({ kind: 'nav', url: '/roadmap.html' });
    expect(parseCommand('open contact', m)).toEqual({ kind: 'nav', url: '/contact.html' });
    expect(parseCommand('open index', m)).toEqual({ kind: 'nav', url: '/index.html' });
    expect(parseCommand('cd home', m)).toEqual({ kind: 'nav', url: '/index.html' });
  });

  test('open/cd resolves a project slug', () => {
    expect(parseCommand('open ha-proxmox', m)).toEqual({ kind: 'nav', url: '/projects/ha-proxmox.html' });
    expect(parseCommand('cd ha-proxmox', m)).toEqual({ kind: 'nav', url: '/projects/ha-proxmox.html' });
  });

  test('cat falls back to a project slug', () => {
    expect(parseCommand('cat ha-proxmox', m)).toEqual({ kind: 'nav', url: '/projects/ha-proxmox.html' });
  });

  test('open unknown target prints an error, does not throw', () => {
    const r = parseCommand('open nope', m);
    expect(r.kind).toBe('print');
    expect(r.lines[0]).toMatch(/no such file or directory/i);
  });

  test('cat unknown slug prints an error', () => {
    const r = parseCommand('cat nope', m);
    expect(r.kind).toBe('print');
    expect(r.lines[0]).toMatch(/no such file or directory/i);
  });

  test('ls projects lists project slugs', () => {
    expect(parseCommand('ls projects', m).lines.join(' ')).toContain('ha-proxmox');
  });

  test('ls with no args lists workspaces', () => {
    const r = parseCommand('ls', m);
    expect(r.kind).toBe('print');
    expect(r.lines.join(' ')).toMatch(/posts/);
  });

  test('help prints a command list', () => {
    const r = parseCommand('help', m);
    expect(r.kind).toBe('print');
    expect(r.lines.length).toBeGreaterThan(0);
  });

  test('status returns status kind', () => {
    expect(parseCommand('status', m)).toEqual({ kind: 'status' });
  });

  test('command word is trimmed and lowercased', () => {
    expect(parseCommand('  WHOAMI  ', m)).toEqual({ kind: 'nav', url: '/about.html' });
  });

  test('empty input is a no-op print', () => {
    expect(parseCommand('', m)).toEqual({ kind: 'print', lines: [] });
  });

  test('parseCommand is pure - no globals touched, safe under Node', () => {
    expect(() => parseCommand('help', m)).not.toThrow();
  });
});

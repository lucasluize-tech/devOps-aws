// tests/unit/prompt.test.js - pure parseCommand() logic (no DOM needed).
const { parseCommand, completeCommand } = require('../../app/prompt.js');

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

test('cd .. goes up one level; cd - goes back; cd ~ goes home', () => {
  expect(parseCommand('cd ..', m, '/posts/proxmox-lab.html')).toEqual({ kind: 'nav', url: '/posts.html' });
  expect(parseCommand('cd ..', m, '/projects/ha-proxmox.html')).toEqual({ kind: 'nav', url: '/projects.html' });
  expect(parseCommand('cd ..', m, '/about.html')).toEqual({ kind: 'nav', url: '/index.html' });
  expect(parseCommand('cd -', m)).toEqual({ kind: 'back' });
  expect(parseCommand('cd ~', m)).toEqual({ kind: 'nav', url: '/index.html' });
});

describe('completeCommand (tab)', () => {
  test('completes a unique command with a trailing space', () => {
    expect(completeCommand('op', m)).toEqual({ value: 'open ' });
  });
  test('extends ambiguous input to the longest common prefix', () => {
    expect(completeCommand('c', m).candidates).toEqual(['cancel', 'cat', 'cd', 'clear', 'compose', 'contact']);
  });
  test('completes slugs and workspaces after open/cd/cat', () => {
    expect(completeCommand('open prox', m)).toEqual({ value: 'open proxmox-lab' });
    expect(completeCommand('cat ha-', m)).toEqual({ value: 'cat ha-proxmox' });
    expect(completeCommand('cd ro', m)).toEqual({ value: 'cd roadmap' });
  });
  test('extends an empty arg to the common prefix, then lists candidates', () => {
    expect(completeCommand('ls ', m)).toEqual({ value: 'ls p' });
    expect(completeCommand('ls p', m).candidates).toEqual(['posts', 'projects']);
  });
  test('returns null with no matches or empty input', () => {
    expect(completeCommand('zz', m)).toBeNull();
    expect(completeCommand('  ', m)).toBeNull();
  });
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
  test('man lucas opens the about page; man other does not', () => {
    expect(parseCommand('man lucas', m)).toEqual({ kind: 'nav', url: '/about.html' });
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

describe('contact vocabulary', () => {
  const m = { posts: [], projects: [] };

  test('mail lucas navigates and mail -s prefills subject', () => {
    expect(parseCommand('mail lucas', m, '~')).toEqual({ kind: 'mail' });
    expect(parseCommand('mail -s "SRE role" lucas', m, '~'))
      .toEqual({ kind: 'mail', subject: 'SRE role' });
  });

  test('set parses field + rest-of-line value, quotes optional', () => {
    expect(parseCommand('set subject Platform Engineer role', m, '~/contact'))
      .toEqual({ kind: 'draft-set', field: 'subject', value: 'Platform Engineer role' });
    expect(parseCommand('set email j@co.com', m, '~/contact'))
      .toEqual({ kind: 'draft-set', field: 'email', value: 'j@co.com' });
    expect(parseCommand('set bogus x', m, '~/contact').kind).toBe('print');
  });

  test('draft/set/send/cancel are cwd-gated to ~/contact', () => {
    for (const c of ['draft', 'set subject x', 'send', 'cancel']) {
      const r = parseCommand(c, m, '~/posts');
      expect(r.kind).toBe('print');
      expect(r.lines[0]).toContain('cd contact');
    }
    expect(parseCommand('draft', m, '~/contact')).toEqual({ kind: 'draft-show' });
    expect(parseCommand('send', m, '~/contact')).toEqual({ kind: 'draft-send' });
    expect(parseCommand('cancel', m, '~/contact')).toEqual({ kind: 'draft-cancel' });
  });

  test('easter eggs: ssh and ping', () => {
    expect(parseCommand('ssh lucas@devops', m, '~').lines[0])
      .toBe("Permission denied (publickey). Try 'mail lucas' instead.");
    expect(parseCommand('ping lucas', m, '~').lines.join(' ')).toContain('0% packet loss');
  });

  test('completion covers mail, set fields, draft verbs', () => {
    // completeCommand returns { value } or { candidates }, not an array/string,
    // so check .value directly rather than toContain on the whole object.
    expect(completeCommand('mail lu', m).value).toBe('mail lucas');
    expect(completeCommand('set sub', m).value).toBe('set subject');
    expect(completeCommand('dra', m).value).toBe('draft ');
  });
});

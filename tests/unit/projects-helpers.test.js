/**
 * @jest-environment jsdom
 */
const { renderCategoryTag, renderStatusPill } = require('../../utils');

describe('renderCategoryTag', () => {
  it('appends a span.category-tag with the category text', () => {
    const container = document.createElement('div');
    renderCategoryTag('Infra', container);
    const span = container.querySelector('span.category-tag');
    expect(span).not.toBeNull();
    expect(span.textContent).toBe('Infra');
  });

  it('uses textContent (no HTML injection)', () => {
    const container = document.createElement('div');
    renderCategoryTag('<img src=x onerror=alert(1)>', container);
    expect(container.innerHTML).not.toMatch(/<img/);
  });
});

describe('renderStatusPill', () => {
  const cases = [
    ['in production', 'status-production'],
    ['published',     'status-published'],
    ['maintained',    'status-maintained'],
    ['archived',      'status-archived'],
  ];
  cases.forEach(([status, cls]) => {
    it(`maps "${status}" to .${cls}`, () => {
      const container = document.createElement('div');
      renderStatusPill(status, container);
      const span = container.querySelector('span.status-pill');
      expect(span).not.toBeNull();
      expect(span.classList.contains(cls)).toBe(true);
      expect(span.textContent).toBe(status);
    });
  });
});

const { renderTechChips } = require('../../utils');

describe('renderTechChips', () => {
  it('renders one .tech-chip per item in card variant', () => {
    const container = document.createElement('div');
    renderTechChips(['Proxmox', 'Debian', 'Bash'], container, { variant: 'card' });
    const chips = container.querySelectorAll('.tech-chip');
    expect(chips.length).toBe(3);
    expect(chips[0].textContent).toBe('Proxmox');
  });

  it('renders a single .tech-list with "·" separator in detail variant', () => {
    const container = document.createElement('div');
    renderTechChips(['Proxmox', 'Debian', 'Bash'], container, { variant: 'detail' });
    const list = container.querySelector('.tech-list');
    expect(list).not.toBeNull();
    expect(list.textContent).toBe('Proxmox · Debian · Bash');
  });

  it('renders nothing when techArray is empty', () => {
    const container = document.createElement('div');
    renderTechChips([], container, { variant: 'card' });
    expect(container.children.length).toBe(0);
  });
});

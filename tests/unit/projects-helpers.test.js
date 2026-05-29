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

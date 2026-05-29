/**
 * @jest-environment jsdom
 */
const { renderScreenshotGallery } = require('../../utils');

describe('renderScreenshotGallery', () => {
  it('renders one figure per screenshot with lazy loading', () => {
    const container = document.createElement('div');
    renderScreenshotGallery(
      [
        { file: 'a.png', caption: 'A' },
        { file: 'b.png', caption: 'B' },
      ],
      'my-slug',
      container
    );
    const figures = container.querySelectorAll('figure');
    expect(figures.length).toBe(2);
    figures.forEach((fig) => {
      expect(fig.querySelector('img').getAttribute('loading')).toBe('lazy');
    });
  });

  it('builds src as projects/images/<slug>/<file>', () => {
    const container = document.createElement('div');
    renderScreenshotGallery([{ file: 'arch.png', caption: 'x' }], 'foo', container);
    const img = container.querySelector('img');
    expect(img.getAttribute('src')).toBe('projects/images/foo/arch.png');
  });

  it('renders caption text inside figcaption', () => {
    const container = document.createElement('div');
    renderScreenshotGallery([{ file: 'a.png', caption: 'My caption' }], 'slug', container);
    expect(container.querySelector('figcaption').textContent).toBe('My caption');
  });

  it('renders no figcaption when caption is missing', () => {
    const container = document.createElement('div');
    renderScreenshotGallery([{ file: 'a.png' }], 'slug', container);
    expect(container.querySelector('figcaption')).toBeNull();
    expect(container.querySelector('figure')).not.toBeNull();
  });

  it('skips entries with invalid file extensions', () => {
    const container = document.createElement('div');
    renderScreenshotGallery(
      [
        { file: 'a.png', caption: 'good' },
        { file: 'evil.exe', caption: 'bad' },
      ],
      'slug',
      container
    );
    expect(container.querySelectorAll('figure').length).toBe(1);
  });

  it('renders nothing when screenshots is empty or undefined', () => {
    const container1 = document.createElement('div');
    renderScreenshotGallery([], 'slug', container1);
    expect(container1.children.length).toBe(0);

    const container2 = document.createElement('div');
    renderScreenshotGallery(undefined, 'slug', container2);
    expect(container2.children.length).toBe(0);
  });
});

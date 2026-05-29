const { splitBodyByH2 } = require('../../utils');

const sample = `Intro line.

## Why
why prose

## Architecture
arch prose

## CIA
cia prose

## Notes
notes prose`;

describe('splitBodyByH2', () => {
  it('identifies all four expected H2 sections', () => {
    const sections = splitBodyByH2(sample);
    expect(sections.why).toMatch(/why prose/);
    expect(sections.architecture).toMatch(/arch prose/);
    expect(sections.cia).toMatch(/cia prose/);
    expect(sections.notes).toMatch(/notes prose/);
  });

  it('returns empty strings for missing sections without crashing', () => {
    const sections = splitBodyByH2('Just intro, no H2 sections.');
    expect(sections.why).toBe('');
    expect(sections.architecture).toBe('');
    expect(sections.cia).toBe('');
    expect(sections.notes).toBe('');
  });

  it('reports galleryAfter = "architecture" when present', () => {
    const sections = splitBodyByH2(sample);
    expect(sections.galleryAfter).toBe('architecture');
  });

  it('reports galleryAfter = "why" when Architecture is missing but Why is present', () => {
    const md = `## Why\nwhy only\n\n## CIA\ncia`;
    const sections = splitBodyByH2(md);
    expect(sections.galleryAfter).toBe('why');
  });

  it('reports galleryAfter = "top" when both Why and Architecture are missing', () => {
    const md = `Some text only.`;
    const sections = splitBodyByH2(md);
    expect(sections.galleryAfter).toBe('top');
  });
});

const { validateProject } = require('../../utils');

const validProject = {
  title: 'Test',
  slug: 'test',
  category: 'Infra',
  status: 'in production',
  goal: 'one liner',
  visibility: 'public',
  date: '2026-05-28',
  tech_stack: ['x'],
};

describe('validateProject', () => {
  it('accepts a fully valid project front-matter object', () => {
    expect(validateProject(validProject)).toEqual({ ok: true, errors: [] });
  });

  describe('required fields', () => {
    const required = ['title', 'slug', 'category', 'status', 'goal', 'visibility', 'date', 'tech_stack'];
    required.forEach((field) => {
      it(`rejects when "${field}" is missing`, () => {
        const { [field]: _omit, ...partial } = validProject;
        const result = validateProject(partial);
        expect(result.ok).toBe(false);
        expect(result.errors.join(' ')).toMatch(field);
      });
    });
  });

  describe('enum validation', () => {
    it('rejects invalid category', () => {
      const result = validateProject({ ...validProject, category: 'Bogus' });
      expect(result.ok).toBe(false);
      expect(result.errors.join(' ')).toMatch(/category/);
    });
    it('rejects invalid status', () => {
      const result = validateProject({ ...validProject, status: 'shipped' });
      expect(result.ok).toBe(false);
      expect(result.errors.join(' ')).toMatch(/status/);
    });
    it('rejects invalid visibility', () => {
      const result = validateProject({ ...validProject, visibility: 'hidden' });
      expect(result.ok).toBe(false);
      expect(result.errors.join(' ')).toMatch(/visibility/);
    });
  });

  it('accepts tech_stack as an empty array (key must exist, may be empty)', () => {
    const result = validateProject({ ...validProject, tech_stack: [] });
    expect(result.ok).toBe(true);
  });

  it('rejects tech_stack that is not an array', () => {
    const result = validateProject({ ...validProject, tech_stack: 'Python' });
    expect(result.ok).toBe(false);
    expect(result.errors.join(' ')).toMatch(/tech_stack/);
  });
});

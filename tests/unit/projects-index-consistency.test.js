const fs = require('fs');
const path = require('path');
const matter = require('gray-matter');

describe('projects/index.json consistency', () => {
  const projectsDir = path.join(__dirname, '..', '..', 'projects');
  const indexPath = path.join(projectsDir, 'index.json');

  it('includes every markdown project slug in projects/index.json', () => {
    const indexEntries = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
    const indexSlugs = new Set(indexEntries.map((entry) => entry.slug));

    const markdownFiles = fs
      .readdirSync(projectsDir)
      .filter((file) => file.endsWith('.md'));

    const missingSlugs = [];

    for (const fileName of markdownFiles) {
      const markdownPath = path.join(projectsDir, fileName);
      const markdownContent = fs.readFileSync(markdownPath, 'utf8');
      const { data } = matter(markdownContent);
      const slug = data.slug;

      if (!slug || !indexSlugs.has(slug)) {
        missingSlugs.push(fileName);
      }
    }

    expect(missingSlugs).toEqual([]);
  });

  it('does not include slugs in projects/index.json without a matching markdown file', () => {
    const indexEntries = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
    const markdownSlugs = new Set(
      fs
        .readdirSync(projectsDir)
        .filter((file) => file.endsWith('.md'))
        .map((file) => {
          const markdownPath = path.join(projectsDir, file);
          const markdownContent = fs.readFileSync(markdownPath, 'utf8');
          const { data } = matter(markdownContent);
          return data.slug;
        })
        .filter(Boolean)
    );

    const missingFiles = indexEntries
      .map((entry) => entry.slug)
      .filter((slug) => !markdownSlugs.has(slug));

    expect(missingFiles).toEqual([]);
  });
});

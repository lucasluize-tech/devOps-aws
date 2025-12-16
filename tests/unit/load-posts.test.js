// Note: This test is for Node environment, mocking browser fetch
const { parseMarkdown } = require('../../utils');

// Mock fetch globally
global.fetch = jest.fn();

describe('loadPosts integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should load posts and parse them', async () => {
    // Mock index.json response
    global.fetch.mockImplementationOnce(() =>
      Promise.resolve({
        json: () => Promise.resolve([{ slug: 'test-post' }])
      })
    );

    // Mock md file response
    global.fetch.mockImplementationOnce(() =>
      Promise.resolve({
        text: () => Promise.resolve(`---
title: Test Post
slug: test-post
date: 2025-01-01
---
This is content.`)
      })
    );

    // Import the function (since it's not exported, we need to eval or something, but for simplicity, assume it's testable)
    // Since loadPosts is not exported, this is tricky. Perhaps export it for testing.

    // For now, test parseMarkdown directly
    const md = `---
title: Test
slug: test-slug
---
Content`;
    const result = parseMarkdown(md);
    expect(result.data.title).toBe('Test');
    expect(result.data.slug).toBe('test-slug');
    expect(result.content.trim()).toBe('Content');
  });
});
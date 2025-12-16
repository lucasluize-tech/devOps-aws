const { parseMarkdown } = require('../utils');

// Unit test for loadPosts (mocking fetch)
jest.mock('node-fetch', () => jest.fn());
const fetch = require('node-fetch');

describe('loadPosts', () => {
  it('should load and parse posts from index.json', async () => {
    fetch.mockImplementationOnce(() =>
      Promise.resolve({
        json: () => Promise.resolve([{ slug: 'test' }])
      })
    ).mockImplementationOnce(() =>
      Promise.resolve({
        text: () => Promise.resolve(`---
title: Test
slug: test
---
Content`)
      })
    );

    const posts = await loadPosts();
    expect(posts.length).toBe(1);
    expect(posts[0].data.slug).toBe('test');
  });
});
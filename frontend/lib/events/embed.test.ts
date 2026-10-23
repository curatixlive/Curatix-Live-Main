import { describe, expect, it } from 'vitest';
import { safeEmbedSrc } from './embed';

describe('safeEmbedSrc', () => {
  it('accepts the YouTube embed the backend builds, and rebuilds the query', () => {
    expect(safeEmbedSrc('https://www.youtube.com/embed/abcdefghijk')).toBe(
      'https://www.youtube.com/embed/abcdefghijk?autoplay=1&rel=0&playsinline=1',
    );
    // An inherited query string is discarded, not trusted.
    expect(safeEmbedSrc('https://www.youtube.com/embed/abcdefghijk?evil=1&autoplay=0')).toBe(
      'https://www.youtube.com/embed/abcdefghijk?autoplay=1&rel=0&playsinline=1',
    );
  });

  it('accepts the privacy-enhanced YouTube host and Vimeo player URLs', () => {
    expect(safeEmbedSrc('https://www.youtube-nocookie.com/embed/abcdefghijk')).toContain(
      'youtube-nocookie.com/embed/abcdefghijk',
    );
    expect(safeEmbedSrc('https://player.vimeo.com/video/123456789')).toBe(
      'https://player.vimeo.com/video/123456789?autoplay=1&playsinline=1',
    );
  });

  it.each([
    'http://www.youtube.com/embed/abcdefghijk',
    'https://evil.example.com/embed/abcdefghijk',
    'https://www.youtube.com.evil.example.com/embed/abcdefghijk',
    'https://www.youtube.com/watch?v=abcdefghijk',
    'https://www.youtube.com/embed/short',
    'https://www.youtube.com/embed/abcdefghijk/../../x',
    'https://player.vimeo.com/video/abc',
    'javascript:alert(1)',
    'data:text/html,<script>1</script>',
    '',
    'not a url',
  ])('refuses %j', (value) => {
    expect(safeEmbedSrc(value)).toBeNull();
  });
});

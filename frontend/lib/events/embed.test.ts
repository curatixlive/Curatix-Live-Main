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

import { inlineEmbed, playerCommand, playingFromMessage } from './embed';

describe('inlineEmbed', () => {
  const yt = 'https://www.youtube.com/embed/dQw4w9WgXcQ';

  it('builds a muted, inline, controllable YouTube frame', () => {
    const e = inlineEmbed(yt, { autoplay: true, origin: 'https://curatix.example.com' });
    expect(e?.provider).toBe('youtube');
    const q = new URL(e!.src).searchParams;
    expect(q.get('autoplay')).toBe('1');
    expect(q.get('mute')).toBe('1');
    expect(q.get('enablejsapi')).toBe('1');
    expect(q.get('playsinline')).toBe('1');
    expect(q.get('origin')).toBe('https://curatix.example.com');
    expect(e?.postOrigin).toBe('https://www.youtube.com');
    expect(e?.watchUrl).toBe('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  });

  it('does not autoplay when autoplay is off, but is still controllable', () => {
    const e = inlineEmbed(yt, { autoplay: false });
    expect(new URL(e!.src).searchParams.get('autoplay')).toBe('0');
    expect(new URL(e!.src).searchParams.get('enablejsapi')).toBe('1');
  });

  it('discards an inherited query string and refuses a hostile origin param', () => {
    const e = inlineEmbed(`${yt}?evil=1&autoplay=0`, {
      autoplay: true,
      origin: 'javascript:alert(1)',
    });
    expect(new URL(e!.src).searchParams.get('evil')).toBeNull();
    expect(new URL(e!.src).searchParams.get('origin')).toBeNull();
  });

  it('builds a muted Vimeo frame', () => {
    const e = inlineEmbed('https://player.vimeo.com/video/123456789', { autoplay: true });
    expect(e?.provider).toBe('vimeo');
    expect(new URL(e!.src).searchParams.get('muted')).toBe('1');
    expect(e?.postOrigin).toBe('https://player.vimeo.com');
  });

  it.each([
    'http://www.youtube.com/embed/dQw4w9WgXcQ',
    'https://evil.example.com/embed/dQw4w9WgXcQ',
    'https://www.youtube.com.evil.example.com/embed/dQw4w9WgXcQ',
    'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    'https://www.youtube.com/embed/short',
    'javascript:alert(1)',
    '',
  ])('refuses %j', (value) => {
    expect(inlineEmbed(value, { autoplay: true })).toBeNull();
  });
});

describe('playerCommand', () => {
  it('speaks YouTube', () => {
    expect(JSON.parse(playerCommand('youtube', 'pause'))).toEqual({
      event: 'command',
      func: 'pauseVideo',
      args: [],
    });
    expect(JSON.parse(playerCommand('youtube', 'unmute')).func).toBe('unMute');
  });
  it('speaks Vimeo', () => {
    expect(JSON.parse(playerCommand('vimeo', 'play'))).toEqual({ method: 'play' });
    expect(JSON.parse(playerCommand('vimeo', 'mute'))).toEqual({ method: 'setVolume', value: 0 });
  });
});

describe('playingFromMessage', () => {
  it('reads YouTube state changes', () => {
    expect(playingFromMessage('youtube', JSON.stringify({ event: 'onStateChange', info: 1 }))).toBe(
      true,
    );
    expect(playingFromMessage('youtube', JSON.stringify({ event: 'onStateChange', info: 2 }))).toBe(
      false,
    );
    expect(playingFromMessage('youtube', { event: 'infoDelivery', info: { playerState: 1 } })).toBe(
      true,
    );
  });
  it('says nothing about messages it does not understand', () => {
    expect(playingFromMessage('youtube', 'not json')).toBeNull();
    expect(playingFromMessage('youtube', JSON.stringify({ event: 'onReady' }))).toBeNull();
    expect(playingFromMessage('youtube', null)).toBeNull();
    expect(playingFromMessage('vimeo', JSON.stringify({ event: 'pause' }))).toBe(false);
  });
});

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * THE LANDING PAGE BELONGS TO THE ATTENDEE SITE ONLY.
 *
 * The organiser portal once rendered a copy of it at `/dashboard/home`, so a Home
 * tab could show it inside the dashboard. That mixed the two products and was
 * removed; this file keeps it from coming back. Source scans rather than
 * renders, because the claim is about how the routes are COMPOSED.
 */

const ROOT = process.cwd();
const read = (path: string) => readFileSync(join(ROOT, path), 'utf8');

const PUBLIC_PAGE = 'app/(site)/page.tsx';
const ORGANIZER_PAGE = 'app/(organizer)/dashboard/home/page.tsx';
const SITE_LAYOUT = 'app/(site)/layout.tsx';

describe("the landing page is the ATTENDEE site's alone", () => {
  it('the public route delegates to HomeBody', () => {
    const source = read(PUBLIC_PAGE);
    expect(source).toContain('HomeBody');
    // And does NOT compose the sections itself — the shape the split undid.
    expect(source).not.toContain('<Showcase');
    expect(source).not.toContain('<AllEvents');
  });

  it('the organiser portal has NO copy of it: its old home route just redirects', () => {
    // `/dashboard/home` used to render the attendee landing page (posters, save
    // buttons, featured events) inside the organiser dashboard. The two are
    // separate products now; a bookmarked URL lands on the organiser overview.
    const source = read(ORGANIZER_PAGE);
    expect(source).toContain("redirect('/dashboard')");
    expect(source).not.toContain('HomeBody');
    expect(source).not.toContain('DiscoveryProviders');
    for (const attendee of ['SiteHeader', 'SiteFooter', 'SiteBottomNav', 'AnnouncementBar']) {
      expect(source).not.toContain(attendee);
    }
  });
});

describe('what stays on the public URL only', () => {
  it('keeps the canonical and the WebSite structured data on the public page', () => {
    expect(read(PUBLIC_PAGE)).toContain('alternates: { canonical');
    expect(read(PUBLIC_PAGE)).toContain('webSiteJsonLd({');
  });
});

describe('the attendee layout mounts the discovery providers once', () => {
  it('goes through DiscoveryProviders and does not hand-roll them', () => {
    // A discovery card opens the mobile event deck on press. A route missing
    // `EventDeckProvider` renders flawlessly and throws on the first tap.
    const source = read(SITE_LAYOUT);
    expect(source).toContain('<DiscoveryProviders');
    expect(source).not.toContain('<LocationProvider');
    expect(source).not.toContain('<SearchProvider');
    expect(source).not.toContain('<EventDeckProvider');
    expect(source).not.toContain('<EventWidgetDeck');
  });
});

describe('the attendee site never shows the organiser bar', () => {
  it('SiteBottomNav has no organiser navigation in it', () => {
    const source = read('components/shell/site-bottom-nav.tsx');
    expect(source).not.toContain('OrganizerFooterNav');
    expect(source).not.toContain('useScope');
  });
});

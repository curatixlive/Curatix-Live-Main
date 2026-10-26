"""The verification-code email: our logo, a ticket-stub code card, expiry, security note."""

from __future__ import annotations

from apps.notifications import email_layout as ui
from apps.notifications.models import NotificationChannel, NotificationType
from apps.notifications.templates import TemplateService

SITE = "https://curatix-live.vercel.app"


def render(code: str = "856843", ttl: int = 10, site: str = SITE, settings=None):
    if settings is not None:
        settings.PUBLIC_SITE_URL = site
    return TemplateService().render(
        notification_type=NotificationType.EMAIL_VERIFICATION,
        channel=NotificationChannel.EMAIL,
        context={"full_name": "Karthik Chowdary", "code": code, "ttl_minutes": ttl},
    )


def test_the_masthead_carries_our_real_wordmark_and_the_ticket_carries_our_mark(settings):
    html = render(settings=settings).html
    assert f'src="{SITE}/curatix-wordmark-dark.png"' in html
    assert f'src="{SITE}/curatix-mark-email.png"' in html
    assert 'alt="Curatix"' in html  # the name survives blocked images


def test_without_a_configured_site_it_falls_back_to_text_and_never_a_broken_image(settings):
    html = render(site="", settings=settings).html
    assert "<img" not in html
    assert ">CX</td>" in html  # the typographic monogram


def test_each_digit_is_its_own_tile_and_the_greeting_uses_the_name(settings):
    html = render(settings=settings).html
    assert html.count('class="tile"') >= 6
    for digit in "856843":
        assert f'<span class="ink">{digit}</span>' in html
    assert "Hi Karthik Chowdary" in html  # greeted by name


def test_the_expiry_the_single_use_badge_and_the_security_note_are_stated(settings):
    html = render(ttl=15, settings=settings).html
    assert "Valid for 15 minutes" in html
    assert "Once only" in html
    assert "Keep this to yourself" in html
    assert "never ask for this code" in html


def test_the_plain_text_part_still_carries_the_code_and_the_warning(settings):
    msg = render(settings=settings)
    assert "856843" in msg.subject and "856843" in msg.body
    assert "never share" in msg.body.lower()


def test_the_logo_is_opt_in_on_the_masthead():
    without = ui.render_email(title="t", preheader="p", blocks=[], masthead_label="X")
    with_logo = ui.render_email(
        title="t", preheader="p", blocks=[], masthead_label="X", logo_url="https://x/l.png"
    )
    assert "<img" not in without and ">CX</td>" in without
    assert '<img src="https://x/l.png"' in with_logo and ">CX</td>" not in with_logo


def test_an_odd_length_code_falls_back_to_a_single_line_panel():
    html = ui.code_ticket("123456789012", label="l", expiry_strong="Valid", expiry_note="n")
    assert "123456789012" in html
    assert 'class="tile"' not in html


def test_nothing_in_the_code_or_the_text_can_inject_markup():
    html = ui.code_ticket("<b>12", label="<i>x", expiry_strong="<u>y", expiry_note="<s>z")
    for raw in ("<b>1", "<i>x", "<u>y", "<s>z"):
        assert raw not in html

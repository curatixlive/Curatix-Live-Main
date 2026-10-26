"""The verification-code email: one box per digit, the expiry spelled out, a security note."""

from __future__ import annotations

from apps.notifications import email_layout as ui
from apps.notifications.models import NotificationChannel, NotificationType
from apps.notifications.templates import TemplateService


def render(code: str = "856843", ttl: int = 10):
    return TemplateService().render(
        notification_type=NotificationType.EMAIL_VERIFICATION,
        channel=NotificationChannel.EMAIL,
        context={"full_name": "Karthik", "code": code, "ttl_minutes": ttl},
    )


def test_each_digit_has_its_own_cell_with_dividers_between():
    html = render().html
    for digit in "856843":
        assert f">{digit}</td>" in html
    # five dividers between six digits
    assert html.count('class="rule">&nbsp;</td>') == 5


def test_the_expiry_and_the_security_line_are_stated():
    html = render(ttl=15).html
    assert "<strong" in html and "15 minutes" in html
    assert "For your security" in html
    assert "Do not share this code with anyone" in html
    assert "Didn't request this?" in html.replace("&#x27;", "'")


def test_the_plain_text_part_still_carries_the_code_and_the_warning():
    msg = render()
    assert "856843" in msg.subject and "856843" in msg.body
    assert "never share" in msg.body.lower()


def test_the_violet_masthead_is_opt_in():
    ink = ui.render_email(title="t", preheader="p", blocks=[], masthead_label="X")
    violet = ui.render_email(
        title="t", preheader="p", blocks=[], masthead_label="X", masthead_tone="violet"
    )
    assert (
        ui.INK in ink.split("masthead")[0] + ink[ink.index("bgcolor") : ink.index("bgcolor") + 40]
    )
    assert 'bgcolor="#6D28D9"' in violet


def test_an_odd_length_code_falls_back_to_a_single_line_panel():
    html = ui.otp_panel("123456789012", caption_prefix="Expires in ", strong="10 minutes")
    assert "123456789012" in html
    assert 'class="rule"' not in html


def test_nothing_in_the_code_can_inject_markup():
    html = ui.otp_panel("<b>12", caption_prefix="a", strong="b")
    assert "<b>1" not in html

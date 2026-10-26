import pytest

from apps.organizations.socials import normalise_social
from core.errors import InvalidInputError


@pytest.mark.parametrize(
    ("network", "typed", "stored"),
    [
        ("instagram", "@groove", "https://instagram.com/groove"),
        ("instagram", "groove.collective", "https://instagram.com/groove.collective"),
        ("instagram", "https://www.instagram.com/groove/", "https://instagram.com/groove"),
        ("youtube", "@GrooveTV", "https://youtube.com/@GrooveTV"),
        ("youtube", "youtube.com/@GrooveTV", "https://youtube.com/@GrooveTV"),
        ("x", "@groove", "https://x.com/groove"),
        ("x", "https://twitter.com/groove", "https://twitter.com/groove"),
        ("x", "  ", ""),
    ],
)
def test_handles_and_urls_become_one_canonical_https_url(network, typed, stored):
    assert normalise_social(network, typed) == stored


@pytest.mark.parametrize(
    ("network", "typed"),
    [
        ("instagram", "javascript:alert(1)"),
        ("instagram", "http://instagram.com/x"),  # not https
        ("instagram", "https://evil.example/instagram.com"),
        ("youtube", "https://instagram.com/groove"),  # wrong network
        ("x", "has space"),
    ],
)
def test_anything_else_is_refused(network, typed):
    with pytest.raises(InvalidInputError):
        normalise_social(network, typed)

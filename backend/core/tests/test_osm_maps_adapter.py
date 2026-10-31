"""The keyless venue search: Photon for suggestions, Nominatim for one place."""

from __future__ import annotations

import pytest

from core.adapters.osm.adapter import OsmMapsAdapter
from core.ports.maps_port import Coordinates, MapsError


class _Response:
    def __init__(self, payload, status=200):
        self._payload, self.status_code = payload, status

    def json(self):
        return self._payload


class _Session:
    def __init__(self, payload, status=200):
        self.headers: dict = {}
        self.calls: list = []
        self._payload, self._status = payload, status

    def get(self, url, params=None, timeout=None):
        self.calls.append((url, params))
        return _Response(self._payload, self._status)


PHOTON = {
    "features": [
        {
            "geometry": {"coordinates": [72.83, 18.92]},
            "properties": {
                "osm_type": "W",
                "osm_id": 111,
                "name": "Gateway of India",
                "street": "Apollo Bandar",
                "city": "Mumbai",
                "state": "Maharashtra",
                "osm_value": "monument",
            },
        },
        # A duplicate and an unusable row are dropped.
        {"properties": {"osm_type": "W", "osm_id": 111, "name": "Gateway of India"}},
        {"properties": {"name": "No id"}},
    ]
}


def test_autocomplete_returns_deduped_rows_with_a_lookup_ready_id():
    session = _Session(PHOTON)
    rows = OsmMapsAdapter(session=session).autocomplete("gateway", country="in")
    assert [r.place_id for r in rows] == ["osm:W111"]
    assert rows[0].main_text == "Gateway of India"
    assert "Mumbai" in rows[0].secondary_text
    assert session.calls[0][1]["bbox"]  # kept inside India


def test_autocomplete_ignores_a_single_character():
    session = _Session(PHOTON)
    assert OsmMapsAdapter(session=session).autocomplete("g") == []
    assert session.calls == []


def test_place_details_resolves_the_id_to_a_pin_and_a_city():
    session = _Session(
        [
            {
                "lat": "18.9220",
                "lon": "72.8347",
                "name": "Gateway of India",
                "display_name": "Gateway of India, Mumbai, Maharashtra, India",
                "address": {"city": "Mumbai", "country": "India", "postcode": "400001"},
            }
        ]
    )
    place = OsmMapsAdapter(session=session).place_details("osm:W111")
    assert place.city == "Mumbai"
    assert place.coordinates == Coordinates(18.922, 72.8347)
    assert session.calls[0][1]["osm_ids"] == "W111"


def test_a_foreign_place_id_is_refused_rather_than_sent_upstream():
    with pytest.raises(MapsError) as error:
        OsmMapsAdapter(session=_Session([])).place_details("ChIJ-google-id")
    assert error.value.reason == "invalid_input"


def test_a_missing_place_is_not_found():
    with pytest.raises(MapsError) as error:
        OsmMapsAdapter(session=_Session([])).place_details("osm:N1")
    assert error.value.reason == "not_found"


def test_rate_limit_and_outage_have_distinct_reasons():
    with pytest.raises(MapsError) as limited:
        OsmMapsAdapter(session=_Session({}, 429)).autocomplete("mumbai")
    with pytest.raises(MapsError) as down:
        OsmMapsAdapter(session=_Session({}, 503)).autocomplete("mumbai")
    assert (limited.value.reason, down.value.reason) == ("quota", "unavailable")


def test_directions_are_refused_honestly():
    with pytest.raises(MapsError) as error:
        OsmMapsAdapter(session=_Session({})).directions(origin=None, destination=None)
    assert error.value.reason == "not_configured"


def test_it_identifies_itself_to_the_services_it_calls():
    session = _Session({})
    OsmMapsAdapter(contact="https://curatix.live", session=session)
    assert session.headers["User-Agent"].startswith("Curatix/")

"""OpenStreetMap-backed Maps adapter: venue search that needs no API key.

Used when `GOOGLE_MAPS_API_KEY` is unset, so an organiser still gets place
suggestions and a pinned venue instead of a dead search box. Google remains the
preferred backend whenever a key exists (`config.di.maps_port`).

- **Photon** (komoot) answers search-as-you-type; it is built for that, unlike
  Nominatim's public instance whose usage policy forbids autocomplete.
- **Nominatim** resolves one picked place (lookup), an address (search) or a
  point (reverse) — a few calls per event, well inside its 1 request/second
  policy. Both require an identifying User-Agent.

Only what the venue picker needs is implemented. Directions, distance matrix
and photos raise `not_configured`: OSM has no equivalent worth faking, and a
refusal is honest where an invented route is not. Callers ask `is_configured()`
before offering those, and the Google adapter's refusals use the same reason.

A place id is `osm:<N|W|R><osm_id>`, which Nominatim's `lookup` accepts as-is,
so nothing else has to be stored to resolve it later.
"""

from __future__ import annotations

import logging
import re
from typing import Any

import requests

from core.ports.maps_port import (
    Coordinates,
    GeocodeResult,
    MapsError,
    MapsPort,
    Place,
    PlaceSuggestion,
)

logger = logging.getLogger(__name__)

PHOTON_URL = "https://photon.komoot.io/api/"
NOMINATIM_URL = "https://nominatim.openstreetmap.org"
#: Left, bottom, right, top. Keeps Indian searches Indian; Photon has no
#: country parameter.
_INDIA_BBOX = "68.1,6.5,97.4,35.7"
_TIMEOUT_SECONDS = 6
_ID_RE = re.compile(r"^osm:([NWR])(\d+)$")


class OsmMapsAdapter(MapsPort):
    def __init__(self, *, contact: str = "", session: Any = None) -> None:
        # `Any`: anything with `.get` and `.headers`. Typed loosely so tests can
        # hand in a stub instead of a real `requests.Session`.
        self._session = session or requests.Session()
        # Both services ask for an identifying agent and ban the default one.
        self._session.headers["User-Agent"] = f"Curatix/1.0 ({contact or 'https://curatix.live'})"

    def is_configured(self) -> bool:
        return True

    # --- HTTP -----------------------------------------------------------

    def _get(self, url: str, params: dict[str, Any]) -> Any:
        try:
            response = self._session.get(url, params=params, timeout=_TIMEOUT_SECONDS)
        except requests.Timeout as exc:
            raise MapsError("unavailable", "The map service timed out.") from exc
        except requests.RequestException as exc:
            raise MapsError("unavailable", "The map service could not be reached.") from exc
        if response.status_code == 429:
            raise MapsError("quota", "The map service is busy. Try again shortly.")
        if response.status_code >= 400:
            logger.warning("osm.request_failed", extra={"status": response.status_code})
            raise MapsError("unavailable", "The map service refused the request.")
        try:
            return response.json()
        except ValueError as exc:
            raise MapsError("unavailable", "The map service sent an unreadable reply.") from exc

    # --- Places ---------------------------------------------------------

    def autocomplete(
        self,
        query: str,
        *,
        session_token: str = "",
        country: str = "",
        origin: Coordinates | None = None,
        types: str = "",
    ) -> list[PlaceSuggestion]:
        query = (query or "").strip()
        if len(query) < 2:
            return []
        params: dict[str, Any] = {"q": query, "limit": 8, "lang": "en"}
        if country.lower() == "in":
            params["bbox"] = _INDIA_BBOX
        if origin is not None:
            params["lat"], params["lon"] = origin.latitude, origin.longitude
        data = self._get(PHOTON_URL, params)
        seen: set[str] = set()
        rows: list[PlaceSuggestion] = []
        for feature in data.get("features", []):
            props = feature.get("properties", {})
            osm_type, osm_id = props.get("osm_type"), props.get("osm_id")
            if osm_type not in ("N", "W", "R") or not osm_id:
                continue
            place_id = f"osm:{osm_type}{osm_id}"
            if place_id in seen:
                continue
            seen.add(place_id)
            name = props.get("name") or props.get("street") or ""
            if not name:
                continue
            secondary = ", ".join(
                dict.fromkeys(
                    part
                    for part in (
                        " ".join(
                            p for p in (props.get("housenumber"), props.get("street")) if p
                        ).strip()
                        if props.get("name")
                        else "",
                        props.get("district") or props.get("locality"),
                        props.get("city"),
                        props.get("state"),
                    )
                    if part and part != name
                )
            )
            rows.append(
                PlaceSuggestion(
                    place_id=place_id,
                    description=f"{name}, {secondary}" if secondary else name,
                    main_text=name,
                    secondary_text=secondary,
                    types=[props.get("osm_value", "")] if props.get("osm_value") else [],
                )
            )
        return rows

    def place_details(self, place_id: str, *, session_token: str = "") -> Place:
        match = _ID_RE.match(place_id or "")
        if not match:
            raise MapsError("invalid_input", "That is not a place this service can look up.")
        data = self._get(
            f"{NOMINATIM_URL}/lookup",
            {
                "osm_ids": f"{match.group(1)}{match.group(2)}",
                "format": "jsonv2",
                "addressdetails": 1,
            },
        )
        if not data:
            raise MapsError("not_found", "That place no longer exists.")
        return self._place_from(data[0], place_id)

    def search_text(self, query: str, *, near: Coordinates | None = None) -> list[Place]:
        data = self._get(
            f"{NOMINATIM_URL}/search",
            {"q": query, "format": "jsonv2", "addressdetails": 1, "limit": 5, "countrycodes": "in"},
        )
        return [self._place_from(item, self._id_of(item)) for item in data]

    # --- Geocoding ------------------------------------------------------

    def geocode(self, address: str, *, country: str = "") -> GeocodeResult:
        params: dict[str, Any] = {"q": address, "format": "jsonv2", "addressdetails": 1, "limit": 1}
        if country:
            params["countrycodes"] = country.lower()
        data = self._get(f"{NOMINATIM_URL}/search", params)
        if not data:
            raise MapsError("not_found", "No match for that address.")
        return self._geocode_from(data[0])

    def reverse_geocode(self, coordinates: Coordinates) -> GeocodeResult:
        data = self._get(
            f"{NOMINATIM_URL}/reverse",
            {
                "lat": coordinates.latitude,
                "lon": coordinates.longitude,
                "format": "jsonv2",
                "addressdetails": 1,
            },
        )
        if not data or data.get("error"):
            raise MapsError("not_found", "Nothing is mapped at that point.")
        return self._geocode_from(data)

    # --- Not offered ----------------------------------------------------

    def _unsupported(self) -> MapsError:
        return MapsError("not_configured", "Directions need a Google Maps key on this deployment.")

    def directions(
        self, *, origin, destination, mode="driving", departure_time=None, alternatives=False
    ) -> list:
        raise self._unsupported()

    def distance_matrix(
        self, *, origins, destinations, mode="driving", departure_time=None
    ) -> list:
        raise self._unsupported()

    def fetch_photo(self, reference, *, max_width=800) -> tuple[bytes, str]:
        raise self._unsupported()

    # --- Mapping --------------------------------------------------------

    @staticmethod
    def _id_of(item: dict) -> str:
        kind = (item.get("osm_type") or "node")[0].upper()
        return f"osm:{kind}{item.get('osm_id', '')}"

    @staticmethod
    def _city_of(address: dict) -> str:
        for key in ("city", "town", "village", "municipality", "city_district", "county"):
            if address.get(key):
                return str(address[key])
        return str(address.get("state_district") or "")

    def _place_from(self, item: dict, place_id: str) -> Place:
        address = item.get("address", {})
        return Place(
            place_id=place_id,
            name=item.get("name") or str(item.get("display_name", "")).split(",")[0],
            formatted_address=item.get("display_name", ""),
            coordinates=Coordinates(float(item["lat"]), float(item["lon"])),
            types=[t for t in (item.get("category"), item.get("type")) if t],
            city=self._city_of(address),
            country=address.get("country", ""),
            postal_code=address.get("postcode", ""),
        )

    def _geocode_from(self, item: dict) -> GeocodeResult:
        address = item.get("address", {})
        return GeocodeResult(
            formatted_address=item.get("display_name", ""),
            coordinates=Coordinates(float(item["lat"]), float(item["lon"])),
            place_id=self._id_of(item) if item.get("osm_id") else "",
            city=self._city_of(address),
            country=address.get("country", ""),
            postal_code=address.get("postcode", ""),
        )

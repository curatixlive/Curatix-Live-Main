"""`render.yaml` is configuration nothing else exercises: a typo in a backend
name boots fine in CI and crashes on the first Render deploy. This pins the
values it sets for the adapter switches to names `config.di` actually knows,
and the SMS/payment values to ones production preflight accepts."""

from __future__ import annotations

from pathlib import Path

import yaml

BLUEPRINT = Path(__file__).resolve().parents[3] / "render.yaml"

VALID = {
    "PAYMENTS_BACKEND": {"razorpay", "cashfree"},
    "STORAGE_BACKEND": {"s3", "gcs"},
    "EMAIL_PROVIDER": {"smtp"},
    "SMS_PROVIDER": {"disabled", "http"},  # never `console`: production refuses the fake
    "QUEUE_BACKEND": {"local", "cloud_tasks"},
    "EVENT_BUS_BACKEND": {"inprocess", "pubsub"},
    "CACHE_BACKEND": {"redis"},
}


def _shared_env() -> dict[str, str | None]:
    doc = yaml.safe_load(BLUEPRINT.read_text())
    group = next(g for g in doc["envVarGroups"] if g["name"] == "curatix-shared")
    return {entry["key"]: entry.get("value") for entry in group["envVars"]}


def test_every_adapter_switch_names_a_backend_that_exists():
    env = _shared_env()
    for key, allowed in VALID.items():
        assert (
            env.get(key) in allowed
        ), f"render.yaml {key}={env.get(key)!r}; valid: {sorted(allowed)}"


def test_cashfree_is_the_default_gateway_and_razorpay_keeps_payouts():
    env = _shared_env()
    assert env["PAYMENTS_DEFAULT_GATEWAY"] == "cashfree"
    assert env["PAYMENTS_ROUTE_PROVIDER"] == "razorpay"
    assert set(str(env["PAYMENTS_ENABLED_GATEWAYS"]).split(",")) == {"cashfree", "razorpay"}


def test_the_load_balancer_hop_is_counted_so_rate_limits_are_per_client():
    assert _shared_env()["NUM_PROXIES"] == "1"

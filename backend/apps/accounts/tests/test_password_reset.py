"""Forgot password: one flow for every role, bearer-credential rules."""

from __future__ import annotations

import datetime as dt

import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.exceptions import (
    VerificationAttemptsExceededError,
    VerificationCodeInvalidError,
)
from apps.accounts.models import PasswordReset, User
from apps.accounts.repositories import PasswordResetRepository, UserRepository
from apps.accounts.services import PasswordResetService
from apps.notifications.models import NotificationLog, NotificationType
from apps.notifications.repositories import (
    NotificationLogRepository,
    PushSubscriptionRepository,
)
from apps.notifications.services import NotificationService, TemplateService
from core.adapters.local.console_email import ConsoleEmailAdapter
from core.adapters.local.console_sms import ConsoleSmsAdapter
from core.adapters.local.sync_task_queue import SyncTaskQueueAdapter
from core.adapters.webpush.adapter import DisabledPushAdapter
from core.errors import InvalidInputError

pytestmark = pytest.mark.django_db

NEW_PASSWORD = "Brand-New-Pass-84215"


@pytest.fixture
def service() -> PasswordResetService:
    notifications = NotificationService(
        logs=NotificationLogRepository(),
        templates=TemplateService(),
        email=ConsoleEmailAdapter(),
        sms=ConsoleSmsAdapter(),
        push=DisabledPushAdapter(),
        push_subscriptions=PushSubscriptionRepository(),
        task_queue=SyncTaskQueueAdapter(),
        max_attempts=3,
        retry_backoff_seconds=1,
    )
    return PasswordResetService(
        users=UserRepository(), resets=PasswordResetRepository(), notifications=notifications
    )


@pytest.fixture
def user() -> User:
    return User.objects.create_user(
        email="forgot@example.com", password="Old-Password-1234", email_verified=True
    )


def _code(reset: PasswordReset) -> str:
    log = NotificationLog.objects.get(dedupe_key=f"password_reset:{reset.id}")
    text = log.subject or log.body
    return "".join(ch for ch in text if ch.isdigit())[:6]


def _latest(user: User) -> PasswordReset:
    row = PasswordReset.objects.filter(user=user).order_by("-created_at", "-id").first()
    assert row is not None
    return row


class TestRequest:
    def test_emails_a_code_and_never_stores_it(self, service, user):
        service.request(email=user.email)
        row = _latest(user)
        assert row.channel == "email"
        assert _code(row) not in row.code_hash
        assert NotificationLog.objects.get(dedupe_key=f"password_reset:{row.id}").type == (
            NotificationType.PASSWORD_RESET
        )

    def test_sms_goes_to_the_phone_when_there_is_one(self, service, user):
        User.objects.filter(pk=user.pk).update(phone="+919999900000")
        service.request(email=user.email, channel="sms")
        row = _latest(user)
        assert row.channel == "sms"
        log = NotificationLog.objects.get(dedupe_key=f"password_reset:{row.id}")
        assert log.type == NotificationType.PASSWORD_RESET_SMS

    def test_sms_without_a_phone_falls_back_to_email(self, service, user):
        service.request(email=user.email, channel="sms")
        assert _latest(user).channel == "email"

    def test_an_unknown_address_sends_nothing_and_says_nothing(self, service):
        service.request(email="nobody@example.com")
        assert not PasswordReset.objects.exists()

    def test_a_suspended_account_gets_nothing(self, service, user):
        User.objects.filter(pk=user.pk).update(is_active=False)
        service.request(email=user.email)
        assert not PasswordReset.objects.exists()

    def test_a_resend_inside_the_cooldown_is_silently_skipped(self, service, user):
        service.request(email=user.email)
        service.request(email=user.email)
        assert PasswordReset.objects.filter(user=user).count() == 1


class TestConfirm:
    def test_the_right_code_sets_the_password(self, service, user):
        service.request(email=user.email)
        service.confirm(email=user.email, code=_code(_latest(user)), new_password=NEW_PASSWORD)
        user.refresh_from_db()
        assert user.check_password(NEW_PASSWORD)

    def test_a_code_works_once(self, service, user):
        service.request(email=user.email)
        code = _code(_latest(user))
        service.confirm(email=user.email, code=code, new_password=NEW_PASSWORD)
        with pytest.raises(VerificationCodeInvalidError):
            service.confirm(email=user.email, code=code, new_password="Another-Pass-77123")

    def test_a_wrong_code_changes_nothing(self, service, user):
        service.request(email=user.email)
        with pytest.raises(VerificationCodeInvalidError):
            service.confirm(email=user.email, code="000000", new_password=NEW_PASSWORD)
        user.refresh_from_db()
        assert user.check_password("Old-Password-1234")

    def test_an_unknown_address_is_the_same_error_as_a_wrong_code(self, service):
        with pytest.raises(VerificationCodeInvalidError):
            service.confirm(email="nobody@example.com", code="123456", new_password=NEW_PASSWORD)

    def test_guesses_are_capped_and_the_code_is_then_spent(self, service, user):
        service.request(email=user.email)
        code = _code(_latest(user))
        wrong = "000000" if code != "000000" else "111111"
        for _ in range(PasswordReset.MAX_ATTEMPTS):
            with pytest.raises(VerificationCodeInvalidError):
                service.confirm(email=user.email, code=wrong, new_password=NEW_PASSWORD)
        # Even the right code is refused now.
        with pytest.raises(VerificationAttemptsExceededError):
            service.confirm(email=user.email, code=code, new_password=NEW_PASSWORD)

    def test_an_expired_code_is_refused(self, service, user):
        service.request(email=user.email)
        row = _latest(user)
        PasswordReset.objects.filter(pk=row.pk).update(
            expires_at=timezone.now() - dt.timedelta(seconds=1)
        )
        with pytest.raises(VerificationCodeInvalidError):
            service.confirm(email=user.email, code=_code(row), new_password=NEW_PASSWORD)

    def test_a_weak_password_is_refused_without_burning_the_code(self, service, user):
        service.request(email=user.email)
        code = _code(_latest(user))
        with pytest.raises(InvalidInputError):
            service.confirm(email=user.email, code=code, new_password="12345678")
        # The same code still works with a good password.
        service.confirm(email=user.email, code=code, new_password=NEW_PASSWORD)
        user.refresh_from_db()
        assert user.check_password(NEW_PASSWORD)

    def test_an_emailed_code_also_proves_the_address(self, service):
        unverified = User.objects.create_user(email="new@example.com", password="Old-Password-1234")
        service.request(email=unverified.email)
        service.confirm(
            email=unverified.email, code=_code(_latest(unverified)), new_password=NEW_PASSWORD
        )
        unverified.refresh_from_db()
        assert unverified.email_verified is True

    def test_a_reset_signs_the_account_out_everywhere(self, service, user):
        from rest_framework_simplejwt.token_blacklist.models import BlacklistedToken
        from rest_framework_simplejwt.tokens import RefreshToken

        RefreshToken.for_user(user)
        service.request(email=user.email)
        service.confirm(email=user.email, code=_code(_latest(user)), new_password=NEW_PASSWORD)
        assert BlacklistedToken.objects.filter(token__user=user).count() == 1


class TestApi:
    def test_the_whole_flow_over_http(self, user):
        client = APIClient()
        res = client.post(
            "/api/v1/auth/password-reset/request", {"email": user.email}, format="json"
        )
        assert res.status_code == 202 and res.json() == {"sent": True}

        # The unknown-address answer is byte-for-byte the same.
        other = client.post(
            "/api/v1/auth/password-reset/request", {"email": "no@example.com"}, format="json"
        )
        assert other.status_code == 202 and other.json() == {"sent": True}

        bad = client.post(
            "/api/v1/auth/password-reset/confirm",
            {"email": user.email, "code": "000000", "new_password": NEW_PASSWORD},
            format="json",
        )
        assert bad.status_code == 422
        assert bad.json()["error"]["code"] == "verification_code_invalid"

        row = _latest(user)
        ok = client.post(
            "/api/v1/auth/password-reset/confirm",
            {"email": user.email, "code": _code(row), "new_password": NEW_PASSWORD},
            format="json",
        )
        assert ok.status_code == 200
        login = client.post(
            "/api/v1/auth/login", {"email": user.email, "password": NEW_PASSWORD}, format="json"
        )
        assert login.status_code == 200

    def test_options_hide_sms_when_no_provider_is_configured(self, settings):
        settings.SMS_PROVIDER = "disabled"
        assert APIClient().get("/api/v1/auth/password-reset/options").json() == {
            "channels": ["email"]
        }
        settings.SMS_PROVIDER = "console"
        assert APIClient().get("/api/v1/auth/password-reset/options").json() == {
            "channels": ["email", "sms"]
        }

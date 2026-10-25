from __future__ import annotations

from rest_framework import serializers

from .models import CommissionKind, PromotionStatus


class PromotionSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    name = serializers.CharField()
    partner_name = serializers.CharField()
    code = serializers.CharField()
    event_id = serializers.UUIDField(allow_null=True)
    commission_kind = serializers.CharField()
    commission_value = serializers.IntegerField()
    attribution_window_days = serializers.IntegerField()
    starts_at = serializers.DateTimeField(allow_null=True)
    ends_at = serializers.DateTimeField(allow_null=True)
    status = serializers.CharField()
    created_at = serializers.DateTimeField()


class CreatePromotionRequestSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=120)
    partner_name = serializers.CharField(max_length=120, required=False, allow_blank=True)
    code = serializers.CharField(max_length=32)
    event_id = serializers.UUIDField(required=False, allow_null=True)
    commission_kind = serializers.ChoiceField(choices=CommissionKind.choices)
    commission_value = serializers.IntegerField(min_value=0, max_value=10_000_000)
    attribution_window_days = serializers.IntegerField(required=False, min_value=1, max_value=90)
    starts_at = serializers.DateTimeField(required=False, allow_null=True)
    ends_at = serializers.DateTimeField(required=False, allow_null=True)


class UpdatePromotionRequestSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=120, required=False)
    partner_name = serializers.CharField(max_length=120, required=False, allow_blank=True)
    commission_kind = serializers.ChoiceField(choices=CommissionKind.choices, required=False)
    commission_value = serializers.IntegerField(required=False, min_value=0, max_value=10_000_000)
    attribution_window_days = serializers.IntegerField(required=False, min_value=1, max_value=90)
    starts_at = serializers.DateTimeField(required=False, allow_null=True)
    ends_at = serializers.DateTimeField(required=False, allow_null=True)
    status = serializers.ChoiceField(choices=PromotionStatus.choices, required=False)


class PayoutRequestSerializer(serializers.Serializer):
    amount_minor = serializers.IntegerField(min_value=1)
    reference = serializers.CharField(max_length=120, required=False, allow_blank=True)
    paid_at = serializers.DateTimeField(required=False)


class PayoutSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    amount_minor = serializers.IntegerField()
    reference = serializers.CharField()
    paid_at = serializers.DateTimeField()


class ClickRequestSerializer(serializers.Serializer):
    code = serializers.CharField(max_length=32)


class AttributeRequestSerializer(serializers.Serializer):
    code = serializers.CharField(max_length=32)
    clicked_at = serializers.DateTimeField()

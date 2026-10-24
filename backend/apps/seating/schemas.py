from rest_framework import serializers


class SectionSerializer(serializers.Serializer):
    id = serializers.CharField(max_length=40)
    name = serializers.CharField(max_length=40)


class CreateLayoutRequestSerializer(serializers.Serializer):
    venue = serializers.CharField(max_length=255)
    city = serializers.CharField(max_length=120)
    place_id = serializers.CharField(max_length=255, required=False, allow_blank=True, default="")
    name = serializers.CharField(max_length=120)
    rows = serializers.IntegerField()
    cols = serializers.IntegerField()
    sections = serializers.ListField(child=serializers.DictField(), allow_empty=False)
    grid = serializers.ListField(child=serializers.ListField(), allow_empty=False)


class SectionPriceSerializer(serializers.Serializer):
    section_id = serializers.CharField(max_length=40)
    price_minor = serializers.IntegerField(min_value=0)


class EnableSeatingRequestSerializer(serializers.Serializer):
    layout_id = serializers.UUIDField()
    prices = SectionPriceSerializer(many=True, allow_empty=False)


def present_layout(layout) -> dict:
    return {
        "id": str(layout.id),
        "name": layout.name,
        "venue": layout.venue_name,
        "city": layout.city,
        "rows": layout.rows,
        "cols": layout.cols,
        "sections": layout.sections,
        "grid": layout.grid,
        "seat_count": layout.seat_count,
        "created_at": layout.created_at.isoformat(),
    }

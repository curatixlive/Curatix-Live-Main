from django.apps import AppConfig


class ReviewsConfig(AppConfig):
    name = "apps.reviews"
    label = "reviews"

    def ready(self) -> None:
        """Register the review-request task so it exists before anything enqueues it.

        `reviews` still emits and consumes no domain events: a review is a person
        choosing to write something. Only the scheduled request email lives here.
        """
        from . import tasks  # noqa: F401

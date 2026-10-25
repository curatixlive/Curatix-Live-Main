"""No models: the community page is a read-side composition.

Everything on it already has an owner — the organization (profile, followers),
events (upcoming and past) and reviews (ratings). Like `console`, this module
only READS across them, downward, and writes nothing, so it cannot break
another module's invariants.
"""

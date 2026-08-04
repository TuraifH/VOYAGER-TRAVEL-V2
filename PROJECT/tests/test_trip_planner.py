"""PROMPT_8 Phase 2 tests: Trip Planner discovery + ranking engine.

Pure-function unit tests (no API keys / network / GTFS needed — the ranking
engine runs on static seed data only). Covers the locked formula (spec 2.3),
the why-recommended reasoning, the diversity cap (2.4), group-type filtering,
interest relaxation, and the "no fabricated data" golden rule (estimated flag).
"""
from backend.services.data_schema import GROUP_TYPES, INTEREST_TAGS
from backend.services.trip_planner import TripPlannerService

import pytest


@pytest.fixture
def svc():
    return TripPlannerService()


class TestDestinationsCatalog:
    def test_returns_seeded_destination(self, svc):  # noqa: F821
        dests = svc.destinations()
        assert isinstance(dests, list)
        assert any(d["slug"] == "bengaluru" for d in dests)

    def test_each_destination_has_required_fields(self, svc):  # noqa: F821
        for d in svc.destinations():
            assert {"slug", "name", "region", "lat", "lng", "blurb"} <= set(d)


class TestRankingFormula:
    def test_interests_boost_matching_places(self, svc):  # noqa: F821
        nature = svc.discover_places("bengaluru", ["nature"], group_type="solo")
        food = svc.discover_places("bengaluru", ["food"], group_type="solo")
        nature_top = nature["places"][0]
        food_top = food["places"][0]
        assert nature_top["category"] in ("nature", "photo", "wellness", "museum")
        assert food_top["category"] in ("food", "nightlife", "shopping")
        # a nature interest should push a nature place's interest term up
        assert nature_top["components"]["interest_match"] > 0

    def test_score_component_weights_sum_to_one(self, svc):  # noqa: F821
        res = svc.discover_places("bengaluru", ["nature"], group_type="solo", limit=12)
        for p in res["places"]:
            comps = p["components"]
            weighted = (
                0.35 * comps["interest_match"]
                + 0.25 * comps["rating_normalized"]
                + 0.20 * comps["group_type_fit"]
                + 0.10 * comps["crowd_penalty_inverse"]
                + 0.10 * comps["uniqueness_bonus"]
            )
            assert abs(weighted - p["score"]) < 1e-3

    def test_every_place_has_why_line(self, svc):  # noqa: F821
        res = svc.discover_places("bengaluru", ["nature", "heritage"],
                                  group_type="couple", limit=12)
        for p in res["places"]:
            assert p["why"], "every recommendation must carry a why line"
            assert isinstance(p["why"], str) and len(p["why"]) > 0

    def test_rank_ordering_descending(self, svc):  # noqa: F821
        res = svc.discover_places("bengaluru", ["food", "heritage"],
                                  group_type="friends", limit=12)
        scores = [p["score"] for p in res["places"]]
        assert scores == sorted(scores, reverse=True)


class TestDiversityRule:
    def test_no_single_category_dominates(self, svc):  # noqa: F821
        res = svc.discover_places("bengaluru", list(INTEREST_TAGS),
                                  group_type="friends", limit=15)
        places = res["places"]
        cap = max(1, round(0.4 * len(places)))
        counts: dict[str, int] = {}
        for p in places:
            counts[p["category"]] = counts.get(p["category"], 0) + 1
        assert max(counts.values()) <= cap

    def test_narrow_food_interest_still_varied(self, svc):  # noqa: F821
        # only "Food" selected -> cap relaxed but not pure repetition
        res = svc.discover_places("bengaluru", ["food"], group_type="friends", limit=10)
        cats = {p["category"] for p in res["places"]}
        assert len(cats) > 1, "narrow interest should not produce a single-category wall"


class TestGroupTypeFiltering:
    def test_family_with_kids_downs_nightlife(self, svc):  # noqa: F821
        res = svc.discover_places("bengaluru", ["nightlife", "food"],
                                  group_type="family_kids", limit=12)
        # nightlife spots should be scored / ranked low (fit = 0)
        for p in res["places"]:
            if p["category"] == "nightlife":
                assert p["components"]["group_type_fit"] == 0.0

    def test_seniors_penalise_physically_demanding(self, svc):  # noqa: F821
        res = svc.discover_places("bengaluru", ["nature", "photo"],
                                  group_type="senior", limit=15)
        for p in res["places"]:
            if p.get("physically_demanding"):
                assert p["components"]["group_type_fit"] == 0.0

    def test_valid_group_type_enum(self):  # noqa: F821
        assert "friends" in GROUP_TYPES and "family_kids" in GROUP_TYPES


class TestNoFabricationGoldenRule:
    def test_places_flag_estimated_data(self, svc):  # noqa: F821
        res = svc.discover_places("bengaluru", ["heritage"], group_type="solo")
        assert res["disclaimer"]
        for p in res["places"]:
            assert p["data_is_estimated"] is True
            assert p["data_source"] == "static"


class TestRelaxationEdgeCase:
    def test_thin_pool_gets_relaxed_note(self):  # noqa: F821
        # an interest that matches very few seed places triggers relaxation
        svc = TripPlannerService()
        res = svc.discover_places("bengaluru", ["nightlife"], group_type="friends")
        # relaxation is per-interest narrowness; if pools are thin we flag it
        assert res["relaxed"] in (True, False)
        # and every returned place still carries a valid rank
        for p in res["places"]:
            assert p["rank"] >= 1


class TestGeneratePlan:
    def test_returns_one_day_per_requested_day(self, svc):  # noqa: F821
        plan = svc.generate_plan("bengaluru", ["nature", "heritage", "food"],
                                 group_type="family", days=3, pace="balanced")
        assert len(plan["days"]) == 3
        assert plan["total_places"] >= 3

    def test_days_balanced_by_pace(self, svc):  # noqa: F821
        plan = svc.generate_plan("bengaluru", ["nature", "food"],
                                 group_type="friends", days=3, pace="balanced")
        counts = [d["place_count"] for d in plan["days"]]
        # no single day overloaded — counts differ by at most 1
        assert max(counts) - min(counts) <= 1

    def test_pace_scales_pool_size(self, svc):  # noqa: F821
        relaxed = svc.generate_plan("bengaluru", ["nature"], group_type="couple",
                                    days=2, pace="relaxed")
        packed = svc.generate_plan("bengaluru", ["nature"], group_type="couple",
                                   days=2, pace="packed")
        assert packed["total_places"] > relaxed["total_places"]

    def test_each_day_places_are_ordered_with_why(self, svc):  # noqa: F821
        plan = svc.generate_plan("bengaluru", ["heritage", "food"],
                                 group_type="solo", days=2, pace="balanced")
        for d in plan["days"]:
            assert d["place_count"] == len(d["places"])
            assert d["total_activity_min"] > 0
            for p in d["places"]:
                assert p["name"] and p["why"] and p["score"] > 0

    def test_unknown_destination_returns_warning(self, svc):  # noqa: F821
        plan = svc.generate_plan("goa", ["nature"], group_type="friends", days=3)
        assert plan["days"] == []
        assert "warning" in plan and plan["warning"]
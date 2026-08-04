"""Trip Planner static seed data (PROMPT_8 Phase 2 — discovery).

Curated, real places for Bengaluru with real lat/lng. Ratings / fees /
durations / crowd are TYPICAL-ESTIMATED values (not live-verified): every
entry is flagged `data_is_estimated=True` / `data_source="static"` and the
module surfaces that disclaimer to the user (spec 2.2). Nothing is fabricated.

The roster is the seed for the ranking engine; live API data can be swapped in
later without changing the engine contract (same `TripPlace` shape).
"""
from .data_schema import INTEREST_TAGS, TimeSlot, TripPlace

# interest tag vocabulary (INTEREST_TAGS): nature, heritage, food, adventure,
# shopping, nightlife, wellness, offbeat, religious, museum, photo

SLOTS: tuple[TimeSlot, ...] = (
    "early_morning", "morning", "afternoon", "evening", "night",
)


def _place(
    id: str, name: str, category: str, description: str, duration_min: int,
    entry_fee: float, rating: float, review_count: int, lat: float, lng: float,
    tags: list[str], best_times: list[TimeSlot],
    crowd: dict[TimeSlot, str] | None = None,
    opening_hours: str = "", weekly_closures: list[str] | None = None,
    family_friendly: bool = True, physically_demanding: bool = False,
    accessibility_notes: str = "",
) -> TripPlace:
    return TripPlace(
        id=id, name=name, category=category, description=description,
        duration_min=duration_min, entry_fee=entry_fee, rating=rating,
        review_count=review_count, lat=lat, lng=lng, tags=tags,
        best_times=best_times, crowd=crowd or {}, opening_hours=opening_hours,
        weekly_closures=weekly_closures or [], family_friendly=family_friendly,
        physically_demanding=physically_demanding,
        accessibility_notes=accessibility_notes,
        destination="bengaluru", data_source="static", data_is_estimated=True,
    )


# Bengaluru places — real locations; numbers are typical-estimated, not live.
_BENGALURU_PLACES: list[TripPlace] = [
    _place(
        id="bg_nature_cubbon", name="Cubbon Park",
        category="nature",
        description="Large green lung in the city centre with tree-lined walks, "
                    "jogging tracks and the State Central Library.",
        duration_min=90, entry_fee=0.0, rating=4.6, review_count=42000,
        lat=12.9772, lng=77.5936, tags=["nature", "wellness", "photo"],
        best_times=["early_morning", "morning", "evening"],
        crowd={"early_morning": "low", "morning": "medium",
               "afternoon": "medium", "evening": "high"},
        opening_hours="All day, free public park",
        family_friendly=True,
        accessibility_notes="Flat paved paths, wheelchair-friendly entrances.",
    ),
    _place(
        id="bg_nature_lalbagh", name="Lalbagh Botanical Garden",
        category="nature",
        description="240-acre botanical garden famous for its glasshouse flower "
                    "show and 1,000+ year old trees.",
        duration_min=120, entry_fee=50.0, rating=4.7, review_count=58000,
        lat=12.9507, lng=77.5848, tags=["nature", "photo", "wellness"],
        best_times=["early_morning", "morning", "evening"],
        crowd={"early_morning": "medium", "morning": "medium",
               "afternoon": "high", "evening": "medium"},
        opening_hours="Open 6:00 AM - 7:00 PM",
        family_friendly=True,
    ),
    _place(
        id="bg_heritage_palace", name="Bangalore Palace",
        category="heritage",
        description="Tudor-style royal palace with grand halls, art and "
                    "photography-friendly interiors.",
        duration_min=90, entry_fee=500.0, rating=4.4, review_count=13000,
        lat=12.9985, lng=77.5921, tags=["heritage", "photo", "museum"],
        best_times=["morning", "afternoon"],
        crowd={"morning": "medium", "afternoon": "high", "evening": "medium"},
        opening_hours="Open 10:00 AM - 5:30 PM",
        family_friendly=True,
        accessibility_notes="Sloppy gravel paths, uneven in places.",
    ),
    _place(
        id="bg_heritage_tipu", name="Tipu Sultan's Summer Palace",
        category="heritage",
        description="18th-century teak palace with balconies, murals and a small "
                    "history museum of the Mysuru Sultanate.",
        duration_min=60, entry_fee=20.0, rating=4.3, review_count=9000,
        lat=12.9613, lng=77.5741, tags=["heritage", "religious", "museum", "offbeat"],
        best_times=["morning", "afternoon"],
        crowd={"morning": "low", "afternoon": "medium"},
        opening_hours="Open 8:30 AM - 5:30 PM",
        family_friendly=True,
    ),
    _place(
        id="bg_heritage_vidhana", name="Vidhana Soudha",
        category="heritage",
        description="Granite legislative palace and an iconic landmark — best for "
                    "photography (viewed from outside).",
        duration_min=30, entry_fee=0.0, rating=4.6, review_count=8000,
        lat=12.9795, lng=77.5906, tags=["photo", "heritage"],
        best_times=["early_morning", "evening"],
        crowd={"early_morning": "low", "morning": "medium",
               "afternoon": "medium", "evening": "medium"},
        opening_hours="Public entry on prior permission; exterior free", family_friendly=True,
    ),
    _place(
        id="bg_museum_vitm", name="Visvesvaraya Industrial & Technological Museum",
        category="museum",
        description="Hands-on science museum with interactive exhibits — a hit "
                    "with kids and families.",
        duration_min=120, entry_fee=25.0, rating=4.5, review_count=21000,
        lat=12.9746, lng=77.5953, tags=["museum", "adventure", "photo"],
        best_times=["morning", "afternoon"],
        crowd={"morning": "medium", "afternoon": "high"},
        opening_hours="Open 10:00 AM - 5:30 PM; closed Mondays",
        weekly_closures=["Monday"],
        family_friendly=True,
    ),
    _place(
        id="bg_museum_ngma", name="National Gallery of Modern Art",
        category="museum",
        description="Modern and contemporary Indian art in a restored palace "
                    "garden setting.",
        duration_min=90, entry_fee=30.0, rating=4.4, review_count=7000,
        lat=12.9937, lng=77.5873, tags=["museum", "photo", "heritage"],
        best_times=["morning", "afternoon"],
        crowd={"morning": "low", "afternoon": "medium"},
        opening_hours="Open 10:00 AM - 5:00 PM; closed Mondays",
        weekly_closures=["Monday"],
        family_friendly=True,
        accessibility_notes="Ramps and lifts to most galleries.",
    ),
    _place(
        id="bg_food_vvpuram", name="V V Puram Food Street",
        category="food",
        description="Iconic open-air South Indian food street with dosas, filter "
                    "coffee and sweet stalls.",
        duration_min=60, entry_fee=0.0, rating=4.5, review_count=15000,
        lat=12.9532, lng=77.5763, tags=["food", "nature"],
        best_times=["evening", "night"],
        crowd={"evening": "high", "night": "medium"},
        opening_hours="Street food evenings, ~6 PM onwards", family_friendly=True,
    ),
    _place(
        id="bg_food_mtr", name="Mavalli Tiffin Rooms (MTR)",
        category="food",
        description="Heritage South Indian restaurant serving breakfast classics "
                    "since 1924.",
        duration_min=60, entry_fee=0.0, rating=4.3, review_count=18000,
        lat=12.9567, lng=77.5768, tags=["food", "heritage"],
        best_times=["morning", "afternoon"],
        crowd={"morning": "high", "afternoon": "medium"},
        opening_hours="Open 6:30 AM - 10:00 PM", family_friendly=True,
    ),
    _place(
        id="bg_religious_iskcon", name="ISKCON Sri Radha Krishna temple",
        category="religious",
        description="Sprawling hillside Krishna temple complex with ornate hall, "
                    "shops and dining.",
        duration_min=90, entry_fee=0.0, rating=4.7, review_count=32000,
        lat=13.0075, lng=77.5526, tags=["religious", "photo", "shopping"],
        best_times=["early_morning", "morning", "evening"],
        crowd={"early_morning": "low", "morning": "medium",
               "afternoon": "medium", "evening": "high"},
        opening_hours="Open ~4:15 AM - 9:00 PM daily",
        family_friendly=True, accessibility_notes="Temple has ramps and lifts.",
    ),
    _place(
        id="bg_religious_bull", name="Bull Temple (Dodda Basavana Gudi)",
        category="religious",
        description="16th-century temple with a giant monolithic granite bull "
                    "statue and the annual Kadalekai Parishe.",
        duration_min=45, entry_fee=0.0, rating=4.5, review_count=13000,
        lat=12.9236, lng=77.5735, tags=["religious", "heritage", "offbeat"],
        best_times=["morning", "evening"],
        crowd={"morning": "medium", "afternoon": "low", "evening": "medium"},
        opening_hours="Open 6:00 AM - 12:00 PM, 5:00 PM - 8:00 PM (approx)",
        family_friendly=True,
    ),
    _place(
        id="bg_religious_mary", name="St. Mary's Basilica",
        category="religious",
        description="One of India's oldest churches, hosting the grand annual "
                    "St. Mary's feast in Shivajinagar.",
        duration_min=45, entry_fee=0.0, rating=4.6, review_count=6000,
        lat=12.9830, lng=77.6056, tags=["religious", "heritage", "photo"],
        best_times=["morning", "evening"],
        crowd={"morning": "medium", "afternoon": "low", "evening": "medium"},
        opening_hours="Open ~5:30 AM - 8:00 PM (approx)", family_friendly=True,
    ),
    _place(
        id="bg_shop_commercial", name="Commercial Street",
        category="shopping",
        description="Bustling bazaar street for clothes, jewellery, electronics "
                    "and street food.",
        duration_min=150, entry_fee=0.0, rating=4.3, review_count=11000,
        lat=12.9822, lng=77.6071, tags=["shopping", "food", "photo"],
        best_times=["morning", "afternoon", "evening"],
        crowd={"morning": "medium", "afternoon": "high", "evening": "high"},
        opening_hours="Most shops 10 AM - 9 PM", family_friendly=True,
    ),
    _place(
        id="bg_shop_chickpete", name="Chickpete / K.R. Market",
        category="shopping",
        description="Heritage wholesale market district best known for fresh "
                    "produce, flowers and fabric lanes.",
        duration_min=120, entry_fee=0.0, rating=4.2, review_count=7000,
        lat=12.9722, lng=77.5795, tags=["shopping", "photo", "offbeat"],
        best_times=["early_morning", "morning"],
        crowd={"early_morning": "medium", "morning": "high", "afternoon": "medium"},
        opening_hours="Market early morning - evening (approx)", family_friendly=True,
    ),
    _place(
        id="bg_shop_ubcity", name="UB City Mall",
        category="shopping",
        description="Luxury retail and upscale dining complex on Vittal Mallya "
                    "Road with contemporary art spaces.",
        duration_min=120, entry_fee=0.0, rating=4.4, review_count=12000,
        lat=12.9725, lng=77.5956, tags=["shopping", "food", "nightlife"],
        best_times=["afternoon", "evening", "night"],
        crowd={"afternoon": "medium", "evening": "high", "night": "medium"},
        opening_hours="Mall ~10 AM - 11 PM", family_friendly=True,
    ),
    _place(
        id="bg_night_indiranagar", name="Indiranagar 100 Ft Road",
        category="nightlife",
        description="Lively stretch of cafés, pubs and restaurants popular with "
                    "friends and young couples.",
        duration_min=120, entry_fee=0.0, rating=4.3, review_count=9000,
        lat=12.9719, lng=77.6412, tags=["nightlife", "food", "shopping"],
        best_times=["evening", "night"],
        crowd={"evening": "high", "night": "high"},
        opening_hours="Pubs/cafés evening - late (approx)",
        family_friendly=False, physically_demanding=False,
        accessibility_notes="Plenty of restaurants with accessible entrances.",
    ),
    _place(
        id="bg_night_koramangala", name="Koramangala 5th Block",
        category="nightlife",
        description="Food-and-nightlife hub with breweries, live-music venues "
                    "and late-night dining.",
        duration_min=120, entry_fee=0.0, rating=4.2, review_count=12000,
        lat=12.9352, lng=77.6245, tags=["nightlife", "food"],
        best_times=["evening", "night"],
        crowd={"evening": "high", "night": "high"},
        opening_hours="Restaurants/bars evening - late (approx)",
        family_friendly=False,
    ),
    _place(
        id="bg_adventure_wonderla", name="Wonderla Amusement Park",
        category="adventure",
        description="Large amusement and water park with rides and family zones "
                    "south of the city.",
        duration_min=360, entry_fee=1600.0, rating=4.5, review_count=20000,
        lat=12.8237, lng=77.5560, tags=["adventure", "nature", "family"],
        best_times=["morning", "afternoon"],
        crowd={"morning": "medium", "afternoon": "high"},
        opening_hours="Open ~11 AM - 6 PM (approx)",
        family_friendly=True, accessibility_notes="Rides may have height limits.",
    ),
    _place(
        id="bg_adventure_bannerghatta", name="Bannerghatta Biological Park",
        category="adventure",
        description="Zoo, safari and butterfly park where you can ride a safari "
                    "bus past big cats in natural enclosures.",
        duration_min=240, entry_fee=400.0, rating=4.4, review_count=23000,
        lat=12.8002, lng=77.5784, tags=["adventure", "nature"],
        best_times=["early_morning", "morning"],
        crowd={"early_morning": "low", "morning": "high", "afternoon": "medium"},
        opening_hours="Open 9:00 AM - 5:00 PM; closed Tuesdays",
        weekly_closures=["Tuesday"],
        family_friendly=True, physically_demanding=False,
        accessibility_notes="Buggy available within safari route.",
    ),
    _place(
        id="bg_wellness_aol", name="Art of Living International Centre",
        category="wellness",
        description="Peaceful ashram campus on the Kanakapura road with gardens, "
                    "meditation halls and dining.",
        duration_min=150, entry_fee=0.0, rating=4.5, review_count=9000,
        lat=12.8787, lng=77.5235, tags=["wellness", "nature", "religious"],
        best_times=["early_morning", "morning", "evening"],
        crowd={"early_morning": "low", "morning": "medium", "evening": "medium"},
        opening_hours="Campus open daytime; grand meditation dome (approx)",
        family_friendly=True,
    ),
    _place(
        id="bg_offbeat_hal", name="HAL Heritage Centre & Aerospace Museum",
        category="museum",
        description="Showcases vintage Indian Air Force and HAL aircraft — a "
                    "quirky aviation offbeat pick.",
        duration_min=60, entry_fee=50.0, rating=4.1, review_count=3500,
        lat=12.9478, lng=77.6606, tags=["offbeat", "photo", "museum"],
        best_times=["morning", "afternoon"],
        crowd={"morning": "low", "afternoon": "medium"},
        opening_hours="Open 9:00 AM - 5:00 PM (approx)",
        family_friendly=True,
    ),
    _place(
        id="bg_offbeat_devanahalli", name="Devanahalli Fort",
        category="heritage",
        description="Birthplace fort of Tipu Sultan in Devanahalli town, near the "
                    "airport — an offbeat heritage stop.",
        duration_min=90, entry_fee=0.0, rating=4.2, review_count=3000,
        lat=13.2498, lng=77.7116, tags=["offbeat", "heritage", "photo"],
        best_times=["morning", "afternoon", "evening"],
        crowd={"morning": "low", "afternoon": "low", "evening": "medium"},
        opening_hours="Open daytime (approx)",
        family_friendly=True, physically_demanding=True,
        accessibility_notes="Rough paths; not wheelchair accessible.",
    ),
    _place(
        id="bg_offbeat_nandi", name="Nandi Hills",
        category="nature",
        description="Early-morning hilltop famous for sunrise, with gardens and "
                    "a small fort — a favourite photography trip.",
        duration_min=240, entry_fee=30.0, rating=4.6, review_count=26000,
        lat=13.3702, lng=77.6835, tags=["nature", "photo", "adventure", "offbeat"],
        best_times=["early_morning", "morning"],
        crowd={"early_morning": "medium", "morning": "high", "afternoon": "low"},
        opening_hours="Open sunrise - sunset (approx); gates manageable parking",
        weekly_closures=[""] ,
        family_friendly=True, physically_demanding=True,
        accessibility_notes="Steep approach roads; long drive from city.",
    ),
]


def destinations() -> list[dict]:
    return [
        {
            "slug": "bengaluru",
            "name": "Bengaluru (Bangalore)",
            "region": "Karnataka, India",
            "lat": 12.9716, "lng": 77.5946,
            "blurb": "Garden city with heritage, food streets, shopping bazaars "
                     "and green parks — plus weekend hill getaways nearby.",
            "place_count": len(_BENGALURU_PLACES),
        }
    ]


def places_for_destination(slug: str) -> list[TripPlace]:
    if slug == "bengaluru":
        return list(_BENGALURU_PLACES)
    return []
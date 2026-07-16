"""
Venue coordinates per team name.

The seed script merges these into the teams table. Team names are the
API feed strings from teams_seed.py and must match exactly.

Indoor venues skip the weather API call entirely (is_indoor=True).
"""

VENUES: dict[str, dict] = {
    # ── NRL ─────────────────────────────────────────────────────────────
    "Brisbane Broncos": dict(venue="Suncorp Stadium", lat=-27.4653, lon=153.0094, indoor=False),
    "Canberra Raiders": dict(venue="GIO Stadium", lat=-35.2975, lon=149.1175, indoor=False),
    "Canterbury Bulldogs": dict(venue="Accor Stadium", lat=-33.8473, lon=150.9013, indoor=False),
    "Cronulla Sutherland Sharks": dict(venue="PointsBet Stadium", lat=-34.0363, lon=151.1225, indoor=False),
    "Dolphins": dict(venue="Suncorp Stadium", lat=-27.4653, lon=153.0094, indoor=False),
    "Gold Coast Titans": dict(venue="Cbus Super Stadium", lat=-27.9681, lon=153.3888, indoor=False),
    "Manly Warringah Sea Eagles": dict(venue="4 Pines Park", lat=-33.7600, lon=151.2850, indoor=False),
    "Melbourne Storm": dict(venue="AAMI Park", lat=-37.8200, lon=144.9800, indoor=False),
    "New Zealand Warriors": dict(venue="Mount Smart Stadium", lat=-36.9050, lon=174.8470, indoor=False),
    "Newcastle Knights": dict(venue="McDonald Jones Stadium", lat=-32.9267, lon=151.7494, indoor=False),
    "North Queensland Cowboys": dict(venue="Queensland Country Bank Stadium", lat=-19.2583, lon=146.8083, indoor=False),
    "Penrith Panthers": dict(venue="BlueBet Stadium", lat=-33.7358, lon=150.6878, indoor=False),
    "South Sydney Rabbitohs": dict(venue="Accor Stadium", lat=-33.8473, lon=150.9013, indoor=False),
    "St George Illawarra Dragons": dict(venue="Netstrata Jubilee Stadium", lat=-33.9658, lon=151.0492, indoor=False),
    "Sydney Roosters": dict(venue="Allianz Stadium", lat=-33.8915, lon=151.2248, indoor=False),
    "Wests Tigers": dict(venue="Leichhardt Oval", lat=-33.8793, lon=151.1513, indoor=False),

    # ── AFL ─────────────────────────────────────────────────────────────
    "Adelaide Crows": dict(venue="Adelaide Oval", lat=-34.9152, lon=138.5952, indoor=False),
    "Brisbane Lions": dict(venue="The Gabba", lat=-27.4858, lon=153.0381, indoor=False),
    "Carlton Blues": dict(venue="MCG", lat=-37.8200, lon=144.9835, indoor=False),
    "Collingwood Magpies": dict(venue="MCG", lat=-37.8200, lon=144.9835, indoor=False),
    "Essendon Bombers": dict(venue="Marvel Stadium", lat=-37.8167, lon=144.9473, indoor=False),
    "Fremantle Dockers": dict(venue="Optus Stadium", lat=-31.9516, lon=115.8892, indoor=False),
    "Geelong Cats": dict(venue="GMHBA Stadium", lat=-38.1516, lon=144.3581, indoor=False),
    "Gold Coast Suns": dict(venue="Heritage Bank Stadium", lat=-27.9681, lon=153.3888, indoor=False),
    "Greater Western Sydney Giants": dict(venue="ENGIE Stadium", lat=-33.8478, lon=150.9863, indoor=False),
    "Hawthorn Hawks": dict(venue="MCG", lat=-37.8200, lon=144.9835, indoor=False),
    "Melbourne Demons": dict(venue="MCG", lat=-37.8200, lon=144.9835, indoor=False),
    "North Melbourne Kangaroos": dict(venue="Marvel Stadium", lat=-37.8167, lon=144.9473, indoor=False),
    "Port Adelaide Power": dict(venue="Adelaide Oval", lat=-34.9152, lon=138.5952, indoor=False),
    "Richmond Tigers": dict(venue="MCG", lat=-37.8200, lon=144.9835, indoor=False),
    "St Kilda Saints": dict(venue="Marvel Stadium", lat=-37.8167, lon=144.9473, indoor=False),
    "Sydney Swans": dict(venue="SCG", lat=-33.8920, lon=151.2243, indoor=False),
    "West Coast Eagles": dict(venue="Optus Stadium", lat=-31.9516, lon=115.8892, indoor=False),
    "Western Bulldogs": dict(venue="Marvel Stadium", lat=-37.8167, lon=144.9473, indoor=False),

    # ── NFL ─────────────────────────────────────────────────────────────
    "Arizona Cardinals": dict(venue="State Farm Stadium", lat=33.5276, lon=-112.2626, indoor=True),
    "Atlanta Falcons": dict(venue="Mercedes-Benz Stadium", lat=33.7554, lon=-84.4008, indoor=True),
    "Baltimore Ravens": dict(venue="M&T Bank Stadium", lat=39.2780, lon=-76.6227, indoor=False),
    "Buffalo Bills": dict(venue="Highmark Stadium", lat=42.7738, lon=-78.7869, indoor=False),
    "Carolina Panthers": dict(venue="Bank of America Stadium", lat=35.2258, lon=-80.8527, indoor=False),
    "Chicago Bears": dict(venue="Soldier Field", lat=41.8623, lon=-87.6167, indoor=False),
    "Cincinnati Bengals": dict(venue="Paycor Stadium", lat=39.0954, lon=-84.5161, indoor=False),
    "Cleveland Browns": dict(venue="Huntington Bank Field", lat=41.5061, lon=-81.6995, indoor=False),
    "Dallas Cowboys": dict(venue="AT&T Stadium", lat=32.7480, lon=-97.0929, indoor=True),
    "Denver Broncos": dict(venue="Empower Field at Mile High", lat=39.7439, lon=-105.0201, indoor=False),
    "Detroit Lions": dict(venue="Ford Field", lat=42.3400, lon=-83.0456, indoor=True),
    "Green Bay Packers": dict(venue="Lambeau Field", lat=44.5013, lon=-88.0623, indoor=False),
    "Houston Texans": dict(venue="NRG Stadium", lat=29.6847, lon=-95.4107, indoor=True),
    "Indianapolis Colts": dict(venue="Lucas Oil Stadium", lat=39.7601, lon=-86.1639, indoor=True),
    "Jacksonville Jaguars": dict(venue="EverBank Stadium", lat=30.3239, lon=-81.6372, indoor=False),
    "Kansas City Chiefs": dict(venue="GEHA Field at Arrowhead Stadium", lat=39.0489, lon=-94.4839, indoor=False),
    "Las Vegas Raiders": dict(venue="Allegiant Stadium", lat=36.0908, lon=-115.1833, indoor=True),
    "Los Angeles Chargers": dict(venue="SoFi Stadium", lat=33.9535, lon=-118.3392, indoor=True),
    "Los Angeles Rams": dict(venue="SoFi Stadium", lat=33.9535, lon=-118.3392, indoor=True),
    "Miami Dolphins": dict(venue="Hard Rock Stadium", lat=25.9580, lon=-80.2389, indoor=False),
    "Minnesota Vikings": dict(venue="U.S. Bank Stadium", lat=44.9739, lon=-93.2575, indoor=True),
    "New England Patriots": dict(venue="Gillette Stadium", lat=42.0909, lon=-71.2643, indoor=False),
    "New Orleans Saints": dict(venue="Caesars Superdome", lat=29.9511, lon=-90.0812, indoor=True),
    "New York Giants": dict(venue="MetLife Stadium", lat=40.8136, lon=-74.0744, indoor=False),
    "New York Jets": dict(venue="MetLife Stadium", lat=40.8136, lon=-74.0744, indoor=False),
    "Philadelphia Eagles": dict(venue="Lincoln Financial Field", lat=39.9008, lon=-75.1675, indoor=False),
    "Pittsburgh Steelers": dict(venue="Acrisure Stadium", lat=40.4468, lon=-80.0157, indoor=False),
    "San Francisco 49ers": dict(venue="Levi's Stadium", lat=37.4032, lon=-121.9698, indoor=False),
    "Seattle Seahawks": dict(venue="Lumen Field", lat=47.5952, lon=-122.3316, indoor=False),
    "Tampa Bay Buccaneers": dict(venue="Raymond James Stadium", lat=27.9759, lon=-82.5033, indoor=False),
    "Tennessee Titans": dict(venue="Nissan Stadium", lat=36.1665, lon=-86.7713, indoor=False),
    "Washington Commanders": dict(venue="Northwest Stadium", lat=38.9077, lon=-76.8645, indoor=False),
}

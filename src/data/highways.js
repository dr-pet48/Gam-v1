// Kenya Class-A (international trunk) highway data.
//
// Waypoints are real towns/landmarks along each corridor: WGS84 lat/lon,
// approximate elevation above sea level (m) and county. Each waypoint also
// describes the road *from that point to the next* (`seg`): landscape biome,
// lanes per direction, whether it is a dual carriageway and the posted
// speed limit for light vehicles (km/h).
//
// Route numbers follow KeNHA's current classification; older designations
// that drivers still use (e.g. A104 / A109) are listed under `aka`.
// Road lengths marked `official` are published figures; others are derived
// from the waypoints with a road-winding factor.

const W = (name, lat, lon, elev, county, kind, seg, note) => ({
  name, lat, lon, elev, county, kind, seg, note,
});
// seg helper: biome, lanes per direction, dual carriageway, speed limit
const S = (biome, lanes = 1, dual = false, limit = 100) => ({ biome, lanes, dual, limit });

export const HIGHWAYS = [
  {
    id: 'A8',
    code: 'A8',
    name: 'Northern Corridor',
    aka: 'Mombasa–Nairobi (ex-A109) · Nairobi–Malaba (ex-A104)',
    lengthKm: 923,
    official: true,
    connects: 'Port of Mombasa → Nairobi → Uganda border (Malaba)',
    description:
      "Kenya's busiest freight artery: container trucks from the Port of Mombasa cross Tsavo, climb to Nairobi, drop into the Great Rift Valley and top out at Timboroa (~2,800 m) before reaching Uganda.",
    waypoints: [
      W('Mombasa', -4.043, 39.668, 20, 'Mombasa', 'city', S('urban', 2, true, 50), 'Port city — start of the Northern Corridor'),
      W('Changamwe', -4.026, 39.630, 30, 'Mombasa', 'town', S('coastal', 2, true, 80), 'Kwa Jomvu dual carriageway'),
      W('Mariakani', -3.862, 39.473, 180, 'Kilifi', 'weighbridge', S('coastal', 1, false, 100), 'Mariakani weighbridge — heavy goods vehicles must stop'),
      W('Mackinnon Road', -3.735, 39.040, 330, 'Taita-Taveta', 'town', S('savanna', 1, false, 100)),
      W('Voi', -3.396, 38.556, 560, 'Taita-Taveta', 'town', S('savanna', 1, false, 100), 'Gateway to Tsavo East — A23 to Taveta branches here'),
      W('Tsavo River', -2.995, 38.468, 470, 'Taita-Taveta', 'landmark', S('savanna', 1, false, 80), 'Tsavo National Park — wildlife crossing, reduce speed'),
      W('Mtito Andei', -2.690, 38.166, 750, 'Makueni', 'town', S('savanna', 1, false, 100), 'Halfway stop between Nairobi and Mombasa'),
      W('Kibwezi', -2.412, 37.967, 900, 'Makueni', 'town', S('savanna', 1, false, 100)),
      W('Makindu', -2.278, 37.826, 1000, 'Makueni', 'town', S('savanna', 1, false, 100), 'Chyulu Hills to the south-west'),
      W('Emali', -2.080, 37.473, 1150, 'Makueni', 'town', S('savanna', 1, false, 100)),
      W('Sultan Hamud', -2.020, 37.375, 1200, 'Makueni', 'town', S('savanna', 1, false, 100)),
      W('Salama', -1.880, 37.240, 1400, 'Makueni', 'town', S('savanna', 1, false, 100)),
      W('Athi River', -1.456, 36.978, 1530, 'Machakos', 'weighbridge', S('urban', 2, true, 80), 'Athi River weighbridge · Mavoko'),
      W('Nairobi', -1.292, 36.822, 1661, 'Nairobi', 'city', S('urban', 2, true, 50), 'Capital city — Nairobi Expressway runs above Mombasa Road'),
      W('Limuru', -1.112, 36.642, 2250, 'Kiambu', 'town', S('highland', 1, false, 100), 'Tea country — start of the Rift escarpment road'),
      W('Kinale', -0.960, 36.600, 2550, 'Kiambu', 'landmark', S('forest', 1, false, 80), 'Kinale forest — steep descent into the Rift Valley'),
      W('Naivasha', -0.717, 36.431, 1890, 'Nakuru', 'town', S('riftvalley', 1, false, 100), 'Lake Naivasha & Mt Longonot nearby'),
      W('Gilgil', -0.493, 36.317, 2000, 'Nakuru', 'weighbridge', S('riftvalley', 1, false, 100), 'Gilgil weighbridge'),
      W('Nakuru', -0.303, 36.080, 1850, 'Nakuru', 'city', S('farmland', 1, false, 100), 'Nakuru City — Menengai Crater to the north'),
      W('Salgaa', -0.213, 35.866, 1950, 'Nakuru', 'landmark', S('highland', 1, false, 80), 'Salgaa — known accident black spot, drive carefully'),
      W('Mau Summit', -0.165, 35.675, 2600, 'Nakuru', 'junction', S('forest', 1, false, 80), 'Junction for Kericho & Kisumu (B1)'),
      W('Timboroa', 0.070, 35.538, 2800, 'Uasin Gishu', 'landmark', S('forest', 1, false, 80), 'Highest point on the corridor (~2,800 m), often foggy'),
      W('Burnt Forest', 0.222, 35.430, 2600, 'Uasin Gishu', 'town', S('farmland', 1, false, 100)),
      W('Eldoret', 0.514, 35.270, 2100, 'Uasin Gishu', 'city', S('farmland', 1, false, 100), 'Home of champions — wheat & maize plains'),
      W('Turbo', 0.630, 35.048, 1900, 'Uasin Gishu', 'town', S('farmland', 1, false, 100)),
      W('Webuye', 0.607, 34.771, 1500, 'Bungoma', 'weighbridge', S('farmland', 1, false, 100), 'Webuye weighbridge · Nzoia river'),
      W('Bungoma', 0.564, 34.561, 1400, 'Bungoma', 'town', S('farmland', 1, false, 100), 'Sugarcane belt'),
      W('Malaba', 0.636, 34.273, 1180, 'Busia', 'border', S('urban', 1, false, 50), 'Malaba One-Stop Border Post — Uganda'),
    ],
  },
  {
    id: 'A2',
    code: 'A2',
    name: 'Namanga – Nairobi – Moyale',
    aka: 'Cape-to-Cairo route · Thika Superhighway · ex-A104 (Namanga)',
    connects: 'Tanzania border (Namanga) → Nairobi → Ethiopia border (Moyale)',
    description:
      "Part of the Great North Road. Starts at the Tanzanian border under Kilimanjaro, crosses Maasai plains, runs the 8-lane Thika Superhighway, passes Mt Kenya on the Equator and then crosses the arid north to Ethiopia.",
    waypoints: [
      W('Namanga', -2.546, 36.790, 1300, 'Kajiado', 'border', S('savanna', 1, false, 50), 'Namanga One-Stop Border Post — Tanzania'),
      W('Bissil', -2.075, 36.830, 1550, 'Kajiado', 'town', S('savanna', 1, false, 100), 'Maasai rangelands'),
      W('Kajiado', -1.852, 36.776, 1750, 'Kajiado', 'town', S('savanna', 1, false, 100)),
      W('Isinya', -1.670, 36.840, 1650, 'Kajiado', 'town', S('savanna', 1, false, 100)),
      W('Kitengela', -1.474, 36.958, 1560, 'Kajiado', 'town', S('urban', 2, true, 80)),
      W('Athi River', -1.456, 36.978, 1530, 'Machakos', 'junction', S('urban', 2, true, 80), 'Joins Mombasa Road'),
      W('Nairobi', -1.292, 36.822, 1661, 'Nairobi', 'city', S('urban', 3, true, 80), 'Capital city — Thika Superhighway ahead'),
      W('Ruiru', -1.146, 36.961, 1550, 'Kiambu', 'town', S('urban', 3, true, 100)),
      W('Thika', -1.033, 37.069, 1530, 'Kiambu', 'town', S('farmland', 2, true, 100), 'Pineapple & coffee estates · A3 to Garissa branches here'),
      W('Kenol', -0.895, 37.152, 1450, "Murang'a", 'town', S('farmland', 2, true, 100), 'Kenol–Sagana–Marua dual carriageway'),
      W('Sagana', -0.668, 37.209, 1230, 'Kirinyaga', 'town', S('farmland', 2, true, 100)),
      W('Karatina', -0.483, 37.128, 1850, 'Nyeri', 'town', S('highland', 1, false, 100), 'One of the largest open-air markets in East Africa'),
      W('Naro Moru', -0.165, 37.020, 2000, 'Nyeri', 'town', S('highland', 1, false, 100), 'Base for Mt Kenya climbs'),
      W('Nanyuki', 0.006, 37.073, 1950, 'Laikipia', 'town', S('highland', 1, false, 100), 'Crossing the Equator'),
      W('Timau', 0.085, 37.238, 2500, 'Meru', 'town', S('highland', 1, false, 100), 'Wheat farms on the slopes of Mt Kenya'),
      W('Isiolo', 0.354, 37.582, 1100, 'Isiolo', 'town', S('arid', 1, false, 100), 'Gateway to Northern Kenya'),
      W('Archers Post', 0.641, 37.674, 850, 'Samburu', 'town', S('arid', 1, false, 100), 'Samburu & Buffalo Springs reserves'),
      W('Laisamis', 1.598, 37.807, 580, 'Marsabit', 'town', S('arid', 1, false, 100)),
      W('Marsabit', 2.328, 37.990, 1300, 'Marsabit', 'town', S('arid', 1, false, 100), 'Forested volcanic mountain in the desert'),
      W('Turbi', 3.330, 38.330, 760, 'Marsabit', 'town', S('arid', 1, false, 100), 'Dida Galgalu desert'),
      W('Moyale', 3.524, 39.055, 1100, 'Marsabit', 'border', S('urban', 1, false, 50), 'Moyale One-Stop Border Post — Ethiopia'),
    ],
  },
  {
    id: 'A1',
    code: 'A1',
    name: 'Isebania – Kisumu – Lodwar – Nadapal',
    aka: 'Western & North Rift corridor',
    connects: 'Tanzania border (Isebania) → Kisumu → Kitale → South Sudan border (Nadapal)',
    description:
      'Links the Lake Victoria basin to the far north-west: Gusii highlands, the lakeside city of Kisumu, the maize basket of Trans-Nzoia, the dramatic Marich Pass and the Turkana desert to South Sudan.',
    waypoints: [
      W('Isebania', -1.245, 34.476, 1400, 'Migori', 'border', S('farmland', 1, false, 50), 'Isebania/Sirari border — Tanzania'),
      W('Migori', -1.063, 34.473, 1400, 'Migori', 'town', S('farmland', 1, false, 100)),
      W('Rongo', -0.759, 34.598, 1500, 'Migori', 'town', S('farmland', 1, false, 100)),
      W('Kisii', -0.681, 34.766, 1700, 'Kisii', 'town', S('highland', 1, false, 100), 'Gusii highlands — banana & tea'),
      W('Sondu', -0.392, 35.011, 1300, 'Kisumu', 'town', S('farmland', 1, false, 100)),
      W('Ahero', -0.174, 34.918, 1160, 'Kisumu', 'town', S('farmland', 1, false, 100), 'Rice irrigation scheme'),
      W('Kisumu', -0.092, 34.768, 1135, 'Kisumu', 'city', S('farmland', 1, false, 100), 'Lakeside city on Lake Victoria'),
      W('Kakamega', 0.283, 34.752, 1535, 'Kakamega', 'town', S('forest', 1, false, 100), 'Near Kakamega rainforest'),
      W('Malava', 0.443, 34.857, 1600, 'Kakamega', 'town', S('farmland', 1, false, 100)),
      W('Webuye', 0.607, 34.771, 1500, 'Bungoma', 'junction', S('farmland', 1, false, 100), 'Crosses the Northern Corridor (A8)'),
      W('Kiminini', 0.894, 34.922, 1850, 'Trans-Nzoia', 'town', S('farmland', 1, false, 100)),
      W('Kitale', 1.016, 35.006, 1900, 'Trans-Nzoia', 'town', S('highland', 1, false, 100), 'Maize basket of Kenya · Mt Elgon to the west'),
      W('Kapenguria', 1.239, 35.112, 2100, 'West Pokot', 'town', S('riftvalley', 1, false, 80), 'Descending towards Marich Pass'),
      W('Marich Pass', 1.533, 35.450, 1400, 'West Pokot', 'landmark', S('arid', 1, false, 80), 'Spectacular escarpment road'),
      W('Kainuk', 1.750, 35.560, 900, 'Turkana', 'town', S('arid', 1, false, 100)),
      W('Lokichar', 2.383, 35.650, 700, 'Turkana', 'town', S('arid', 1, false, 100), 'South Lokichar oil basin'),
      W('Lodwar', 3.119, 35.597, 500, 'Turkana', 'town', S('arid', 1, false, 100), 'Capital of Turkana — doum palms on the Turkwel'),
      W('Kakuma', 3.717, 34.860, 650, 'Turkana', 'town', S('arid', 1, false, 100)),
      W('Lokichoggio', 4.204, 34.348, 650, 'Turkana', 'town', S('arid', 1, false, 100)),
      W('Nadapal', 4.420, 34.200, 700, 'Turkana', 'border', S('arid', 1, false, 50), 'Nadapal border — South Sudan'),
    ],
  },
  {
    id: 'A3',
    code: 'A3',
    name: 'Thika – Garissa – Liboi',
    aka: 'Garissa Road',
    connects: 'Thika → Garissa → Somalia border (Liboi)',
    description:
      'Heads east from Thika past Ol Donyo Sabuk through Ukambani, crosses the Tana River at Garissa and runs across the flat north-eastern plains to the Somali border.',
    waypoints: [
      W('Thika', -1.033, 37.069, 1530, 'Kiambu', 'town', S('farmland', 1, false, 100), 'Junction with Thika Superhighway (A2)'),
      W('Kithimani', -1.130, 37.400, 1300, 'Machakos', 'town', S('savanna', 1, false, 100), 'Ol Donyo Sabuk to the south'),
      W('Matuu', -1.150, 37.540, 1150, 'Machakos', 'town', S('savanna', 1, false, 100)),
      W('Mwingi', -0.934, 38.060, 1000, 'Kitui', 'town', S('savanna', 1, false, 100)),
      W('Ukasi', -0.800, 38.550, 650, 'Kitui', 'town', S('arid', 1, false, 100)),
      W('Madogo', -0.468, 39.600, 160, 'Tana River', 'town', S('arid', 1, false, 80), 'Tana River bridge ahead'),
      W('Garissa', -0.453, 39.646, 150, 'Garissa', 'town', S('arid', 1, false, 100), 'Capital of Garissa County on the Tana'),
      W('Dadaab', 0.057, 40.311, 130, 'Garissa', 'town', S('arid', 1, false, 100)),
      W('Liboi', 0.352, 40.875, 120, 'Garissa', 'border', S('arid', 1, false, 50), 'Liboi — Somalia border'),
    ],
  },
  {
    id: 'A7',
    code: 'A7',
    name: 'Lunga Lunga – Mombasa – Lamu',
    aka: 'Coast highway · East African Coastal Corridor',
    connects: 'Tanzania border (Lunga Lunga) → Mombasa → Malindi → Lamu',
    description:
      'The palm-lined coastal road: south coast beaches of Diani, the Likoni crossing into Mombasa, the creeks of Kilifi, historic Malindi and the Tana delta to the Lamu archipelago.',
    waypoints: [
      W('Lunga Lunga', -4.555, 39.123, 60, 'Kwale', 'border', S('coastal', 1, false, 50), 'Lunga Lunga/Horohoro border — Tanzania'),
      W('Msambweni', -4.470, 39.480, 25, 'Kwale', 'town', S('coastal', 1, false, 100)),
      W('Ukunda', -4.284, 39.570, 20, 'Kwale', 'town', S('coastal', 1, false, 80), 'Diani Beach turn-off'),
      W('Likoni', -4.083, 39.660, 10, 'Mombasa', 'landmark', S('urban', 1, false, 50), 'Likoni crossing to Mombasa Island'),
      W('Mombasa', -4.043, 39.668, 20, 'Mombasa', 'city', S('urban', 2, true, 50)),
      W('Mtwapa', -3.940, 39.745, 20, 'Kilifi', 'town', S('coastal', 1, false, 100)),
      W('Kilifi', -3.630, 39.850, 30, 'Kilifi', 'town', S('coastal', 1, false, 100), 'Kilifi Creek bridge'),
      W('Gede', -3.305, 40.017, 30, 'Kilifi', 'landmark', S('coastal', 1, false, 100), 'Gede ruins & Watamu turn-off'),
      W('Malindi', -3.219, 40.117, 20, 'Kilifi', 'town', S('coastal', 1, false, 100), 'Historic Swahili town'),
      W('Garsen', -2.270, 40.115, 20, 'Tana River', 'town', S('coastal', 1, false, 100), 'Tana River delta'),
      W('Witu', -2.389, 40.438, 30, 'Lamu', 'town', S('coastal', 1, false, 100)),
      W('Mokowe', -2.236, 40.850, 10, 'Lamu', 'town', S('coastal', 1, false, 50), 'Jetty to Lamu Island — UNESCO World Heritage town'),
    ],
  },
  {
    id: 'A23',
    code: 'A23',
    name: 'Voi – Taveta',
    aka: 'Taveta Road',
    connects: 'Voi (A8) → Tanzania border (Taveta/Holili)',
    description:
      'Branches off the Northern Corridor at Voi, skirts the Taita Hills and crosses Tsavo West towards the snows of Kilimanjaro at the Tanzanian border.',
    waypoints: [
      W('Voi', -3.396, 38.556, 560, 'Taita-Taveta', 'town', S('savanna', 1, false, 100), 'Junction with the Northern Corridor (A8)'),
      W('Mwatate', -3.505, 38.378, 830, 'Taita-Taveta', 'town', S('savanna', 1, false, 100), 'Taita Hills to the north'),
      W('Bura', -3.450, 38.300, 900, 'Taita-Taveta', 'town', S('savanna', 1, false, 100)),
      W('Maktau', -3.395, 38.140, 950, 'Taita-Taveta', 'landmark', S('savanna', 1, false, 80), 'Tsavo West — wildlife crossing'),
      W('Mwakitau', -3.380, 37.900, 800, 'Taita-Taveta', 'town', S('savanna', 1, false, 100)),
      W('Taveta', -3.398, 37.676, 750, 'Taita-Taveta', 'border', S('urban', 1, false, 50), 'Taveta/Holili One-Stop Border Post — Tanzania'),
    ],
  },
];

// Distant landmarks visible on the horizon (real peak positions/heights).
export const LANDMARKS = [
  { name: 'Kilimanjaro', lat: -3.067, lon: 37.355, h: 5895, snow: true, w: 1.0 },
  { name: 'Mt Kenya', lat: -0.152, lon: 37.308, h: 5199, snow: true, w: 0.7 },
  { name: 'Mt Meru', lat: -3.247, lon: 36.750, h: 4562, snow: false, w: 0.7 },
  { name: 'Mt Elgon', lat: 1.134, lon: 34.553, h: 4321, snow: false, w: 1.3 },
  { name: 'Aberdares', lat: -0.400, lon: 36.700, h: 3999, snow: false, w: 1.4 },
  { name: 'Mt Longonot', lat: -0.914, lon: 36.446, h: 2776, snow: false, w: 0.6, crater: true },
  { name: 'Menengai', lat: -0.200, lon: 36.070, h: 2278, snow: false, w: 0.9, crater: true },
  { name: 'Ngong Hills', lat: -1.400, lon: 36.640, h: 2460, snow: false, w: 0.8 },
  { name: 'Taita Hills', lat: -3.400, lon: 38.350, h: 2208, snow: false, w: 0.9 },
  { name: 'Chyulu Hills', lat: -2.600, lon: 37.800, h: 2188, snow: false, w: 1.2 },
  { name: 'Ol Donyo Sabuk', lat: -1.130, lon: 37.250, h: 2145, snow: false, w: 0.6 },
  { name: 'Marsabit Mountain', lat: 2.320, lon: 37.970, h: 1707, snow: false, w: 0.9 },
  { name: 'Cherangani Hills', lat: 1.250, lon: 35.450, h: 3500, snow: false, w: 1.2 },
  { name: 'Mau Escarpment', lat: -0.500, lon: 35.700, h: 3100, snow: false, w: 1.5 },
];

export const BORDER_COUNTRIES = {
  Malaba: 'Uganda',
  Namanga: 'Tanzania',
  Moyale: 'Ethiopia',
  Isebania: 'Tanzania',
  Nadapal: 'South Sudan',
  Liboi: 'Somalia',
  'Lunga Lunga': 'Tanzania',
  Taveta: 'Tanzania',
};

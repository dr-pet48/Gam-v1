# Kenya Highway Simulator

A 3D driving simulator in the browser for Kenya's international trunk highways (Class A roads). These are the routes that link the counties to each other and to Uganda, Tanzania, Ethiopia, Somalia and South Sudan.

Built with [Three.js](https://threejs.org) and Vite. No external assets: every model, texture and sound is generated procedurally at runtime.

## Run it

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # production build in dist/
```

## Highways

| Route | Corridor | Ends |
|-------|----------|------|
| **A8** | Northern Corridor, ex-A109/A104 (923 km) | Mombasa → Nairobi → Nakuru → Eldoret → **Malaba (Uganda)** |
| **A2** | Great North Road / Thika Superhighway | **Namanga (Tanzania)** → Nairobi → Nanyuki → Isiolo → Marsabit → **Moyale (Ethiopia)** |
| **A1** | Western & North Rift | **Isebania (Tanzania)** → Kisii → Kisumu → Kitale → Lodwar → **Nadapal (South Sudan)** |
| **A3** | Garissa Road | Thika → Mwingi → Garissa → **Liboi (Somalia)** |
| **A7** | Coast highway | **Lunga Lunga (Tanzania)** → Mombasa → Kilifi → Malindi → Lamu (Mokowe) |
| **A23** | Taveta Road | Voi → **Taveta (Tanzania)** |

You can drive each route in either direction and start from any town on it.

### How the data is used

- **Waypoints** (`src/data/highways.js`): the real towns and landmarks on each route, with WGS84 coordinates, elevation and county. These give the road's direction, the climbs and descents (for example the drop into the Rift Valley at Kinale, or Timboroa at about 2,800 m), county boundaries, town limits and the km figures on signs.
- **Road layout** for each section: dual carriageway or single, number of lanes (for example 3+3 on Thika Superhighway), speed limits, and landscape type (coastal, Tsavo savanna, highland tea and forest, Rift Valley, farmland, arid north).
- **Lengths**: the A8 uses its published 923 km. Other routes use the great-circle distance between towns multiplied by a road-winding factor.
- **Horizon peaks** are placed at their real positions and heights: Kilimanjaro, Mt Kenya, Mt Elgon, Longonot, Menengai, the Aberdares, Ngong Hills and others. Their apparent size depends on your real distance from them, so Kilimanjaro rises ahead as you near Taveta or Namanga.
- **The Equator** is crossed wherever a route really crosses it: near Timboroa on the A8, Nanyuki on the A2, Maseno on the A1 and near Garissa on the A3.
- Kenya drives on the **left**. Signs follow KeNHA style. PSVs and commercial vehicles are speed-governed to 80 km/h, and towns have speed bumps and 50 km/h zones.

Road curves between towns are generated, not traced from survey data. Town positions, elevations, sequence and distances are real. Route numbering follows current KeNHA usage, and older numbers (A104/A109) are shown as "also known as".

### Trip scale

Driving 923 km at real length takes many hours, so you choose a trip scale:

- **1:1** is the full real length.
- **1:20** is the default.
- **1:60** is a quick trip.

The speedometer always shows real speed. Distances on signs and the HUD are always real km.

## Vehicles

Saloon car, Safari 4×4 (pop-top), double-cab pickup, matatu (graffiti livery with the regulation yellow band), long-distance coach, container truck with a swinging articulated trailer, fuel tanker, tuk-tuk and boda boda.

Each vehicle has its own top speed, acceleration, braking, mass, steering, camera and synthesised engine and horn sound.

## Features

- **Lighting and sky:** physically based sky with a day/night cycle timed for Kenya's equatorial sunrise and sunset, plus moving clouds, stars, bloom and soft shadows.
- **Weather:** long rains (wet, reflective road), storms, highland fog (it builds automatically at altitude around Kinale and Timboroa) and dry-season dust.
- **Landscape:**
  - Plants: acacias, baobabs, coconut palms, euphorbia, eucalyptus and cypress plantations, tea rows, maize and banana shambas.
  - Ground: termite mounds and red Tsavo soil.
  - Wildlife: zebras, giraffes and elephants in open country.
- **Towns:** painted shop fronts (hoteli, agrovet, butchery and so on), roadside kiosks and fruit stalls, street lights, speed bumps, weighbridges (Mariakani, Athi River, Gilgil, Webuye) and One-Stop Border Posts with the Kenyan flag.
- **Signage:**
  - Directions and arrivals: KeNHA direction signs with real distances and *Karibu* town boards.
  - Boundaries: county welcome signs and Equator signs.
  - Traffic signs: speed limits, wildlife, bump and curve warnings.
  - Kilometre posts.
- **AI traffic:**
  - Traffic keeps left and uses car-following.
  - Vehicles change lanes on dual carriageways.
  - Matatus and cars overtake through the oncoming lane when it is clear.
  - The vehicle mix changes by region, for example more trucks on the Northern Corridor and more boda bodas in western Kenya.
- **HUD:** speedometer and rev counter, next town and distance, county, altitude, speed-limit warnings, damage, and a minimap of Kenya with the whole trunk network.
- **Controls:** keyboard, gamepad and touch.

## Controls

| Key | Action |
|-----|--------|
| W / ↑ | Accelerate |
| S / ↓ | Brake / reverse |
| A D / ← → | Steer |
| Space | Handbrake |
| H | Horn |
| L | Headlights (automatic at night by default) |
| C | Camera: chase / far chase / driver / roadside cinematic / helicopter |
| G | Speed governor on/off (PSVs and trucks) |
| R | Tow back onto the road and repair |
| T | Time +1 hour |
| M | Mute |
| Esc / P | Pause (change weather, time or traffic, or jump to a town) |

On a gamepad, RT is the throttle, LT the brake, the left stick steers, A is the handbrake, B the horn and Y changes the camera.

## Project layout

```
src/
  data/highways.js   real route data (towns, coordinates, elevations, counties, lanes, limits)
  data/vehicles.js   vehicle specs and regional traffic mix
  route.js           builds the drivable centre-line, elevation profile and road attributes
  world.js           streams terrain, road, vegetation, towns, signs and wildlife in chunks
  environment.js     sky, sun/moon, clouds, fog, rain and horizon mountains
  models.js          procedural vehicles, animals and props
  textures.js        canvas textures: asphalt and markings, signs, shop fronts, liveries
  traffic.js         AI traffic
  player.js          vehicle physics
  audio.js           synthesised engine, road, wind, rain, horn and crash sounds
  hud.js             HUD and minimap
  main.js            game loop, menus, cameras and post-processing
```

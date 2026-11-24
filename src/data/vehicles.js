// Drivable vehicle catalogue. Physics values are arcade-tuned but keep the
// relative character of each class (a loaded prime mover is slow to
// accelerate and brake, a boda boda is nimble but fragile, etc.).
// `governor` is the speed-limiter that Kenyan law requires for PSVs and
// commercial vehicles (80 km/h).

export const VEHICLES = [
  {
    id: 'sedan', name: 'Saloon Car', desc: 'Everyday family saloon — balanced and comfortable.',
    topSpeed: 180, accel: 3.4, brake: 9, steer: 0.62, mass: 1300,
    length: 4.6, width: 1.8, height: 1.45, wheelbase: 2.7, camDist: 8, camHeight: 2.6,
    engine: { idle: 38, max: 210, type: 'petrol' }, category: 'light',
  },
  {
    id: 'safari', name: 'Safari 4x4', desc: 'Pop-top safari cruiser built for Tsavo and the Mara.',
    topSpeed: 160, accel: 2.8, brake: 8, steer: 0.55, mass: 2600,
    length: 4.9, width: 1.95, height: 2.05, wheelbase: 2.85, camDist: 9, camHeight: 3.1,
    engine: { idle: 30, max: 160, type: 'diesel' }, category: 'light', offroad: true,
  },
  {
    id: 'pickup', name: 'Pickup', desc: 'Double-cab workhorse, light load in the bed.',
    topSpeed: 165, accel: 3.0, brake: 8.5, steer: 0.56, mass: 1900,
    length: 5.3, width: 1.85, height: 1.8, wheelbase: 3.1, camDist: 9, camHeight: 3,
    engine: { idle: 32, max: 170, type: 'diesel' }, category: 'light', offroad: true,
  },
  {
    id: 'matatu', name: 'Matatu (14-seater)', desc: 'Graffiti-painted PSV van with the yellow band. Speed-governed.',
    topSpeed: 140, governor: 80, accel: 2.6, brake: 7.5, steer: 0.5, mass: 2400,
    length: 5.4, width: 1.9, height: 2.3, wheelbase: 3.1, camDist: 10, camHeight: 3.4,
    engine: { idle: 30, max: 150, type: 'diesel' }, category: 'psv',
  },
  {
    id: 'bus', name: 'Coach Bus', desc: 'Long-distance coach, 60+ passengers. Speed-governed.',
    topSpeed: 120, governor: 80, accel: 1.5, brake: 6, steer: 0.38, mass: 14000,
    length: 12, width: 2.5, height: 3.5, wheelbase: 6.5, camDist: 17, camHeight: 5.5,
    engine: { idle: 24, max: 110, type: 'heavy' }, category: 'psv',
  },
  {
    id: 'truck', name: 'Container Truck', desc: 'Prime mover with 40ft container from the Port of Mombasa.',
    topSpeed: 110, governor: 80, accel: 1.0, brake: 4.8, steer: 0.34, mass: 36000,
    length: 16.5, width: 2.55, height: 4.1, wheelbase: 4, camDist: 22, camHeight: 6.5,
    engine: { idle: 22, max: 95, type: 'heavy' }, category: 'heavy', articulated: true,
  },
  {
    id: 'tanker', name: 'Fuel Tanker', desc: 'Petroleum tanker heading inland to Uganda.',
    topSpeed: 110, governor: 80, accel: 1.1, brake: 5, steer: 0.34, mass: 32000,
    length: 15, width: 2.5, height: 3.7, wheelbase: 4, camDist: 21, camHeight: 6,
    engine: { idle: 22, max: 95, type: 'heavy' }, category: 'heavy', articulated: true,
  },
  {
    id: 'tuktuk', name: 'Tuk-Tuk', desc: 'Three-wheeled auto-rickshaw — tops out around 65 km/h.',
    topSpeed: 65, accel: 2.4, brake: 6, steer: 0.8, mass: 380,
    length: 2.7, width: 1.35, height: 1.75, wheelbase: 1.95, camDist: 6, camHeight: 2.4,
    engine: { idle: 50, max: 230, type: 'small' }, category: 'light', threeWheeler: true,
  },
  {
    id: 'boda', name: 'Boda Boda', desc: 'The 150cc motorbike taxi that moves Kenya.',
    topSpeed: 110, accel: 4.0, brake: 7, steer: 0.9, mass: 230,
    length: 2.0, width: 0.8, height: 1.7, wheelbase: 1.3, camDist: 5, camHeight: 2.1,
    engine: { idle: 55, max: 260, type: 'small' }, category: 'light', bike: true,
  },
];

// Mix of AI traffic by landscape (weights).
export const TRAFFIC_MIX = {
  urban: { sedan: 30, matatu: 22, boda: 14, tuktuk: 6, pickup: 8, bus: 6, truck: 8, tanker: 3, safari: 3 },
  coastal: { sedan: 20, matatu: 18, boda: 12, tuktuk: 12, pickup: 10, bus: 10, truck: 10, tanker: 4, safari: 4 },
  savanna: { sedan: 16, matatu: 10, boda: 4, tuktuk: 1, pickup: 10, bus: 12, truck: 28, tanker: 12, safari: 7 },
  highland: { sedan: 24, matatu: 18, boda: 10, tuktuk: 2, pickup: 12, bus: 8, truck: 16, tanker: 6, safari: 4 },
  forest: { sedan: 20, matatu: 14, boda: 4, tuktuk: 1, pickup: 10, bus: 10, truck: 26, tanker: 12, safari: 3 },
  riftvalley: { sedan: 20, matatu: 16, boda: 6, tuktuk: 2, pickup: 10, bus: 10, truck: 22, tanker: 8, safari: 6 },
  farmland: { sedan: 20, matatu: 18, boda: 16, tuktuk: 4, pickup: 12, bus: 8, truck: 14, tanker: 5, safari: 3 },
  arid: { sedan: 8, matatu: 8, boda: 6, tuktuk: 1, pickup: 18, bus: 14, truck: 26, tanker: 8, safari: 11 },
};

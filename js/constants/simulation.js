/* Shared by the page, worker and tests. Distances use 1 unit = 100 m;
   local-world physics multiplies them by roadWidth / ROAD_WIDTH. */
const SIMULATION = Object.freeze({
  MIN_POPULATION: 0,
  MAX_POPULATION: 5000,
  DEFAULT_POPULATION: 40,
  WORKER_THRESHOLD: 1000,
  MAIN_STEP_SECONDS: 1 / 60,
  WORKER_STEP_SECONDS: 1 / 30,
  WORKER_BUDGET_MS: 10,
  SNAPSHOT_INTERVAL_MS: 120,
  DRIVER_PAGE_SIZE: 200,
  OVERVIEW_CARS: 2000,
  MINIMAP_CARS: 1000,
  ROAD_WIDTH: 0.08,
  DEFAULT_SPEED_KMH: 43.2,
  MIN_SPEED_KMH: 5,
  MAX_SPEED_KMH: 300,
  ACCELERATION: 0.06,
  BRAKING: 0.2,
  FOLLOWING_GAP: 0.025,
  JUNCTION_SPEED: 0.065,
  CAR_WIDTH: 0.018,
  CAR_LENGTH: 0.042,
});

function validatePopulation(value) {
  if (String(value).trim() === "")
    throw new RangeError("Enter a whole number from 0 to 5,000 cars.");
  const count = Number(value);
  if (
    !Number.isInteger(count) ||
    count < SIMULATION.MIN_POPULATION ||
    count > SIMULATION.MAX_POPULATION
  ) {
    throw new RangeError("Population must be a whole number from 0 to 5,000 cars.");
  }
  return count;
}

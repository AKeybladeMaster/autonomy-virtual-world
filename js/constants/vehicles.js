/* Styling only: all variants retain the same physics footprint. */
const VEHICLE_STYLES = Object.freeze([
  Object.freeze({
    name: "Sedan",
    roofHeight: 0.0145,
    roofRear: 0.16,
    roofFront: -0.13,
  }),
  Object.freeze({ name: "Coupe", roofHeight: 0.0128, roofRear: 0.19, roofFront: -0.1 }),
  Object.freeze({
    name: "Tourer",
    roofHeight: 0.0165,
    roofRear: 0.29,
    roofFront: -0.14,
  }),
]);
const VEHICLE_FINISH = Object.freeze({
  tire: "#142031",
  alloy: "#b7c7db",
  glass: "#294963",
  glassLight: "#668ca7",
  chrome: "#dce7ef",
  headlamp: "#eeffff",
  taillamp: "#ed486f",
});

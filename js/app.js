/* Autonomy: vanilla JavaScript application shell around Radu's world and car code. */
const $ = (id) => document.getElementById(id);
const canvas = $("worldCanvas"),
  ctx = canvas.getContext("2d");
const camera = { x: 0, y: 0, scale: 0.5 };
const state = {
  editing: false,
  paused: false,
  tool: "roads",
  cars: [],
  bestCar: null,
  selected: null,
  pointer: null,
  intent: null,
  scenery: true,
  sensors: true,
  follow: false,
  selectedCarId: 0,
  tags: true,
  theme: "light",
};
const STORAGE_WORLD = "autonomy.world.v2",
  STORAGE_BRAIN = "autonomy.brain.v2";
let width = 1,
  height = 1,
  toastTimer,
  drag = null,
  borders = [],
  world,
  traffic;
let seedBrain = trafficBrain();
let fleetWorker = null,
  workerMode = false,
  fleetBusy = false,
  workerFocus = null,
  driverOffset = 0,
  driverTotal = 0;
let miniCars = [],
  simRate = 1,
  workerTime = 0;
function workerView() {
  return {
    camera: { ...camera },
    width,
    height,
    follow: state.follow,
    selectedId: state.selectedCarId,
    viewMode: $("viewMode").value,
  };
}
function postFleet(message) {
  fleetWorker?.postMessage(message);
}
function displayDrivers(rows, total, offset) {
  driverTotal = total;
  driverOffset = offset;
  $("carSelect").replaceChildren(
    ...rows.map((car) => {
      const option = document.createElement("option");
      option.value = car.id;
      option.textContent = `#${car.id + 1} · ${car.name}`;
      return option;
    }),
  );
  $("carSelect").value = String(state.selectedCarId);
  $("driverPageInfo").textContent = total
    ? `${offset + 1}–${Math.min(offset + SIMULATION.DRIVER_PAGE_SIZE, total)} / ${total.toLocaleString()}`
    : "No matches";
  $("driversPrev").disabled = offset === 0;
  $("driversNext").disabled = offset + SIMULATION.DRIVER_PAGE_SIZE >= total;
}
function refreshDrivers() {
  const query = $("driverSearch").value.trim().toLowerCase();
  if (workerMode) {
    postFleet({ type: "drivers", query, offset: driverOffset });
    return;
  }
  const matches = state.cars.filter(
    (c) => !query || c.name.toLowerCase().includes(query) || String(c.id + 1) === query,
  );
  displayDrivers(
    matches.slice(driverOffset, driverOffset + SIMULATION.DRIVER_PAGE_SIZE),
    matches.length,
    driverOffset,
  );
}
$("driverSearch").oninput = () => {
  driverOffset = 0;
  refreshDrivers();
};
$("driversPrev").onclick = () => {
  driverOffset = Math.max(0, driverOffset - SIMULATION.DRIVER_PAGE_SIZE);
  refreshDrivers();
};
$("driversNext").onclick = () => {
  if (driverOffset + SIMULATION.DRIVER_PAGE_SIZE < driverTotal) {
    driverOffset += SIMULATION.DRIVER_PAGE_SIZE;
    refreshDrivers();
  }
};

function toast(message) {
  $("toast").textContent = message;
  $("toast").classList.add("visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $("toast").classList.remove("visible"), 4000);
}
function readStored(key) {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) : null;
  } catch {
    toast("Saved data could not be read. Using the demo.");
    return null;
  }
}
function writeStored(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    toast("Browser storage is unavailable. Downloads still work.");
    return false;
  }
}
const savedWorld = readStored(STORAGE_WORLD),
  savedBrain = readStored(STORAGE_BRAIN);
try {
  world = savedWorld ? parseWorld(savedWorld) : new CountryWorld(window.ALBANIA_ROADS);
} catch {
  world = new CountryWorld(window.ALBANIA_ROADS);
  toast("Saved world is invalid. Loaded Albania.");
}
if (validateBrain(savedBrain)) seedBrain = savedBrain;
const savedSpeed = readStored("autonomy.cruiseSpeedKmh");
if ([...$("cruiseSpeed").options].some((o) => Number(o.value) === savedSpeed))
  $("cruiseSpeed").value = String(savedSpeed);
$("cruiseSpeed").onchange = () => {
  const speed = Number($("cruiseSpeed").value);
  if (traffic) traffic.setCruiseSpeed(speed);
  postFleet({ type: "speed", speed });
  writeStored("autonomy.cruiseSpeedKmh", speed);
};
function syncWorldName() {
  world.name = cleanWorldName(world.name);
  $("worldName").value = world.name;
  $("worldTitle").textContent = world.name;
  document.title = `${world.name} — Autonomy`;
  $("mapEyebrow").textContent =
    world.kind === "country" ? "ALBANIA / OPENSTREETMAP" : "LOCAL / WORLD EDITOR";
  $("mapSubtitle").textContent =
    world.kind === "country"
      ? "Every mapped road. A world to explore."
      : "Build the roads. Let intelligence take the wheel.";
  $("datasetInfo").textContent =
    world.kind === "country"
      ? `${world.roads.length.toLocaleString()} mapped ways · coordinates at 1:100`
      : `${world.graph.segments.length} road segments`;
  $("sceneryToggle").disabled = false;
  $("sceneryToggle").closest("label").title =
    "Procedural scenery, visible at street scale. Buildings and trees are fictional.";
}
$("worldName").oninput = () => {
  world.name = cleanWorldName($("worldName").value);
  $("worldTitle").textContent = world.name;
  document.title = `${world.name} — Autonomy`;
};
$("worldName").onchange = syncWorldName;
$("worldName").onkeydown = (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    event.target.blur();
  }
};
function applyTheme(theme) {
  state.theme = theme === "dark" ? "dark" : "light";
  document.documentElement.dataset.theme = state.theme;
  $("themeBtn").innerHTML =
    state.theme === "dark" ? "☀ <span>Light mode</span>" : "☾ <span>Dark mode</span>";
  $("themeBtn").setAttribute("aria-pressed", String(state.theme === "dark"));
  $("themeBtn").title = `Switch to ${state.theme === "dark" ? "light" : "dark"} mode`;
  document.querySelector('meta[name="theme-color"]').content =
    state.theme === "dark" ? "#090c18" : "#f5faff";
  writeStored("autonomy.theme", state.theme);
}
applyTheme(readStored("autonomy.theme") || "light");
syncWorldName();
$("themeBtn").onclick = () => applyTheme(state.theme === "dark" ? "light" : "dark");
function selectedCar() {
  return workerMode
    ? workerFocus
    : state.cars.find((c) => c.id === state.selectedCarId) || state.cars[0] || null;
}
function selectDriver() {
  if ($("carSelect").value !== "") state.selectedCarId = Number($("carSelect").value);
  postFleet({ type: "view", view: workerView() });
  const car = selectedCar();
  if (car && state.follow) {
    camera.x = car.x;
    camera.y = car.y;
    camera.scale = world.kind === "country" ? 600 : 0.9;
  }
}
$("carSelect").onchange = () => {
  state.follow = true;
  $("followToggle").checked = true;
  selectDriver();
};
$("tagToggle").onclick = () => {
  state.tags = !state.tags;
  $("tagToggle").textContent = state.tags ? "Hide car names" : "Show car names";
  $("tagToggle").setAttribute("aria-pressed", String(state.tags));
};

function updateBorders() {
  borders = world.roadBorders.map((s) => [s.p1, s.p2]);
}
function spawnCars() {
  fleetWorker?.terminate();
  fleetWorker = null;
  workerFocus = null;
  fleetBusy = false;
  miniCars = [];
  workerTime = 0;
  const count = validatePopulation($("population").value);
  workerMode = count > SIMULATION.WORKER_THRESHOLD;
  state.selectedCarId = 0;
  driverOffset = 0;
  $("driverSearch").value = "";
  if (count === 0) {
    // Clearing cars should not rebuild the country-wide directed road graph.
    traffic = null;
    state.cars = [];
    state.bestCar = null;
    state.totalCars = 0;
    simRate = 0;
    $("fleetStatus").textContent = "Simulation cleared. Enter a population to restart.";
    displayDrivers([], 0, 0);
    updateStatus();
    return;
  }
  if (workerMode) {
    traffic = null;
    state.cars = [];
    state.bestCar = null;
    state.totalCars = 0;
    fleetBusy = true;
    simRate = 0;
    $("fleetStatus").textContent = `Preparing ${count.toLocaleString()} cars…`;
    displayDrivers([], 0, 0);
    try {
      const worker = new Worker("js/simulation/fleet-worker.js");
      fleetWorker = worker;
      worker.onmessage = ({ data }) => {
        if (fleetWorker !== worker) return;
        if (data.type === "snapshot") {
          state.cars = data.cars;
          state.bestCar = data.best;
          state.totalCars = data.total;
          workerFocus = data.focus;
          miniCars = data.mini;
          simRate = data.simRate;
          workerTime = data.simTime;
          if (data.spawning)
            $("fleetStatus").textContent =
              `Placing ${data.total.toLocaleString()} / ${count.toLocaleString()} cars…`;
        } else if (data.type === "drivers")
          displayDrivers(data.rows, data.total, data.offset);
        else if (data.type === "ready") {
          fleetBusy = false;
          state.totalCars = data.total;
          $("fleetStatus").textContent =
            `${data.total.toLocaleString()} / ${count.toLocaleString()} cars placed. Background simulation; overview dots are sampled.`;
        } else if (data.type === "error") fleetError(data.message);
      };
      worker.onerror = (event) => {
        event.preventDefault();
        fleetError(
          event.message || "Worker could not load. Serve the app with npm.cmd start.",
        );
      };
      worker.postMessage({
        type: "init",
        world: worldData(world),
        roadBorders: world.roadBorders.map(({ p1, p2 }) => ({ p1, p2 })),
        count,
        brain: seedBrain,
        speed: Number($("cruiseSpeed").value),
        paused: state.paused || state.editing,
        view: workerView(),
      });
    } catch (error) {
      fleetError(error.message);
    }
    updateStatus();
    return;
  }
  simRate = 1;
  if (!traffic || traffic.world !== world) traffic = new TrafficSimulation(world);
  traffic.setCruiseSpeed(Number($("cruiseSpeed").value));
  state.cars = traffic.spawn(Number($("population").value), seedBrain);
  state.bestCar = state.cars[0] || null;
  state.selectedCarId = state.cars[0]?.id ?? 0;
  state.totalCars = state.cars.length;
  refreshDrivers();
  $("fleetStatus").textContent =
    `${state.cars.length.toLocaleString()} / ${count.toLocaleString()} cars placed. Maximum 5,000; road space can limit placement.`;
  if (state.follow) selectDriver();
  updateStatus();
}
function fleetError(message) {
  fleetBusy = false;
  fleetWorker?.terminate();
  fleetWorker = null;
  $("fleetStatus").textContent = `Simulation stopped: ${message}`;
  toast("Could not run the large fleet. Reduce the population to restart.");
}
function updateStatus() {
  const alive = state.totalCars ?? state.cars.length;
  $("activeCount").textContent = alive.toLocaleString();
  $("distanceValue").textContent = Math.round(
    Math.max(0, state.bestCar?.fittness || 0) * (world.kind === "country" ? 100 : 1),
  ).toLocaleString();
  $("distanceUnit").textContent =
    world.kind === "country" ? "BEST DISTANCE · M" : "BEST DISTANCE · U";
  $("runStatus").textContent = state.editing
    ? "EDITING"
    : state.paused
      ? "PAUSED"
      : !alive
        ? "STOPPED"
        : "RUNNING";
  if (fleetBusy) $("runStatus").textContent = "LOADING";
  if (workerMode && !fleetWorker) $("runStatus").textContent = "STOPPED";
  $("pauseBtn").textContent = state.paused ? "▶ Resume" : "Ⅱ Pause";
  const car = selectedCar();
  $("driverStatus").textContent = car
    ? `${car.name} · ${car.status}`
    : "No cars available.";
  $("scaleLabel").textContent =
    world.kind === "country"
      ? `100 px ≈ ${(10000 / camera.scale / 1000).toFixed(camera.scale > 10 ? 3 : 1)} km · 1:100 coordinates`
      : "Local world coordinates";
  $("simRate").textContent =
    `${state.paused || state.editing || fleetBusy ? 0 : simRate.toFixed(2)}× SIM`;
}
function fitWorld() {
  const bounds = graphBounds(world.graph);
  camera.x = bounds.x;
  camera.y = bounds.y;
  camera.scale = Math.min(width / bounds.width, (height - 80) / bounds.height);
  camera.scale = Math.max(0.06, Math.min(2, camera.scale));
  state.follow = false;
  $("followToggle").checked = false;
}
function resize() {
  const rect = canvas.getBoundingClientRect(),
    ratio = Math.min(window.devicePixelRatio || 1, 2);
  width = Math.max(1, rect.width);
  height = Math.max(1, rect.height);
  canvas.width = Math.round(width * ratio);
  canvas.height = Math.round(height * ratio);
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
}
new ResizeObserver(resize).observe(canvas);
resize();
fitWorld();
updateBorders();
spawnCars();

function setMode(editing) {
  if (editing) {
    $("viewMode").value = "2d";
    setViewMode();
  }
  state.editing = editing;
  state.selected = null;
  state.intent = null;
  document.body.classList.toggle("editing", editing);
  $("simulateBtn").classList.toggle("active", !editing);
  $("simulateBtn").setAttribute("aria-pressed", String(!editing));
  $("editBtn").classList.toggle("active", editing);
  $("editBtn").setAttribute("aria-pressed", String(editing));
  $("simulationPanel").hidden = editing;
  $("editorPanel").hidden = !editing;
  $("interactionHint").textContent = editing
    ? "CLICK TO BUILD · MIDDLE-DRAG TO PAN · ESC TO END"
    : "DRAG TO EXPLORE · SCROLL TO ZOOM";
  if (editing) {
    state.follow = false;
    $("followToggle").checked = false;
  } else {
    updateBorders();
    spawnCars();
  }
  updateStatus();
}
$("simulateBtn").onclick = () => setMode(false);
$("editBtn").onclick = () => setMode(true);
$("pauseBtn").onclick = () => {
  state.paused = !state.paused;
  updateStatus();
};
$("restartBtn").onclick = () => {
  if (state.bestCar?.fittness > 0)
    seedBrain = JSON.parse(JSON.stringify(state.bestCar.brain));
  spawnCars();
  syncWorldName();
  toast("Drivers restarted. Right-hand lanes and safety rules are active.");
};
$("population").oninput = (event) => {
  $("populationValue").textContent =
    `${Number(event.target.value).toLocaleString()} cars`;
  $("populationNumber").value = event.target.value;
};
$("population").onchange = spawnCars;
$("populationForm").onsubmit = (event) => {
  event.preventDefault();
  if (!checkPopulationInput()) return;
  $("population").value = $("populationNumber").value;
  $("populationValue").textContent =
    `${Number($("population").value).toLocaleString()} cars`;
  spawnCars();
};
let lastPopulationAlert = null;
function checkPopulationInput() {
  try {
    validatePopulation($("populationNumber").value);
    $("populationNumber").removeAttribute("aria-invalid");
    lastPopulationAlert = null;
    return true;
  } catch (error) {
    $("populationNumber").setAttribute("aria-invalid", "true");
    // Blur and Apply can validate the same edit; show its alert only once.
    if (lastPopulationAlert !== $("populationNumber").value) alert(error.message);
    lastPopulationAlert = $("populationNumber").value;
    return false;
  }
}
$("populationNumber").onchange = checkPopulationInput;
$("populationNumber").oninput = () => {
  lastPopulationAlert = null;
};
$("sceneryToggle").onchange = (event) => (state.scenery = event.target.checked);
$("sensorToggle").onchange = (event) => (state.sensors = event.target.checked);
$("followToggle").onchange = (event) => {
  state.follow = event.target.checked;
  if (state.follow) selectDriver();
};
$("saveBrainBtn").onclick = () => {
  if (!state.bestCar) return toast("Draw a road and run the simulation first.");
  seedBrain = JSON.parse(JSON.stringify(state.bestCar.brain));
  if (writeStored(STORAGE_BRAIN, seedBrain))
    toast("Best brain saved in this browser. Restart to use it.");
};
$("resetBrainBtn").onclick = () => {
  try {
    localStorage.removeItem(STORAGE_BRAIN);
  } catch {
    /* Storage may be disabled. */
  }
  seedBrain = trafficBrain();
  spawnCars();
  toast("Obstacle-sensing brain restored.");
};
$("saveWorldBtn").onclick = () => {
  const data = worldData(world),
    stored = writeStored(STORAGE_WORLD, data);
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = worldFileName(world.name);
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  if (stored) toast("World downloaded and saved in this browser.");
};
function replaceWorld(next) {
  world = next;
  state.selected = null;
  state.intent = null;
  state.pointer = null;
  traffic = null;
  updateBorders();
  spawnCars();
  fitWorld();
  syncWorldName();
}
$("importBtn").onclick = () => $("fileInput").click();
$("fileInput").onchange = async (event) => {
  const file = event.target.files[0];
  if (!file) return;
  try {
    if (file.size > 8e6) throw Error("Choose a world file smaller than 8 MB.");
    const data = JSON.parse(await file.text());
    replaceWorld(parseWorld(data));
    const excluded = (data.markings || []).some((m) =>
      ["light", "crossing"].includes(m.type),
    );
    toast(
      excluded
        ? "World imported. Traffic lights and crossings await approval and were omitted."
        : "World imported. Save to keep it in this browser.",
    );
  } catch (error) {
    toast(`Import failed: ${error.message}`);
  }
  event.target.value = "";
};
$("osmBtn").onclick = () => {
  $("osmError").textContent = "";
  $("osmDialog").showModal();
};
$("parseOsmBtn").onclick = () => {
  try {
    replaceWorld(parseWorld(parseOsmGraph(JSON.parse($("osmInput").value))));
    $("osmDialog").close();
    toast("Road geometry imported. Right-hand lane rules are active.");
  } catch (error) {
    $("osmError").textContent = error.message;
  }
};
let previous = 0,
  accumulator = 0,
  frameCount = 0,
  lastStats = 0,
  simulatedSinceStats = 0;
function animate(time) {
  const elapsed = previous ? Math.min((time - previous) / 1000, 0.1) : 0;
  previous = time;
  if (!workerMode && !state.paused && !state.editing) {
    accumulator += elapsed;
    while (accumulator >= SIMULATION.MAIN_STEP_SECONDS) {
      if (traffic) {
        traffic.step(SIMULATION.MAIN_STEP_SECONDS);
        simulatedSinceStats += SIMULATION.MAIN_STEP_SECONDS;
      }
      accumulator -= SIMULATION.MAIN_STEP_SECONDS;
    }
    state.bestCar = state.cars.reduce(
      (best, car) => (!best || car.fittness > best.fittness ? car : best),
      null,
    );
  } else accumulator = 0;
  const focus = selectedCar();
  if (state.follow && focus && !state.editing) {
    camera.x = focus.x;
    camera.y = focus.y;
  }
  state.focusCar = focus;
  if ($("viewMode").value !== "3d")
    drawWorldScene(ctx, world, camera, width, height, state);
  if ($("viewMode").value !== "2d")
    drawChaseView($("chaseCanvas"), world, focus, state);
  frameCount++;
  if (time - lastStats > 200) {
    if (!workerMode)
      simRate = simulatedSinceStats / Math.max(0.001, (time - lastStats) / 1000);
    simulatedSinceStats = 0;
    $("fpsValue").textContent = Math.round(
      (frameCount * 1000) / Math.max(1, time - lastStats),
    );
    $("zoomValue").textContent = `${Math.round(camera.scale * 100)}%`;
    updateStatus();
    drawNetwork($("networkCanvas"), focus?.brain, state.theme);
    drawMiniMap(
      $("miniMapCanvas"),
      world,
      camera,
      workerMode ? miniCars : state.cars,
      width,
      height,
      state.theme,
    );
    postFleet({ type: "view", view: workerView() });
    postFleet({ type: "pause", paused: state.paused || state.editing });
    frameCount = 0;
    lastStats = time;
  }
  requestAnimationFrame(animate);
}
document.addEventListener("visibilitychange", () => {
  previous = 0;
  accumulator = 0;
});
requestAnimationFrame(animate);
function setViewMode() {
  const mode = $("viewMode").value;
  document.querySelector(".canvas-views").dataset.view = mode;
  document.querySelector(".world-stage").dataset.view = mode;
  $("chaseCaption").hidden = mode === "2d";
  $("chaseCaption").textContent = "3D CHASE CAMERA · SELECTED DRIVER";
  $("interactionHint").textContent =
    mode === "3d"
      ? "3D CHASE · CHOOSE A DRIVER IN THE SIDEBAR"
      : "DRAG TO EXPLORE · SCROLL TO ZOOM";
  if (mode !== "2d") {
    state.follow = true;
    $("followToggle").checked = true;
    camera.scale = world.kind === "country" ? 600 : 0.9;
  }
  resize();
  postFleet({ type: "view", view: workerView() });
}
$("viewMode").onchange = setViewMode;
startMemoryMeter($("memoryValue"));

/* World interaction: pan/zoom, road editing and marking placement.
   Loaded after app.js; handlers use its shared world, camera and selection. */
function zoom(factor, screenX = width / 2, screenY = height / 2) {
  const before = screenToWorld(screenX, screenY);
  camera.scale = Math.max(
    0.06,
    Math.min(world.kind === "country" ? 800 : 3, camera.scale * factor),
  );
  const after = screenToWorld(screenX, screenY);
  camera.x += before.x - after.x;
  camera.y += before.y - after.y;
}
$("zoomInBtn").onclick = () => zoom(1.2);
$("zoomOutBtn").onclick = () => zoom(1 / 1.2);
$("fitBtn").onclick = fitWorld;
canvas.addEventListener(
  "wheel",
  (event) => {
    event.preventDefault();
    const rect = canvas.getBoundingClientRect();
    zoom(
      Math.exp(-event.deltaY * 0.001),
      event.clientX - rect.left,
      event.clientY - rect.top,
    );
  },
  { passive: false },
);
function screenToWorld(screenX, screenY) {
  return new Point(
    (screenX - width / 2) / camera.scale + camera.x,
    (screenY - height / 2) / camera.scale + camera.y,
  );
}
function pointerWorld(event) {
  const canvasBounds = canvas.getBoundingClientRect();
  return screenToWorld(
    event.clientX - canvasBounds.left,
    event.clientY - canvasBounds.top,
  );
}
function nearest(point) {
  return getNearestPoint(point, world.graph.points, 12 / camera.scale);
}
function regenerate() {
  world.graph.segments = world.graph.segments.filter(
    (segment) => segment.length() > (world.kind === "country" ? 1e-5 : 1),
  );
  world.generate();
  traffic = null;
  updateBorders();
  state.cars = [];
  state.bestCar = null;
}
function makeIntent(cursorPoint) {
  if (state.tool === "roads") return null;
  if (world.kind === "country" && camera.scale < 40) return null;
  let guides = world.laneGuides;
  if (world.kind === "country") {
    guides = [...guides];
    for (const road of world.visibleRoads(camera, width, height))
      if (road.drivable)
        for (let nodeIndex = 1; nodeIndex < road.refs.length; nodeIndex++) {
          const segmentStart = new Point(...world.data.nodes[road.refs[nodeIndex - 1]]);
          const segmentEnd = new Point(...world.data.nodes[road.refs[nodeIndex]]);
          const laneOffset = scale(
            perpendicular(normalize(subtract(segmentEnd, segmentStart))),
            world.roadWidth / 4,
          );
          guides.push(
            new Segment(add(segmentStart, laneOffset), add(segmentEnd, laneOffset)),
            new Segment(
              subtract(segmentEnd, laneOffset),
              subtract(segmentStart, laneOffset),
            ),
          );
        }
  }
  const nearestSegment = getNearestSegment(
    cursorPoint,
    guides,
    Math.min(22 / camera.scale, world.roadWidth),
  );
  if (!nearestSegment) return null;
  const projection = nearestSegment.projectPoint(cursorPoint);
  if (projection.offset < 0 || projection.offset > 1) return null;
  const constructors = {
    start: Start,
    parking: Parking,
    stop: Stop,
    yield: Yield,
    target: Target,
  };
  return new constructors[state.tool](
    projection.point,
    nearestSegment.directionVector(),
    world.roadWidth / 2,
    world.roadWidth * 0.36,
  );
}
document.querySelectorAll("[data-tool]").forEach(
  (button) =>
    (button.onclick = () => {
      state.tool = button.dataset.tool;
      state.selected = null;
      state.intent = null;
      document.querySelectorAll("[data-tool]").forEach((toolButton) => {
        toolButton.classList.toggle("active", toolButton === button);
        toolButton.setAttribute("aria-pressed", String(toolButton === button));
      });
      $("toolHelp").textContent =
        state.tool === "roads"
          ? "Click to place connected points. Drag a point to move it. Right-click to end a road; right-click again on a point to delete it."
          : "Move close to a lane and click to place the marking. Right-click a marking to remove it. Middle-drag to pan.";
    }),
);
canvas.addEventListener("contextmenu", (event) => event.preventDefault());
canvas.addEventListener("pointerdown", (event) => {
  const pointerPosition = pointerWorld(event);
  state.pointer = pointerPosition;
  if (event.button === 2 && state.editing) {
    if (state.selected) state.selected = null;
    else if (state.tool === "roads") {
      const point = nearest(pointerPosition);
      if (point) {
        world.graph.removePoint(point);
        regenerate();
      }
    } else {
      const markingIndex = world.markings.findIndex((marking) =>
        marking.poly.containsPoint(pointerPosition),
      );
      if (markingIndex >= 0) world.markings.splice(markingIndex, 1);
    }
    return;
  }
  if (event.button !== 0 && event.button !== 1) return;
  canvas.setPointerCapture(event.pointerId);
  if (!state.editing || event.button === 1 || event.altKey) {
    state.follow = false;
    $("followToggle").checked = false;
    drag = {
      type: "pan",
      x: event.clientX,
      y: event.clientY,
      cameraX: camera.x,
      cameraY: camera.y,
    };
    return;
  }
  if (state.tool === "roads") {
    if (world.kind === "country" && camera.scale < 40)
      return toast("Zoom in further before editing local roads.");
    if (world.graph.segments.length >= 350)
      return toast("This editor supports up to 350 road segments.");
    let point = nearest(pointerPosition),
      existing = !!point;
    if (!point) {
      point = pointerPosition;
      world.graph.addPoint(point);
    }
    if (
      state.selected &&
      distance(state.selected, point) > (world.kind === "country" ? 1e-5 : 1)
    )
      world.graph.tryAddSegment(new Segment(state.selected, point));
    state.selected = point;
    drag = { type: "point", point, moved: false };
    if (!existing) regenerate();
  } else {
    state.intent = makeIntent(pointerPosition);
    if (state.intent) {
      if (state.tool === "start")
        world.markings = world.markings.filter((marking) => marking.type !== "start");
      world.markings.push(state.intent);
      state.intent = null;
    }
  }
});
canvas.addEventListener("pointermove", (event) => {
  state.pointer = pointerWorld(event);
  if (drag?.type === "pan") {
    camera.x = drag.cameraX - (event.clientX - drag.x) / camera.scale;
    camera.y = drag.cameraY - (event.clientY - drag.y) / camera.scale;
  } else if (drag?.type === "point") {
    drag.point.x = state.pointer.x;
    drag.point.y = state.pointer.y;
    drag.moved = true;
  } else if (state.editing) state.intent = makeIntent(state.pointer);
});
function endDrag(event) {
  if (drag?.type === "point") regenerate();
  drag = null;
  if (canvas.hasPointerCapture(event.pointerId))
    canvas.releasePointerCapture(event.pointerId);
}
canvas.addEventListener("pointerup", endDrag);
canvas.addEventListener("pointercancel", endDrag);
canvas.addEventListener("pointerleave", () => {
  if (!drag) {
    state.intent = null;
    state.pointer = null;
  }
});
document.addEventListener("keydown", (event) => {
  if (
    ["INPUT", "TEXTAREA", "BUTTON", "SELECT"].includes(event.target.tagName) ||
    $("osmDialog").open
  )
    return;
  if (event.key === "Escape") {
    state.selected = null;
    state.intent = null;
  }
  if (event.code === "Space" && !state.editing) {
    event.preventDefault();
    state.paused = !state.paused;
    updateStatus();
  }
});

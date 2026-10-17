/* Browser estimates, deliberately not presented as total process RAM. */
function startMemoryMeter(element) {
  let pending = false;
  async function sample() {
    if (pending) return;
    if (
      typeof performance.measureUserAgentSpecificMemory === "function" &&
      self.crossOriginIsolated
    ) {
      pending = true;
      try {
        const result = await performance.measureUserAgentSpecificMemory();
        element.textContent = `${(result.bytes / 1048576).toFixed(0)} MB PAGE`;
        element.title =
          "Estimated page memory, including its workers. Browser estimate, not total process RAM.";
        return;
      } catch {
        /* Fall back to the available main-thread heap estimate. */
      } finally {
        pending = false;
      }
    }
    const bytes = performance.memory?.usedJSHeapSize;
    element.textContent = Number.isFinite(bytes)
      ? `${(bytes / 1048576).toFixed(0)} MB JS`
      : "MEM N/A";
    element.title = Number.isFinite(bytes)
      ? "Approximate main-thread JavaScript heap. Excludes background fleet workers, canvas/GPU memory and other browser overhead. Not total page RAM."
      : "This browser does not expose a page memory estimate.";
  }
  sample();
  setInterval(sample, 3000);
}

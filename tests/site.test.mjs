import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";

const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));

function readProjectFile(path) {
  try {
    return readFileSync(join(repositoryRoot, path), "utf8");
  } catch {
    return null;
  }
}

function createAppHarness(search = "") {
  const source = readProjectFile("src/v1/app.js");
  const listeners = new Map();
  const positions = [];
  const appliedPovs = [];
  const panoramas = [];
  let currentPov = { fov: 80, pan: 25, tilt: 5 };
  const panoramaContainer = {};
  const status = { textContent: "" };

  class LatLng {
    constructor(latitude, longitude) {
      this.latitude = latitude;
      this.longitude = longitude;
    }
  }

  class Panorama {
    constructor(container, options) {
      this.container = container;
      this.options = options;
      panoramas.push(this);
    }

    getPov() {
      return currentPov;
    }

    setPosition(position) {
      positions.push(position);
    }

    setPov(pov) {
      appliedPovs.push(pov);
    }
  }

  const naver = {
    maps: {
      Event: {
        addListener(target, eventName, listener) {
          listeners.set(eventName, listener);
        },
      },
      LatLng,
      Panorama,
      PanoramaStatus: {
        OK: "OK",
      },
    },
  };
  const window = {
    location: { search },
    naver,
  };
  const document = {
    getElementById(id) {
      if (id === "panorama") {
        return panoramaContainer;
      }

      if (id === "status") {
        return status;
      }

      return null;
    },
  };

  runInNewContext(source, {
    document,
    naver,
    URLSearchParams,
    window,
  });

  return {
    appliedPovs,
    currentPov,
    listeners,
    panoramas,
    panoramaContainer,
    positions,
    setCurrentPov(pov) {
      currentPov = pov;
    },
    status,
    window,
  };
}

test("source defines a full-size Panorama page", () => {
  const html = readProjectFile("src/v1/index.html");
  const css = readProjectFile("src/v1/styles.css");
  const javascript = readProjectFile("src/v1/app.js");

  assert.notEqual(html, null);
  assert.match(html, /id="panorama"/);
  assert.match(html, /__NCP_MAPS_CLIENT_ID__/);
  assert.notEqual(css, null);
  assert.match(css, /height:\s*100%/);
  assert.notEqual(javascript, null);
  assert.match(javascript, /new naver\.maps\.Panorama/);
});

test("initializes Panorama from lat and lng query parameters", () => {
  const harness = createAppHarness("?lat=37.5665&lng=126.978");

  harness.window.initializePanorama();

  const [panorama] = harness.panoramas;
  assert.equal(panorama.options.position.latitude, 37.5665);
  assert.equal(panorama.options.position.longitude, 126.978);
});

test("requires an initial coordinate", () => {
  const harness = createAppHarness();

  harness.window.initializePanorama();

  assert.equal(harness.panoramas.length, 0);
  assert.equal(harness.status.textContent, "올바른 좌표가 아닙니다.");
});

test("preserves query parameters and hash when redirecting to v1", () => {
  const html = readProjectFile("src/index.html");
  const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
  let redirectedURL;
  const window = {
    location: {
      hash: "#preview",
      href: "https://example.com/SUSA24-panorama/?lat=37.5665&lng=126.978#preview",
      search: "?lat=37.5665&lng=126.978",
      replace(url) {
        redirectedURL = String(url);
      },
    },
  };

  assert.notEqual(script, undefined);
  runInNewContext(script, { URL, window });
  assert.equal(
    redirectedURL,
    "https://example.com/SUSA24-panorama/v1/?lat=37.5665&lng=126.978#preview",
  );
});

test("updates position through the runtime bridge and preserves the current POV", () => {
  const harness = createAppHarness("?lat=37.5665&lng=126.978");
  harness.window.initializePanorama();

  harness.window.SUSA24Panorama.setPosition({
    latitude: 35.1796,
    longitude: 129.0756,
  });

  assert.equal(harness.positions.length, 1);
  assert.equal(harness.positions[0].latitude, 35.1796);
  assert.equal(harness.positions[0].longitude, 129.0756);

  harness.listeners.get("pano_changed")();

  assert.deepEqual(harness.appliedPovs, [harness.currentPov]);
});

test("preserves the latest POV changed while a position update is pending", () => {
  const harness = createAppHarness("?lat=37.5665&lng=126.978");
  const latestPov = { fov: 70, pan: 80, tilt: 10 };
  harness.window.initializePanorama();

  harness.window.SUSA24Panorama.setPosition({
    latitude: 35.1796,
    longitude: 129.0756,
  });
  harness.setCurrentPov(latestPov);
  harness.listeners.get("pov_changed")();
  harness.listeners.get("pano_changed")();

  assert.deepEqual(harness.appliedPovs, [latestPov]);
});

test("clears the loading status after a runtime position update succeeds", () => {
  const harness = createAppHarness("?lat=37.5665&lng=126.978");
  harness.window.initializePanorama();

  harness.window.SUSA24Panorama.setPosition({
    latitude: 35.1796,
    longitude: 129.0756,
  });
  assert.equal(harness.status.textContent, "거리뷰를 불러오는 중입니다.");

  harness.listeners.get("pano_status")("OK");

  assert.equal(harness.status.textContent, "");
});

test("reports a generic load failure when Panorama returns an error", () => {
  const harness = createAppHarness("?lat=37.5665&lng=126.978");
  harness.window.initializePanorama();

  harness.listeners.get("pano_status")("ERROR");

  assert.equal(harness.status.textContent, "거리뷰를 불러오지 못했습니다.");
});

test("reports a NAVER Maps script load failure", () => {
  const harness = createAppHarness("?lat=37.5665&lng=126.978");
  const html = readProjectFile("src/v1/index.html");

  harness.window.handlePanoramaLoadError();

  assert.equal(harness.status.textContent, "거리뷰를 불러오지 못했습니다.");
  assert.match(html, /<script src="\.\/app\.js"><\/script>/);
  assert.match(html, /onerror="handlePanoramaLoadError\(\)"/);
});

test("rejects an incomplete initial coordinate", () => {
  const harness = createAppHarness("?lat=37.5665");

  harness.window.initializePanorama();

  assert.equal(harness.panoramas.length, 0);
  assert.equal(harness.status.textContent, "올바른 좌표가 아닙니다.");
});

test("rejects an out-of-range runtime coordinate", () => {
  const harness = createAppHarness("?lat=37.5665&lng=126.978");
  harness.window.initializePanorama();

  const result = harness.window.SUSA24Panorama.setPosition({
    latitude: 91,
    longitude: 126.978,
  });

  assert.equal(result, false);
  assert.equal(harness.positions.length, 0);
  assert.equal(harness.status.textContent, "올바른 좌표가 아닙니다.");
});

test("hides Panorama navigation arrows and their interaction area", () => {
  const css = readProjectFile("src/v1/styles.css");

  assert.match(css, /\[class\^="arrow_container_"\]/);
  assert.match(css, /\.arrow_image/);
  assert.match(css, /pointer-events:\s*none/);
});

test("build fails when NCP_MAPS_CLIENT_ID is missing", () => {
  const outputDirectory = mkdtempSync(join(tmpdir(), "susa24-panorama-missing-key-"));
  const environment = { ...process.env };
  delete environment.NCP_MAPS_CLIENT_ID;

  const result = spawnSync(
    process.execPath,
    ["scripts/build.mjs", "--output", outputDirectory],
    {
      cwd: repositoryRoot,
      encoding: "utf8",
      env: environment,
    },
  );

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /NCP_MAPS_CLIENT_ID/);
});

test("build injects the Client ID and copies static assets", () => {
  const outputDirectory = mkdtempSync(join(tmpdir(), "susa24-panorama-build-"));

  execFileSync(
    process.execPath,
    ["scripts/build.mjs", "--output", outputDirectory],
    {
      cwd: repositoryRoot,
      env: {
        ...process.env,
        NCP_MAPS_CLIENT_ID: "test-client-id",
      },
    },
  );

  const html = readFileSync(join(outputDirectory, "v1", "index.html"), "utf8");
  const css = readFileSync(join(outputDirectory, "v1", "styles.css"), "utf8");
  const javascript = readFileSync(join(outputDirectory, "v1", "app.js"), "utf8");

  assert.match(html, /ncpKeyId=test-client-id/);
  assert.doesNotMatch(html, /__NCP_MAPS_CLIENT_ID__/);
  assert.match(css, /#panorama/);
  assert.match(javascript, /new naver\.maps\.Panorama/);
});

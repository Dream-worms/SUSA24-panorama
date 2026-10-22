let panorama;
let latestPov;
let pendingPosition;
let isLoading = true;
let isReady = false;
let hasLocation = false;
let requestId = new URLSearchParams(window.location.search).get("requestId") || "";

function notifyNative(type, values = {}) {
  window.webkit?.messageHandlers?.panorama?.postMessage({ type, requestId, ...values });
}

function publishLocation() {
  if (!isReady || isLoading || pendingPosition || !hasLocation) return;
  const location = panorama.getLocation();
  const pov = panorama.getPov();
  if (!location?.coord || !pov) return;
  notifyNative("location", {
    latitude: location.coord.lat(), longitude: location.coord.lng(),
    pan: pov.pan, tilt: pov.tilt, fov: pov.fov,
    title: location.title || "", address: location.address || "",
  });
}

function startPendingPosition() {
  if (!isReady || isLoading || !pendingPosition) return false;
  const next = pendingPosition;
  pendingPosition = null;
  requestId = next.requestId;
  isLoading = true;
  hasLocation = false;
  latestPov = panorama.getPov();
  updateStatus("거리뷰를 불러오는 중입니다.");
  panorama.setPosition(new naver.maps.LatLng(next.latitude, next.longitude));
  return true;
}

function parseCoordinateValue(value) {
  if (typeof value === "number") {
    return value;
  }

  if (typeof value !== "string" || value.trim() === "") {
    return Number.NaN;
  }

  return Number(value);
}

function parseCoordinate(coordinate) {
  if (!coordinate) {
    return null;
  }

  const latitude = parseCoordinateValue(coordinate.latitude);
  const longitude = parseCoordinateValue(coordinate.longitude);

  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180
  ) {
    return null;
  }

  return { latitude, longitude };
}

function getInitialCoordinate() {
  const parameters = new URLSearchParams(window.location.search);
  const latitude = parameters.get("lat");
  const longitude = parameters.get("lng");

  return parseCoordinate({ latitude, longitude });
}

function updateStatus(message) {
  const status = document.getElementById("status");

  if (status) {
    status.textContent = message;
  }
}

window.handlePanoramaLoadError = function handlePanoramaLoadError() {
  updateStatus("거리뷰를 불러오지 못했습니다.");
  notifyNative("error");
};

window.SUSA24Panorama = {
  faceNorth() {
    if (!isReady || isLoading) return false;
    panorama.setPov({ ...panorama.getPov(), pan: 0 });
    return true;
  },
  resize() {
    if (!isReady) return;
    const element = document.getElementById("panorama");
    panorama.setSize(new naver.maps.Size(element.clientWidth, element.clientHeight));
  },
  setPosition(coordinate) {
    if (!panorama) {
      updateStatus("거리뷰가 준비되지 않았습니다.");
      return false;
    }

    const parsedCoordinate = parseCoordinate(coordinate);

    if (!parsedCoordinate) {
      updateStatus("올바른 좌표가 아닙니다.");
      return false;
    }

    pendingPosition = { ...parsedCoordinate, requestId: coordinate.requestId || requestId };
    startPendingPosition();
    return true;
  },
};

window.initializePanorama = function initializePanorama() {
  const container = document.getElementById("panorama");

  if (!container || !window.naver?.maps?.Panorama) {
    updateStatus("거리뷰를 초기화하지 못했습니다.");
    return;
  }

  const initialCoordinate = getInitialCoordinate();

  if (!initialCoordinate) {
    updateStatus("올바른 좌표가 아닙니다.");
    return;
  }

  panorama = new naver.maps.Panorama(container, {
    position: new naver.maps.LatLng(
      initialCoordinate.latitude,
      initialCoordinate.longitude,
    ),
  });

  naver.maps.Event.addListener(panorama, "init", () => {
    isReady = true;
    hasLocation = true;
    notifyNative("ready");
    latestPov = panorama.getPov();
    isLoading = false;
    if (!startPendingPosition()) {
      updateStatus("");
      publishLocation();
    }
  });

  naver.maps.Event.addListener(panorama, "pano_status", (status) => {
    if (status === naver.maps.PanoramaStatus.OK) {
      updateStatus("");
      return;
    }

    isLoading = false;
    hasLocation = false;
    if (!startPendingPosition()) {
      updateStatus("거리뷰를 불러오지 못했습니다.");
      notifyNative("error");
    }
  });

  naver.maps.Event.addListener(panorama, "pano_changed", () => {
    if (latestPov) panorama.setPov(latestPov);
    isLoading = false;
    hasLocation = true;
    if (!startPendingPosition()) publishLocation();
  });

  naver.maps.Event.addListener(panorama, "pov_changed", () => {
    latestPov = panorama.getPov();
    publishLocation();
  });
};

window.addEventListener?.("resize", () => window.SUSA24Panorama.resize());

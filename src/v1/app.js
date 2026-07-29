let panorama;
let latestPov;

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
};

window.SUSA24Panorama = {
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

    latestPov = panorama.getPov();
    panorama.setPosition(
      new naver.maps.LatLng(
        parsedCoordinate.latitude,
        parsedCoordinate.longitude,
      ),
    );
    updateStatus("거리뷰를 불러오는 중입니다.");
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
    latestPov = panorama.getPov();
    updateStatus("");
  });

  naver.maps.Event.addListener(panorama, "pano_status", (status) => {
    if (status === naver.maps.PanoramaStatus.OK) {
      updateStatus("");
      return;
    }

    updateStatus("거리뷰를 불러오지 못했습니다.");
  });

  naver.maps.Event.addListener(panorama, "pano_changed", () => {
    if (latestPov) {
      panorama.setPov(latestPov);
    }
  });

  naver.maps.Event.addListener(panorama, "pov_changed", () => {
    latestPov = panorama.getPov();
  });
};

(() => {
  const FOV_DEG = 82;
  const MAX_RENDER_DISTANCE_M = 1200;
  const DEMO_POSITION = { lat: 35.448977, lng: 139.564211, accuracy: 3 };

  const state = {
    position: null,
    usingDemoPosition: false,
    heading: 0,
    selectedIndex: 0,
    detailOpen: false,
    markerMetrics: [],
    geoWatchId: null,
    lastGpsAt: null
  };

  const els = {
    markerLayer: document.getElementById('markerLayer'),
    radar: document.getElementById('radar'),
    mode: document.getElementById('mode'),
    compass: document.getElementById('compass'),
    permissionBtn: document.getElementById('permissionBtn'),
    prevBtn: document.getElementById('prevBtn'),
    nextBtn: document.getElementById('nextBtn'),
    selectBtn: document.getElementById('selectBtn'),
    demoBtn: document.getElementById('demoBtn'),
    detailPanel: document.getElementById('detailPanel'),
    closeDetail: document.getElementById('closeDetail'),
    detailTitle: document.getElementById('detailTitle'),
    detailDistance: document.getElementById('detailDistance'),
    detailBody: document.getElementById('detailBody'),
    detailSource: document.getElementById('detailSource')
  };

  function toRad(deg) { return deg * Math.PI / 180; }
  function toDeg(rad) { return rad * 180 / Math.PI; }
  function clamp(n, min, max) { return Math.max(min, Math.min(max, n)); }
  function normalizeDeg(deg) { return ((deg % 360) + 360) % 360; }
  function signedAngleDiff(target, current) {
    return ((target - current + 540) % 360) - 180;
  }

  function distanceMeters(a, b) {
    const R = 6371000;
    const dLat = toRad(b.lat - a.lat);
    const dLng = toRad(b.lng - a.lng);
    const lat1 = toRad(a.lat);
    const lat2 = toRad(b.lat);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }

  function bearingDeg(a, b) {
    const lat1 = toRad(a.lat);
    const lat2 = toRad(b.lat);
    const dLng = toRad(b.lng - a.lng);
    const y = Math.sin(dLng) * Math.cos(lat2);
    const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
    return normalizeDeg(toDeg(Math.atan2(y, x)));
  }

  function formatDistance(m) {
    if (!Number.isFinite(m)) return 'GPS待機中';
    return m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`;
  }

  function isSecureEnoughForGps() {
    return window.isSecureContext || location.hostname === 'localhost' || location.hostname === '127.0.0.1';
  }

  function setMode(text) {
    els.mode.textContent = text;
  }

  function startGeolocation() {
    if (!('geolocation' in navigator)) {
      setMode('Geolocation非対応。デモ位置のみ使用できます。');
      return;
    }
    if (!isSecureEnoughForGps()) {
      setMode('GPS不可: HTTPSで公開してください');
      return;
    }

    if (state.geoWatchId !== null) {
      navigator.geolocation.clearWatch(state.geoWatchId);
      state.geoWatchId = null;
    }

    setMode('GPS取得中... 位置情報を許可してください');

    navigator.geolocation.getCurrentPosition(
      onGeoSuccess,
      onGeoError,
      { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 }
    );

    state.geoWatchId = navigator.geolocation.watchPosition(
      onGeoSuccess,
      onGeoError,
      { enableHighAccuracy: true, maximumAge: 1000, timeout: 30000 }
    );
  }

  function onGeoSuccess(pos) {
    state.position = {
      lat: pos.coords.latitude,
      lng: pos.coords.longitude,
      accuracy: pos.coords.accuracy
    };
    state.usingDemoPosition = false;
    state.lastGpsAt = new Date();
    setMode(`GPS ${Math.round(pos.coords.accuracy)}m / ${state.position.lat.toFixed(6)}, ${state.position.lng.toFixed(6)}`);
    render();
  }

  function onGeoError(err) {
    const hint = {
      1: '位置情報が拒否されています',
      2: '現在地を取得できません',
      3: 'GPSタイムアウト'
    }[err.code] || err.message;
    setMode(`GPS待機中: ${hint}`);
    render();
  }

  async function requestOrientationPermission() {
    const DeviceOrientation = window.DeviceOrientationEvent;
    if (DeviceOrientation && typeof DeviceOrientation.requestPermission === 'function') {
      const result = await DeviceOrientation.requestPermission();
      if (result !== 'granted') throw new Error('orientation permission denied');
    }
    window.addEventListener('deviceorientationabsolute', onOrientation, true);
    window.addEventListener('deviceorientation', onOrientation, true);
    if (!state.position) setMode('IMU動作中。GPS取得中...');
  }

  function onOrientation(ev) {
    const webkitHeading = ev.webkitCompassHeading;
    if (typeof webkitHeading === 'number') {
      state.heading = normalizeDeg(webkitHeading);
    } else if (typeof ev.alpha === 'number') {
      state.heading = normalizeDeg(360 - ev.alpha);
    }
    render();
  }

  function computeMetrics() {
    const origin = state.position;
    return window.MARKERS.map((marker, index) => {
      if (!origin) {
        return { marker, index, distance: NaN, bearing: NaN, angle: 0, waitingForGps: true };
      }
      const distance = distanceMeters(origin, marker);
      const bearing = bearingDeg(origin, marker);
      const angle = signedAngleDiff(bearing, state.heading);
      return { marker, index, distance, bearing, angle, waitingForGps: false };
    }).sort((a, b) => {
      if (!Number.isFinite(a.distance) && !Number.isFinite(b.distance)) return a.index - b.index;
      if (!Number.isFinite(a.distance)) return 1;
      if (!Number.isFinite(b.distance)) return -1;
      return a.distance - b.distance;
    });
  }

  function select(delta) {
    const len = window.MARKERS.length;
    state.selectedIndex = (state.selectedIndex + delta + len) % len;
    state.detailOpen = false;
    render();
  }

  function openDetail() {
    state.detailOpen = true;
    render();
  }

  function closeDetail() {
    state.detailOpen = false;
    render();
  }

  function renderWaitingOverlay() {
    const el = document.createElement('div');
    el.className = 'marker waiting';
    el.style.left = '50%';
    el.style.top = '48%';
    el.innerHTML = `
      <div class="label">
        <span class="name">GPS待機中</span>
        <span class="distance">「GPS/IMU許可」を押すか、HTTPSと位置情報権限を確認</span>
      </div>`;
    els.markerLayer.appendChild(el);
  }

  function render() {
    state.markerMetrics = computeMetrics();
    const selected = window.MARKERS[state.selectedIndex];
    els.markerLayer.innerHTML = '';
    els.radar.innerHTML = '';
    els.compass.textContent = `方位 ${Math.round(state.heading)}°`;

    if (!state.position) {
      renderWaitingOverlay();
    }

    for (const item of state.markerMetrics) {
      const { marker, distance, angle } = item;
      const isSelected = marker.id === selected.id;
      const hasGps = Number.isFinite(distance);
      const visible = hasGps && Math.abs(angle) <= FOV_DEG / 2 && distance <= MAX_RENDER_DISTANCE_M;
      const xPercent = hasGps ? clamp(50 + (angle / (FOV_DEG / 2)) * 45, 4, 96) : clamp(18 + item.index * 18, 10, 90);
      const yPercent = hasGps ? clamp(45 + Math.log10(Math.max(distance, 1)) * 4, 38, 68) : 62;
      const scale = hasGps ? clamp(1.45 - Math.log10(Math.max(distance, 2)) * 0.34, 0.48, 1.55) : 0.72;
      const opacity = hasGps ? (visible ? clamp(1.15 - distance / 900, 0.28, 1) : 0.18) : 0.42;

      const el = document.createElement('div');
      el.className = `marker ${isSelected ? 'selected' : ''} ${visible || !hasGps ? '' : 'offscreen'}`;
      el.style.left = `${xPercent}%`;
      el.style.top = `${yPercent}%`;
      el.style.opacity = String(opacity);
      el.style.transform = `translate(-50%, -50%) scale(${isSelected ? scale * 1.13 : scale})`;
      el.innerHTML = `
        <div class="pin"></div>
        <div class="label">
          <span class="name">${marker.name}</span>
          <span class="distance">${formatDistance(distance)}${hasGps ? ` / ${Math.round(angle)}°` : ''}</span>
        </div>`;
      els.markerLayer.appendChild(el);

      if (hasGps) {
        const radarRadius = 42;
        const radarDistance = clamp(distance / 700, 0, 1) * radarRadius;
        const radarAngle = toRad(angle - 90);
        const dot = document.createElement('div');
        dot.className = 'radar-dot';
        dot.style.left = `${46 + Math.cos(radarAngle) * radarDistance}px`;
        dot.style.top = `${46 + Math.sin(radarAngle) * radarDistance}px`;
        dot.style.opacity = isSelected ? '1' : '.45';
        els.radar.appendChild(dot);
      }
    }

    if (state.detailOpen) {
      const metric = state.markerMetrics.find(m => m.marker.id === selected.id);
      const hasGps = metric && Number.isFinite(metric.distance);
      els.detailTitle.textContent = selected.name;
      els.detailDistance.textContent = hasGps
        ? `距離 ${formatDistance(metric.distance)} / 方位 ${Math.round(metric.bearing)}° / 視線差 ${Math.round(metric.angle)}°${state.usingDemoPosition ? ' / デモ位置' : ''}`
        : '距離 GPS待機中';
      els.detailBody.textContent = selected.description;
      els.detailSource.textContent = `Source: ${selected.source}`;
      els.detailPanel.hidden = false;
    } else {
      els.detailPanel.hidden = true;
    }
  }

  function handleGesture(name) {
    switch (name) {
      case 'left': select(-1); break;
      case 'right': select(1); break;
      case 'select': openDetail(); break;
      case 'back': closeDetail(); break;
      default: break;
    }
  }

  function setupInput() {
    document.addEventListener('keydown', ev => {
      if (ev.key === 'ArrowLeft') handleGesture('left');
      if (ev.key === 'ArrowRight') handleGesture('right');
      if (ev.key === 'Enter' || ev.key === ' ') handleGesture('select');
      if (ev.key === 'Escape') handleGesture('back');
    });

    // Neural Band / Meta Web Apps 側のイベント名が公開仕様で確定したら、ここだけ差し替えます。
    // 例: window.dispatchEvent(new CustomEvent('neuralbandgesture', { detail: { gesture: 'select' }}));
    window.addEventListener('neuralbandgesture', ev => handleGesture(ev.detail?.gesture));
    window.addEventListener('meta-neural-band', ev => handleGesture(ev.detail?.gesture));

    els.prevBtn.addEventListener('click', () => handleGesture('left'));
    els.nextBtn.addEventListener('click', () => handleGesture('right'));
    els.selectBtn.addEventListener('click', () => handleGesture('select'));
    els.closeDetail.addEventListener('click', () => handleGesture('back'));
    els.demoBtn.addEventListener('click', () => {
      state.position = DEMO_POSITION;
      state.usingDemoPosition = true;
      setMode('デモ位置: 新桜ケ丘第二公園中心');
      render();
    });
    els.permissionBtn.addEventListener('click', async () => {
      startGeolocation();
      try {
        await requestOrientationPermission();
      } catch (e) {
        setMode('GPS取得中 / IMU許可に失敗');
      }
    });
  }

  setupInput();
  startGeolocation();
  render();
})();

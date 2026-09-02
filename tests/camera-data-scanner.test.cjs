"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const source = fs.readFileSync(path.resolve(__dirname, "..", "camera-data-scanner.js"), "utf8");
const moduleUrl = `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;

class ImageFile {
  constructor(raw, type = "image/png") {
    this.raw = raw;
    this.type = type;
  }
}

global.File = ImageFile;

class FakeHtml5Qrcode {
  static instances = [];

  static async getCameras() {
    return [{id: "rear", label: "Trasera"}, {id: "front", label: "Frontal"}];
  }

  constructor(elementId) {
    this.elementId = elementId;
    this.isScanning = false;
    this.starts = [];
    this.stopCount = 0;
    this.constraints = [];
    this.clearCount = 0;
    FakeHtml5Qrcode.instances.push(this);
  }

  async start(camera, config, onSuccess) {
    this.starts.push({camera, config});
    this.onSuccess = onSuccess;
    this.isScanning = true;
  }

  async stop() {
    this.stopCount += 1;
    this.isScanning = false;
  }

  async scanFile(file) {
    return file.raw;
  }

  getRunningTrackSettings() {
    return {deviceId: "rear"};
  }

  getRunningTrackCapabilities() {
    return {torch: true};
  }

  async applyVideoConstraints(constraints) {
    this.constraints.push(constraints);
  }

  clear() {
    this.clearCount += 1;
  }
}

async function loadScannerModule() {
  return import(moduleUrl);
}

function nextTask() {
  return new Promise((resolve) => setImmediate(resolve));
}

test("serializa cámara, evita duplicados y entrega el sobre de captura", async () => {
  FakeHtml5Qrcode.instances.length = 0;
  const {createCameraDataScanner} = await loadScannerModule();
  const captures = [];
  let releaseCapture;
  const captureGate = new Promise((resolve) => { releaseCapture = resolve; });
  const scanner = createCameraDataScanner({
    elementId: "qr-reader",
    Html5QrcodeClass: FakeHtml5Qrcode,
    onDecoded: async (capture) => {
      captures.push(capture);
      await captureGate;
    },
  });

  await scanner.start();
  const reader = FakeHtml5Qrcode.instances[0];
  reader.onSuccess("  ALUMNO-01  ", {result: {format: {formatName: "QR_CODE"}}});
  reader.onSuccess("ALUMNO-01", {result: {format: {formatName: "QR_CODE"}}});
  await nextTask();

  assert.equal(FakeHtml5Qrcode.instances.length, 1);
  assert.equal(captures.length, 1);
  assert.equal(captures[0].raw, "ALUMNO-01");
  assert.equal(captures[0].format, "QR_CODE");
  assert.equal(captures[0].captureMethod, "camera");
  assert.match(captures[0].capturedAt, /^\d{4}-\d{2}-\d{2}T/);

  releaseCapture();
  await nextTask();
  await scanner.destroy();
  assert.equal(reader.stopCount, 1);
  assert.equal(reader.clearCount, 1);
});

test("cambia de cámara, controla linterna y procesa una imagen", async () => {
  FakeHtml5Qrcode.instances.length = 0;
  const {createCameraDataScanner} = await loadScannerModule();
  const captures = [];
  const scanner = createCameraDataScanner({
    elementId: "qr-reader",
    Html5QrcodeClass: FakeHtml5Qrcode,
    onDecoded: async (capture) => captures.push(capture),
  });

  assert.equal((await scanner.listCameras()).length, 2);
  await scanner.start("rear");
  await scanner.switchCamera("front");
  assert.equal(FakeHtml5Qrcode.instances[0].starts.at(-1).camera, "front");
  assert.equal(await scanner.setTorch(true), true);
  assert.deepEqual(FakeHtml5Qrcode.instances[0].constraints.at(-1), {advanced: [{torch: true}]});

  await scanner.scanImage(new ImageFile("ALUMNO-02"));
  assert.equal(scanner.getState(), "idle");
  assert.equal(captures.at(-1).raw, "ALUMNO-02");
  assert.equal(captures.at(-1).captureMethod, "file");
});

test("recupera el estado tras permiso de cámara denegado", async () => {
  const {createCameraDataScanner, describeCameraError} = await loadScannerModule();
  class DeniedHtml5Qrcode extends FakeHtml5Qrcode {
    async start() {
      const error = new Error("Permission denied");
      error.name = "NotAllowedError";
      throw error;
    }
  }
  const states = [];
  const errors = [];
  const scanner = createCameraDataScanner({
    elementId: "qr-reader",
    Html5QrcodeClass: DeniedHtml5Qrcode,
    onDecoded: async () => {},
    onStateChange: ({state}) => states.push(state),
    onError: (error) => errors.push(error),
  });

  await assert.rejects(scanner.start(), {name: "NotAllowedError"});
  assert.deepEqual(states, ["starting", "error"]);
  assert.equal(errors[0].operation, "start");
  assert.match(describeCameraError(errors[0].error), /No se autorizó la cámara/);
});

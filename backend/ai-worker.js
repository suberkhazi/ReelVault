const { parentPort } = require("worker_threads");
const tf = require("@tensorflow/tfjs");
const mobilenet = require("@tensorflow-models/mobilenet");
const jpeg = require("jpeg-js");
const fs = require("fs");
const path = require("path");

let visionModel = null;

//  Boot up the brain and tell the main server when it's ready
mobilenet.load({ version: 2, alpha: 1.0 }).then((model) => {
  visionModel = model;
  parentPort.postMessage({ type: "ready" });
});

// 2. Listen for messages from the main server
parentPort.on("message", async (data) => {
  if (data.type === "tag") {
    if (!visionModel) return;

    try {
      const filePath = path.join(__dirname, "uploads", data.filename);
      const imgBuffer = fs.readFileSync(filePath);

      const rawImageData = jpeg.decode(imgBuffer, { useTArray: true });
      const tensor = tf
        .tensor3d(new Uint8Array(rawImageData.data), [
          rawImageData.height,
          rawImageData.width,
          4,
        ])
        .slice([0, 0, 0], [-1, -1, 3]);

      const predictions = await visionModel.classify(tensor);
      tensor.dispose(); // Free RAM instantly

      const tags = predictions
        .map((p) => p.className.split(",")[0].toLowerCase())
        .join(", ");

      // 3. Send the result back to the main server!
      parentPort.postMessage({
        type: "success",
        mediaId: data.mediaId,
        filename: data.filename,
        tags,
      });
    } catch (error) {
      parentPort.postMessage({
        type: "error",
        filename: data.filename,
        error: error.message,
      });
    }
  }
});

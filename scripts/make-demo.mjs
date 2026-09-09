#!/usr/bin/env node
/**
 * Capture a popup-only usage GIF for GitHub. GitHub READMEs strip <video> tags,
 * so this is the demo that actually plays.
 */
import { spawn } from "node:child_process";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { createConnection } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(root, "docs");
const framesDir = "/tmp/lahza-demo-frames";
const chrome = process.env.CHROME || "/opt/google/chrome/google-chrome";
const port = Number(process.env.DEMO_CDP_PORT || 9333);
const base = process.env.BASE || "http://127.0.0.1:5173";
const demoMs = Number(process.env.DEMO_MS || 8000);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const waitForPort = async (host, p, timeoutMs = 15000) => {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const open = await new Promise((resolve) => {
      const socket = createConnection({ host, port: p }, () => {
        socket.end();
        resolve(true);
      });
      socket.on("error", () => resolve(false));
    });
    if (open) {
      return;
    }
    await sleep(150);
  }
  throw new Error(`Chrome debug port ${p} did not open`);
};

const connectCdp = async (wsUrl) => {
  const ws = new WebSocket(wsUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener("open", resolve, { once: true });
    ws.addEventListener("error", reject, { once: true });
  });

  let nextId = 0;
  const pending = new Map();
  const events = new Map();

  ws.addEventListener("message", (event) => {
    const message = JSON.parse(String(event.data));
    if (message.id && pending.has(message.id)) {
      const { resolve, reject } = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) {
        reject(new Error(message.error.message || JSON.stringify(message.error)));
        return;
      }
      resolve(message.result);
    }
    if (message.method && events.has(message.method)) {
      events.get(message.method).forEach((fn) => fn(message.params));
    }
  });

  const send = (method, params) =>
    new Promise((resolve, reject) => {
      const id = ++nextId;
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });

  const on = (method, fn) => {
    const list = events.get(method) ?? [];
    list.push(fn);
    events.set(method, list);
  };

  return { ws, send, on };
};

const clickText = async (send, selector, text) => {
  await send("Runtime.evaluate", {
    expression: `(() => {
      const nodes = [...document.querySelectorAll(${JSON.stringify(selector)})];
      const node = nodes.find((el) => (el.textContent || "").replace(/\\s+/g, " ").includes(${JSON.stringify(text)}));
      if (!node) throw new Error("missing " + ${JSON.stringify(text)});
      node.click();
      return node.textContent;
    })()`,
    awaitPromise: true,
    returnByValue: true
  });
};

const waitForText = async (send, text, timeoutMs = 8000) => {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const result = await send("Runtime.evaluate", {
      expression: `document.body.innerText.includes(${JSON.stringify(text)})`,
      returnByValue: true
    });
    if (result.result.value) {
      return;
    }
    await sleep(120);
  }
  throw new Error(`Timed out waiting for "${text}"`);
};

const capture = async (send, file) => {
  const shot = await send("Page.captureScreenshot", {
    format: "png",
    fromSurface: true,
    captureBeyondViewport: false
  });
  await writeFile(file, Buffer.from(shot.data, "base64"));
};

const hold = async (send, filePrefix, startIndex, copies) => {
  const first = path.join(framesDir, `${String(startIndex).padStart(3, "0")}.png`);
  await capture(send, first);
  let count = 1;
  const src = await (await import("node:fs/promises")).readFile(first);
  for (let i = 1; i < copies; i += 1) {
    await writeFile(path.join(framesDir, `${String(startIndex + i).padStart(3, "0")}.png`), src);
    count += 1;
  }
  return startIndex + count;
};

const main = async () => {
  await rm(framesDir, { recursive: true, force: true });
  await mkdir(framesDir, { recursive: true });

  const userData = `/tmp/lahza-demo-chrome-${Date.now()}`;
  const child = spawn(
    chrome,
    [
      "--headless=new",
      "--disable-gpu",
      "--hide-scrollbars",
      "--no-sandbox",
      "--disable-dev-shm-usage",
      "--no-first-run",
      "--no-default-browser-check",
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${userData}`,
      "--window-size=380,640",
      "--force-device-scale-factor=2",
      `${base}/popup.html?shot=1&demoMs=${demoMs}`
    ],
    { stdio: "ignore" }
  );

  try {
    await waitForPort("127.0.0.1", port);
    await sleep(400);
    const targets = await fetch(`http://127.0.0.1:${port}/json/list`).then((res) => res.json());
    const page = targets.find((target) => target.type === "page" && target.webSocketDebuggerUrl);
    if (!page) {
      throw new Error(`No page target: ${JSON.stringify(targets)}`);
    }

    const { ws, send } = await connectCdp(page.webSocketDebuggerUrl);
    await send("Page.enable");
    await send("Runtime.enable");
    await send("Emulation.setDeviceMetricsOverride", {
      width: 380,
      height: 640,
      deviceScaleFactor: 2,
      mobile: false
    });
    await waitForText(send, "Start focus");
    await sleep(400);

    let i = 0;
    i = await hold(send, "idle", i, 10);

    await clickText(send, "button.cta", "Start focus");
    await waitForText(send, "Pause");
    const runningUntil = Date.now() + demoMs + 400;
    while (Date.now() < runningUntil) {
      await capture(send, path.join(framesDir, `${String(i).padStart(3, "0")}.png`));
      i += 1;
      await sleep(450);
    }

    await waitForText(send, "Start break", 4000);
    i = await hold(send, "done", i, 10);
    await clickText(send, "button.ghost", "Dismiss");
    await sleep(250);

    await clickText(send, "nav.tabbar button", "Activity");
    await waitForText(send, "Activity");
    i = await hold(send, "week", i, 8);
    await clickText(send, ".segmented button", "Month");
    await sleep(250);
    i = await hold(send, "month", i, 8);

    await clickText(send, "nav.tabbar button", "Settings");
    await waitForText(send, "Durations, sound");
    i = await hold(send, "settings", i, 10);

    await clickText(send, "nav.tabbar button", "Timer");
    await waitForText(send, "Start");
    i = await hold(send, "timer", i, 8);

    ws.close();

    const gif = path.join(outDir, "demo.gif");
    const mp4 = path.join(outDir, "demo.mp4");
    await runFfmpeg([
      "-y",
      "-framerate",
      "8",
      "-i",
      path.join(framesDir, "%03d.png"),
      "-vf",
      "fps=8,scale=380:-1:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=96:stats_mode=full[p];[s1][p]paletteuse=dither=bayer:bayer_scale=4",
      gif
    ]);
    await runFfmpeg([
      "-y",
      "-framerate",
      "8",
      "-i",
      path.join(framesDir, "%03d.png"),
      "-vf",
      "scale=380:-1:flags=lanczos",
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "-movflags",
      "+faststart",
      mp4
    ]);
    console.log(`wrote ${gif} and ${mp4} from ${i} frames`);
  } finally {
    child.kill("SIGTERM");
  }
};

const runFfmpeg = (args) =>
  new Promise((resolve, reject) => {
    const proc = spawn("ffmpeg", args, { stdio: ["ignore", "pipe", "pipe"] });
    let err = "";
    proc.stderr.on("data", (chunk) => {
      err += chunk.toString();
    });
    proc.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`ffmpeg ${args.join(" ")} failed (${code})\n${err.slice(-1200)}`));
    });
  });

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

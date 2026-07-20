console.log("BepFlowAI Function Compute bootstrap starting", {
  node: process.version,
  cwd: process.cwd(),
  codePath: process.env.FC_FUNC_CODE_PATH || "not provided",
  configuredPort: process.env.FC_CUSTOM_LISTEN_PORT || process.env.API_PORT || process.env.PORT || "not provided",
});

try {
  await import("./server.mjs");
} catch (error) {
  console.error("BepFlowAI bootstrap failed to load server.mjs", error);
  process.exitCode = 1;
}

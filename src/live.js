const { runLivePipeline } = require("./pipeline/live");

function arg(name, fallback) {
  const prefix = `--${name}=`;
  const found = process.argv.find((item) => item.startsWith(prefix));
  return found ? found.slice(prefix.length) : fallback;
}

runLivePipeline({
  limit: Number(arg("limit", 25)),
  prepareApply: arg("prepare-apply", "false") === "true",
  useLlm: arg("llm", "auto") === "false" ? false : undefined
}).then((summary) => {
  console.log(JSON.stringify(summary, null, 2));
}).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

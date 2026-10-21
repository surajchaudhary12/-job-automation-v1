const { spawn } = require("child_process");
const path = require("path");

const root = path.resolve(__dirname, "..");
const projectDir = path.join(root, "java-apply");
const wrapper = process.platform === "win32" ? "mvnw.cmd" : "./mvnw";
const args = process.argv.slice(2);
const child = spawn(wrapper, args, { cwd: projectDir, stdio: "inherit", shell: process.platform === "win32", windowsHide: true });

child.on("error", (error) => {
  console.error(`Could not start the Maven wrapper: ${error.message}`);
  process.exitCode = 1;
});
child.on("close", (code) => {
  if (code !== 0) process.exitCode = code || 1;
});

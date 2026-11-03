import app from "./app.js";

const PORT = process.env.PORT || 4000;
const HOST = process.env.HOST || "0.0.0.0";
const NODE_ENV = process.env.NODE_ENV || "development";

const colors = {
  reset: "\x1b[0m",
  cyan: "\x1b[36m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  bold: "\x1b[1m",
};

function printStartupBanner() {
  const localUrl = `http://localhost:${PORT}`;
  const networkUrl = `http://${HOST}:${PORT}`;

  console.log("");
  console.log(`${colors.cyan}${colors.bold}============================================================${colors.reset}`);
  console.log(`${colors.cyan}${colors.bold}                  MOUNTAIN HUT BACKEND                      ${colors.reset}`);
  console.log(`${colors.cyan}${colors.bold}============================================================${colors.reset}`);
  console.log(`${colors.green}Status:${colors.reset} server running`);
  console.log(`${colors.green}Local:${colors.reset}  ${localUrl}`);
  console.log(`${colors.green}Host:${colors.reset}   ${networkUrl}`);
  console.log(`${colors.yellow}Env:${colors.reset}    ${NODE_ENV}`);
  console.log(`${colors.cyan}${colors.bold}============================================================${colors.reset}`);
  console.log("");
}

const server = app.listen(PORT, HOST, () => {
  printStartupBanner();
});

server.on("error", (error) => {
  if (error.code === "EADDRINUSE") {
    console.error(
      `${colors.red}${colors.bold}Startup error:${colors.reset} port ${PORT} is already in use.`
    );
  } else {
    console.error(`${colors.red}${colors.bold}Startup error:${colors.reset}`, error);
  }
  process.exit(1);
});
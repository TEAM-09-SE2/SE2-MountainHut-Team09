import app from "./app.js";

const PORT = process.env.PORT || 4000;
const HOST = process.env.HOST || "0.0.0.0";
const NODE_ENV = process.env.NODE_ENV || "development";

const colors = {
  reset: "\x1b[0m",
  cyan: "\x1b[36m",
  blue: "\x1b[34m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  gray: "\x1b[90m",
  bold: "\x1b[1m",
};

function printStartupBanner() {
  const localUrl = `http://localhost:${PORT}`;
  const networkUrl = `http://${HOST}:${PORT}`;
  const startedAt = new Date().toLocaleString("en-GB", {
    hour12: false,
    timeZoneName: "short",
  });
  const apiBase = `${localUrl}/api/v1`;

  console.log("");
  console.log(`${colors.blue}${colors.bold}+----------------------------------------------------------+${colors.reset}`);
  console.log(`${colors.blue}${colors.bold}|                  MOUNTAIN HUT BACKEND                   |${colors.reset}`);
  console.log(`${colors.blue}${colors.bold}+----------------------------------------------------------+${colors.reset}`);
  console.log(`${colors.green}${colors.bold}  READY${colors.reset}  Server is up and accepting requests`);
  console.log(`${colors.cyan}  Local URL:${colors.reset}   ${localUrl}`);
  console.log(`${colors.cyan}  Network URL:${colors.reset} ${networkUrl}`);
  console.log(`${colors.cyan}  API Base:${colors.reset}    ${apiBase}`);
  console.log(`${colors.yellow}  Environment:${colors.reset} ${NODE_ENV}`);
  console.log(`${colors.gray}  Started at:${colors.reset}  ${startedAt}`);
  console.log(`${colors.gray}  Auth routes:${colors.reset} ${apiBase}/auth/{register,login,me,logout}`);
  console.log(`${colors.blue}${colors.bold}+----------------------------------------------------------+${colors.reset}`);
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
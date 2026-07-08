const http = require("node:http");
const { handleVisitorCount, sendJson } = require("./visitor-counter-core");

const PORT = Number(process.env.PORT || 3000);

const server = http.createServer((request, response) => {
  const requestUrl = new URL(request.url, `http://${request.headers.host || "localhost"}`);

  if (requestUrl.pathname === "/health") {
    sendJson(request, response, 200, { ok: true });
    return;
  }

  if (requestUrl.pathname === "/api/visitor-count") {
    handleVisitorCount(request, response);
    return;
  }

  sendJson(request, response, 404, { error: "Not found" });
});

server.listen(PORT, () => {
  process.stdout.write(`Visitor counter API listening on port ${PORT}\n`);
});

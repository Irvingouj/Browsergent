import { BridgeServer } from "./bridge-server.ts";

const PORT = 8787;

const server = new BridgeServer();
const { port } = await server.listen(PORT);
console.log(`browsergent host listening on http://127.0.0.1:${port}/bridge`);
console.log(`extension websocket: ws://127.0.0.1:${port}/extension`);

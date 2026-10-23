import * as enums from "../src/generated/prisma/enums.js";

console.log("Category:", JSON.stringify(enums.Category));
console.log("keys:", Object.keys(enums).slice(0, 30).join(","));

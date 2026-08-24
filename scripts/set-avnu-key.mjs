import { stdin, stdout } from "node:process";

import { createPaymasterKeyStore } from "../server/src/pay/keychain.ts";

async function readSecret() {
  if (!stdin.isTTY) throw new Error("Run this command in a terminal.");

  stdout.write("Paste the AVNU paymaster key: ");
  stdin.setRawMode(true);
  stdin.resume();

  return new Promise((resolve, reject) => {
    let key = "";
    const done = () => {
      stdin.setRawMode(false);
      stdin.pause();
      stdout.write("\n");
    };
    stdin.on("data", (input) => {
      for (const char of input.toString()) {
        if (char === "\u0003") {
          done();
          reject(new Error("Canceled."));
        } else if (char === "\r" || char === "\n") {
          done();
          resolve(key.trim());
        } else if (char === "\u007f") {
          key = key.slice(0, -1);
        } else {
          key += char;
        }
      }
    });
  });
}

const key = await readSecret();

if (!key) {
  console.error("No AVNU paymaster key was provided.");
  process.exit(1);
}

await createPaymasterKeyStore().save(key);
console.log("The AVNU paymaster key is stored in the macOS Keychain.");

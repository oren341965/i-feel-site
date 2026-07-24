import { readdir } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { Client } from "basic-ftp";

function getRequiredEnvironmentValue(name) {
  const value = process.env[name];
  if (!value?.trim()) {
    throw new Error(`Required environment variable '${name}' is missing.`);
  }
  return value.trim();
}

async function listFiles(root, current = root) {
  const entries = await readdir(current, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const absolutePath = path.join(current, entry.name);
    if (entry.isDirectory()) {
      files.push(...await listFiles(root, absolutePath));
    } else if (entry.isFile()) {
      files.push({
        absolutePath,
        relativePath: path.relative(root, absolutePath).split(path.sep).join("/"),
      });
    }
  }

  return files;
}

function uploadPriority(relativePath) {
  const lowerPath = relativePath.toLowerCase();
  if (lowerPath.endsWith("/.htaccess") || lowerPath === ".htaccess") {
    return 3;
  }
  if (
    lowerPath.endsWith(".html")
    || lowerPath.endsWith(".php")
    || lowerPath.endsWith(".xml")
  ) {
    return 2;
  }
  return 1;
}

function sanitizedErrorMessage(error, username, password) {
  let message = error instanceof Error ? error.message : String(error);
  for (const secret of [username, password]) {
    if (secret) {
      message = message.split(secret).join("***");
    }
  }
  return message;
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

const distArgument = process.argv[2] ?? "dist";
const distPath = path.resolve(distArgument);
const server = getRequiredEnvironmentValue("IFEEL_FTP_SERVER")
  .replace(/^ftps?:\/\//i, "")
  .replace(/\/+$/, "");
const username = getRequiredEnvironmentValue("IFEEL_FTP_USERNAME");
const password = getRequiredEnvironmentValue("IFEEL_FTP_PASSWORD");
const serverDirectory = getRequiredEnvironmentValue("IFEEL_FTP_SERVER_DIR")
  .replace(/^\/+|\/+$/g, "");
const remoteRoot = `/${serverDirectory}`;

const files = await listFiles(distPath);
if (files.length === 0) {
  throw new Error(`No files were found under '${distPath}'.`);
}

files.sort((left, right) => {
  const priorityDifference = uploadPriority(left.relativePath) - uploadPriority(right.relativePath);
  return priorityDifference || left.relativePath.localeCompare(right.relativePath, "en");
});

console.log(`Uploading ${files.length} validated files to JetServer through explicit FTPS.`);
console.log("A persistent control connection is used; server-side deletion is disabled.");

let client = new Client(120_000);
client.ftp.verbose = false;
let currentRemoteDirectory;

async function connect() {
  if (!client.closed) {
    client.close();
  }
  client = new Client(120_000);
  client.ftp.verbose = false;
  await client.access({
    host: server,
    port: 21,
    user: username,
    password,
    secure: true,
    secureOptions: {
      minVersion: "TLSv1.2",
      rejectUnauthorized: true,
      servername: server,
    },
  });
  currentRemoteDirectory = undefined;
}

try {
  await connect();

  let uploaded = 0;
  for (const file of files) {
    const remotePath = path.posix.join(remoteRoot, file.relativePath);
    const remoteDirectory = path.posix.dirname(remotePath);
    const remoteName = path.posix.basename(remotePath);

    let completed = false;
    for (let attempt = 1; attempt <= 3 && !completed; attempt += 1) {
      try {
        if (client.closed) {
          await connect();
        }
        if (currentRemoteDirectory !== remoteDirectory) {
          await client.ensureDir(remoteDirectory);
          currentRemoteDirectory = remoteDirectory;
        }
        await client.uploadFrom(file.absolutePath, remoteName);
        completed = true;
      } catch (error) {
        client.close();
        currentRemoteDirectory = undefined;
        if (attempt === 3) {
          const reason = sanitizedErrorMessage(error, username, password);
          throw new Error(
            `FTPS upload failed for '${file.relativePath}' after ${attempt} attempts: ${reason}`,
          );
        }
        await delay(attempt * 2_000);
      }
    }

    uploaded += 1;
    if (uploaded % 50 === 0 || uploaded === files.length) {
      console.log(`Uploaded ${uploaded} / ${files.length} files.`);
    }
  }
} finally {
  client.close();
}

console.log("FTPS deployment completed successfully. No remote files were deleted.");

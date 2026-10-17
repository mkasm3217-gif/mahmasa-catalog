"use strict";
const webpush = require("web-push");
const keys = webpush.generateVAPIDKeys();
process.stdout.write("Create these three Render environment variables. Keep VAPID_PRIVATE_KEY secret and never commit or send it.\n");
process.stdout.write(`VAPID_PUBLIC_KEY=${keys.publicKey}\n`);
process.stdout.write(`VAPID_PRIVATE_KEY=${keys.privateKey}\n`);
process.stdout.write("VAPID_SUBJECT=mailto:YOUR-EMAIL@example.com\n");

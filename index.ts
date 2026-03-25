#!/usr/bin/env bun

import { runCli } from "./src/cli/bootstrap.ts";

await runCli(process.argv.slice(2));

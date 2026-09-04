#!/usr/bin/env node
/**
 * Merge latest main into feature/nabad-producer so your phone branch
 * stays up to date with everything shipped to production.
 *
 *   node scripts/sync-producer-branch.mjs
 *   node scripts/sync-producer-branch.mjs --push
 */
import { execFileSync } from "child_process";

const push = process.argv.includes("--push");
const withStaging = process.argv.includes("--with-staging");
const PRODUCER_BRANCH = "feature/nabad-producer";

function sh(cmd, args, opts = {}) {
  return execFileSync(cmd, args, { encoding: "utf8", stdio: opts.inherit ? "inherit" : "pipe", ...opts });
}

function run(cmd, args) {
  sh(cmd, args, { stdio: "inherit" });
}

const startBranch = sh("git", ["branch", "--show-current"]);

try {
  run("git", ["fetch", "origin"]);
  run("git", ["checkout", PRODUCER_BRANCH]);
  run("git", ["merge", "origin/main", "-m", "Merge main into feature/nabad-producer after production ship."]);
  if (withStaging) {
    run("git", ["merge", "origin/staging", "-m", "Merge staging into feature/nabad-producer (unshipped fixes)."]);
  }
  if (push) {
    run("git", ["push", "origin", PRODUCER_BRANCH]);
  }
  console.log(`\n[sync-producer-branch] ${PRODUCER_BRANCH} now includes origin/main.`);
  console.log("Test on your phone: npm run run:ios:staging");
} catch (e) {
  console.error("\n[sync-producer-branch] Merge failed — resolve conflicts on", PRODUCER_BRANCH);
  console.error("Keep Producer files from --ours (feature branch) and take other fixes from main.");
  process.exit(1);
} finally {
  if (startBranch && startBranch !== PRODUCER_BRANCH) {
    try {
      run("git", ["checkout", startBranch]);
    } catch {
      /* stay on producer branch */
    }
  }
}

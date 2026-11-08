import { compose } from "./env";

/** Removes the test copy of Hydro and its data. Set E2E_KEEP=1 to leave it running for a look. */
export default async function globalTeardown() {
  if (process.env.E2E_KEEP === "1") {
    console.log("E2E_KEEP=1: leaving the test app running (docker compose -p hydro-e2e down -v to remove it)");
    return;
  }
  compose("down -v --remove-orphans");
}

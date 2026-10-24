import { ensureSeeded } from "../src/lib/seed";

async function main() {
  console.log("Starting Aurora Pay database seed...");
  try {
    const result = await ensureSeeded();
    if (result.seeded) {
      console.log(`Successfully seeded workspace 'Aurora Pay' (${result.workspaceId})`);
    } else {
      console.log(`Database already seeded. Workspace ID: ${result.workspaceId}`);
    }
  } catch (error) {
    console.error("Error during seed execution:", error);
    process.exit(1);
  }
}

main();

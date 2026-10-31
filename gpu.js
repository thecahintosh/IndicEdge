
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export async function getGPUStatus() {
  try {
    const { stdout } = await execFileAsync(
      "nvidia-smi",
      [
        "--query-gpu=name,utilization.gpu,memory.used,memory.total",
        "--format=csv,noheader,nounits"
      ],
      { timeout: 3000 }
    );

    const line = stdout.trim().split("\n")[0];

    if (!line) {
      return {
        available: false,
        reason: "No GPU data returned"
      };
    }

    const parts = line.split(",").map(x => x.trim());

    if (parts.length < 4) {
      return {
        available: false,
        reason: "Invalid telemetry response"
      };
    }

    const [name, utilization, used, total] = parts;

    return {
      available: true,
      name,
      utilizationPercent: Number(utilization),
      memoryUsedMiB: Number(used),
      memoryTotalMiB: Number(total),
      source: "nvidia-smi"
    };
  } catch {
    return {
      available: false,
      reason: "NVIDIA telemetry unavailable in container"
    };
  }
}

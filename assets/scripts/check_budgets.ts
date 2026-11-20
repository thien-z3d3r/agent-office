import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REQUIRED_CHAR_CLIPS = [
  "Idle",
  "Walk",
  "Walk_Carry",
  "Sit_Idle",
  "Sit_Type",
  "Read",
  "Type_Standing",
  "Raise_Hand",
  "Cheer",
  "Defeated",
  "Drink",
];

const REQUIRED_AOKIT_MODELS: Array<{
  file: string;
  maxBytes: number;
  requiredNodes: string[];
  requiredClips?: string[];
}> = [
  {
    file: "desk_props.glb",
    maxBytes: 512 * 1024,
    requiredNodes: ["mug", "books_upright", "books_leaning", "books_stack"],
  },
  {
    file: "kitchen.glb",
    maxBytes: 1024 * 1024,
    requiredNodes: ["coffee_machine"],
  },
  {
    file: "lounge.glb",
    maxBytes: 1024 * 1024,
    requiredNodes: ["sofa", "pillow", "pouf", "coffee_table"],
  },
  {
    file: "plants.glb",
    maxBytes: 1024 * 1024,
    requiredNodes: ["monstera", "snake_plant", "ficus", "succulent"],
  },
  {
    file: "dog-corgi.glb",
    maxBytes: 1536 * 1024,
    requiredNodes: ["jaw", "eye_L", "eye_R", "socket_head", "socket_neck"],
    requiredClips: ["stand", "walk", "run", "sit", "lie", "nap", "sniff", "wag"],
  },
];

interface GlbJsonChunk {
  nodes?: Array<{ name?: string }>;
  animations?: Array<{ name?: string }>;
}

export function parseGlbJsonChunk(buffer: Buffer): GlbJsonChunk {
  if (buffer.length < 20) {
    throw new Error("File too small to be a valid GLB");
  }
  const magic = buffer.readUInt32LE(0);
  if (magic !== 0x46546c67) {
    throw new Error("Invalid GLB magic header");
  }
  const jsonChunkLength = buffer.readUInt32LE(12);
  const jsonChunkType = buffer.readUInt32LE(16);
  if (jsonChunkType !== 0x4e4f534a) {
    throw new Error("First GLB chunk is not JSON");
  }
  const jsonStr = buffer.subarray(20, 20 + jsonChunkLength).toString("utf8");
  return JSON.parse(jsonStr) as GlbJsonChunk;
}

export function checkAssetBudgets(modelsDir: string): string[] {
  const errors: string[] = [];
  const officePath = path.join(modelsDir, "office_kit.glb");
  const charPath = path.join(modelsDir, "character_base.glb");

  if (!fs.existsSync(officePath)) {
    errors.push(`Missing office_kit.glb at ${officePath}`);
  } else {
    const stat = fs.statSync(officePath);
    if (stat.size > 3 * 1024 * 1024) {
      errors.push(`office_kit.glb exceeds 3 MB budget (${stat.size} bytes)`);
    }
  }

  if (!fs.existsSync(charPath)) {
    errors.push(`Missing character_base.glb at ${charPath}`);
  } else {
    const stat = fs.statSync(charPath);
    if (stat.size > 1.5 * 1024 * 1024) {
      errors.push(`character_base.glb exceeds 1.5 MB budget (${stat.size} bytes)`);
    }
    const gltf = parseGlbJsonChunk(fs.readFileSync(charPath));
    const animNames = new Set((gltf.animations ?? []).map((a) => a.name ?? ""));
    for (const reqClip of REQUIRED_CHAR_CLIPS) {
      if (!animNames.has(reqClip)) {
        errors.push(`character_base.glb missing clip "${reqClip}"`);
      }
    }
  }

  for (const spec of REQUIRED_AOKIT_MODELS) {
    const full = path.join(modelsDir, spec.file);
    if (!fs.existsSync(full)) {
      errors.push(`Missing required model ${spec.file}`);
      continue;
    }
    const stat = fs.statSync(full);
    if (stat.size > spec.maxBytes) {
      errors.push(`${spec.file} exceeds budget (${stat.size} > ${spec.maxBytes})`);
    }
    const gltf = parseGlbJsonChunk(fs.readFileSync(full));
    const nodeNames = new Set((gltf.nodes ?? []).map((n) => n.name ?? ""));
    for (const reqNode of spec.requiredNodes) {
      if (!nodeNames.has(reqNode)) {
        errors.push(`${spec.file} missing required node "${reqNode}"`);
      }
    }
    if (spec.requiredClips) {
      const animNames = new Set((gltf.animations ?? []).map((a) => a.name ?? ""));
      for (const clip of spec.requiredClips) {
        if (!animNames.has(clip)) {
          errors.push(`${spec.file} missing required clip "${clip}"`);
        }
      }
    }
  }

  return errors;
}

const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]) ===
    path.resolve(fileURLToPath(import.meta.url));

if (isMain) {
  const rootDir = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../.."
  );
  const webModelsDir = path.join(rootDir, "apps/web/public/models");
  const errors = checkAssetBudgets(webModelsDir);
  if (errors.length > 0) {
    console.error("Asset budget verification FAILED:");
    for (const e of errors) console.error("  -", e);
    process.exit(1);
  }
  console.log(
    `Asset budget check PASSED: verified office_kit.glb, character_base.glb, desk_props.glb, kitchen.glb, lounge.glb, plants.glb, and dog-corgi.glb.`
  );
}

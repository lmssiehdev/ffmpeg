import type { WorkspaceAsset } from "@/features/workspace/types"

export const FFMPEG_INPUT_DIRECTORY = "/inputs"

function rootFileName(path: string) {
  const name = path.startsWith("./") || path.startsWith("/") ? path.replace(/^\.?\//, "") : path
  if (!name || name === "." || name === ".." || name.includes("/")) return null
  return name
}

export function mountedInputPath(name: string) {
  return `${FFMPEG_INPUT_DIRECTORY}/${name}`
}

export function rewriteMountedInputArguments(args: string[], assets: WorkspaceAsset[]) {
  const mountedPaths = new Map<string, string>()

  for (const asset of assets) {
    if (asset.source !== "upload" || asset.status !== "ready") continue

    const path = mountedInputPath(asset.name)
    mountedPaths.set(asset.name, path)
    mountedPaths.set(`./${asset.name}`, path)
    mountedPaths.set(`/${asset.name}`, path)
  }

  return args.map((argument, index) => (args[index - 1] === "-i" ? (mountedPaths.get(argument) ?? argument) : argument))
}

export function referencedRootFileNames(args: string[]) {
  const names = new Set<string>()

  for (const argument of args) {
    const name = rootFileName(argument)
    if (name) names.add(name)
  }

  return names
}

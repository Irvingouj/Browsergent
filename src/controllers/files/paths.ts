/** Join a parent directory path with a child name into a normalized OPFS path. */
export function joinChildPath(parent: string, name: string): string {
	return parent === "/" ? `/${name}` : `${parent}/${name}`;
}

/** Extract the directory portion of a path (everything before the last `/`). */
export function parentDirPath(path: string): string {
	const lastSlash = path.lastIndexOf("/");
	return lastSlash <= 0 ? "" : path.slice(0, lastSlash);
}

/** Build the new path for a rename: same directory, new leaf name. */
export function newPathForRename(path: string, newName: string): string {
	const dir = parentDirPath(path);
	return dir === "" ? `/${newName}` : `${dir}/${newName}`;
}

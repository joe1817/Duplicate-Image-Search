class UnifiedFileProvider {
    getFileType(item) {
        if ("kind" in item) return item.kind;
        if ("isFile" in item) {
            if (item.isFile) return "file";
            if (item.isDirectory) return "directory";
        }
        if (item instanceof File) return "file";
        return undefined;
    }

    _sortEntries(entries) {
        return entries.sort((a, b) => {
            const typeA = this.getFileType(a);
            const typeB = this.getFileType(b);
            const pathA = a.webkitRelativePath || a.name || "";
            const pathB = b.webkitRelativePath || b.name || "";
            if (typeA === typeB) {
                return PathSort.compare(pathA, pathB);
            } else if (pathA === pathB) {
                return 0;
            } else if (typeA === "file") {
                return -1;
            } else {
                return 1;
            }
        });
    }

    async * getFilesFromPicker() {
        if ("showDirectoryPicker" in window) {
            const handle = await window.showDirectoryPicker();
            yield* this._yieldFilesRecursively(handle);
        }
    }

    async * getFilesFromDrop(event) {
        event.preventDefault();
        const items = Array.from(event.dataTransfer.items);
        const entries = items.map(item => item.webkitGetAsEntry()).filter(Boolean);
        const sortedEntries = this._sortEntries(entries);
        yield* this._processEntries(sortedEntries);
    }

    async * getFilesFromInput(event) {
        const input = event.target;
        if (input.webkitEntries && input.webkitEntries.length > 0) {
            const sorted = this._sortEntries(Array.from(input.webkitEntries));
            yield* this._processEntries(sorted);
        } else if (input.files) {
            const sortedFiles = this._sortEntries(Array.from(input.files));
            yield sortedFiles;
        }
    }

    async * _processEntries(entries) {
        const currentLevelFiles = [];
        const directories = [];

        for (const entry of entries) {
            if (this.getFileType(entry) === "file") {
                const file = entry.isFile
                    ? await new Promise((res, rej) => entry.file(res, rej))
                    : await entry.getFile();
                currentLevelFiles.push(file);
            } else {
                directories.push(entry);
            }
        }

        if (currentLevelFiles.length > 0) yield currentLevelFiles;

        for (const dir of directories) {
            yield* this._recursiveEntryWalk(dir);
        }
    }

    async * _recursiveEntryWalk(entry) {
        if (entry.isDirectory) {
            const reader = entry.createReader();
            const allChildren = [];

            let batch = await new Promise((res, rej) => reader.readEntries(res, rej));
            while (batch.length > 0) {
                allChildren.push(...batch);
                batch = await new Promise((res, rej) => reader.readEntries(res, rej));
            }

            const sortedChildren = this._sortEntries(allChildren);
            const files = [];
            const subDirs = [];

            for (const child of sortedChildren) {
                if (child.isFile) {
                    files.push(await new Promise((res, rej) => child.file(res, rej)));
                } else {
                    subDirs.push(child);
                }
            }

            if (files.length > 0) yield files;

            for (const dir of subDirs) {
                yield* this._recursiveEntryWalk(dir);
            }
        }
    }

    async * _yieldFilesRecursively(handle) {
        const entries = [];
        for await (const entry of handle.values()) {
            entries.push(entry);
        }

        const sortedEntries = this._sortEntries(entries);
        const files = [];
        const subDirs = [];

        for (const entry of sortedEntries) {
            if (entry.kind === "file") {
                files.push(await entry.getFile());
            } else {
                subDirs.push(entry);
            }
        }

        if (files.length > 0) yield files;

        for (const dir of subDirs) {
            yield* this._yieldFilesRecursively(dir);
        }
    }
}

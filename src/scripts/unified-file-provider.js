class UnifiedFileProvider {
	getFileType(item) {
		// Modern File System Access API (FileSystemHandle)
		if ("kind" in item) {
			return item.kind; // Returns 'file' or 'directory'
		}
		// FileSystem Entry API (DataTransferItem / webkitEntries)
		if ("isFile" in item) {
			if (item.isFile) return "file";
			if (item.isDirectory) return "directory";
		}
		// Standard File Object (HTML Input fallback)
		if (item instanceof File) {
			return "file";
		}
		return undefined;
	}

    _sortEntries(entries) {
        return entries.sort((a, b) => {
			const typeA = this.getFileType(a);
			const typeB = this.getFileType(b);
			const pathA = a.webkitRelativePath || a.name || "";
			const pathB = b.webkitRelativePath || b.name || "";
			if (typeA === typeB) {
				return -PathSort.compare(pathA, pathB);
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
            for (const file of sortedFiles) {
                yield file;
            }
        }
    }

    async * _processEntries(entries) {
        for (const entry of entries) {
            yield* this._recursiveEntryWalk(entry);
        }
    }

    async * _recursiveEntryWalk(entry) {
        if (entry.isFile) {
            yield await new Promise((resolve, reject) => entry.file(resolve, reject));
        } else if (entry.isDirectory) {
            const reader = entry.createReader();
            const allChildren = [];

            let batch = await new Promise((res, rej) => reader.readEntries(res, rej));
            while (batch.length > 0) {
                allChildren.push(...batch);
                batch = await new Promise((res, rej) => reader.readEntries(res, rej));
            }

            const sortedChildren = this._sortEntries(allChildren);
            for (const child of sortedChildren) {
                yield* this._recursiveEntryWalk(child);
            }
        }
    }

    async * _yieldFilesRecursively(handle) {
        const entries = [];
        for await (const entry of handle.values()) {
            entries.push(entry);
        }

        const sortedEntries = this._sortEntries(entries);

        for (const entry of sortedEntries) {
            if (entry.kind === "file") {
                yield await entry.getFile();
            } else if (entry.kind === "directory") {
                yield* this._yieldFilesRecursively(entry);
            }
        }
    }
}

class UnifiedFileProvider {

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
        yield* this._processEntries(entries);
    }

    async * getFilesFromInput(event) {
        const input = event.target;
        // Check for webkitEntries (Chrome/Edge)
        if (input.webkitEntries && input.webkitEntries.length > 0) {
            yield* this._processEntries(input.webkitEntries);
        } else if (input.files) {
            // Standard fallback (Firefox/Safari)
            yield* input.files;
        }
    }

    async * _processEntries(entries) {
        for (const entry of entries) {
            yield* this._recursiveEntryWalk(entry);
        }
    }

    async * _recursiveEntryWalk(entry) {
        if (entry.isFile) {
            const file = await new Promise((resolve, reject) => entry.file(resolve, reject));
            yield file;
        } else if (entry.isDirectory) {
            const reader = entry.createReader();
            yield* this._readBatch(reader);
        }
    }

    async * _readBatch(reader) {
        const results = await new Promise((res, rej) => reader.readEntries(res, rej));
        if (results.length > 0) {
            for (const child of results) {
                yield* this._recursiveEntryWalk(child);
            }
            yield* this._readBatch(reader);
        }
    }

    async * _yieldFilesRecursively(handle) {
        for await (const entry of handle.values()) {
            if (entry.kind === "file") {
                yield await entry.getFile();
            } else if (entry.kind === "directory") {
                yield* this._yieldFilesRecursively(entry);
            }
        }
    }
}

"use strict";
const debug = require('@jbowwww/log');//('model/filesys/dir');
const inspect = require('../../utility.js').makeInspect({ depth: 2, compact: false /* true */ });
const nodeFs = require('fs').promises;
const nodePath = require('path');
const mongoose = require('mongoose');
const FsEntry = require('./filesys-entry.js');

let dirSchema = new mongoose.Schema({ }, { defaultFindQuery: { path: undefined } });

// dirSchema.plugin(require('./plugin/stat.js'), { data: {} });

// dirSchema.post('construct', function postConstruct(doc, next) {
// 	if (!doc.stat)
// 		throw new Error(`dirSchema.post('construct'): doc.stat == ${inspect(doc.stat)}`);
// 	else if (!doc.stats.isDirectory())
// 		throw new TypeError(`dirSchema.post('construct'): !doc.stats.isDirectory()`);
// 	var root = await Dir.findOrCreate({ path: search.path, stat: await fs.stat(path)})
// });

dirSchema.static('iterate', function iterate(options = {}) {
	// return {
	// 	asArtefact() {

	// 	},
	// 	[Symbol.asyncIterator]() {
	// 		return this;
	// 	},
	// 	async next() {

	// 	}
	// }
	const model = this;
	var r = (async function* iterate(/*options = {}*/) {
		const newDoc = new model(await createRawFsEntry(options.path));
		yield newDoc;
		yield* newDoc.iterate({ ...options, path: undefined });
	})();
	r.asArtefact = async function* asArtefact() {
		for await (const data of this) {
			yield await data.getArtefact();
		}
	};
	return r;
});

dirSchema.method('iterate', async function* iterate(options = {}) {
	options = {
		// path: '.',
		maxDepth: undefined,
		filter: item => true,
		handleError(err) { console.warn(`iterate: ${err/*.stack*/}`); },
		...options
	};
	debug(`dir.iterate(): this=${inspect(this)} options=${inspect(options)}`);
	try {
		for await (const newDoc of this.read()) {
			if (!options.filter || await options.filter(newDoc)) {
				yield newDoc;
				if (newDoc instanceof this.constructor && (!options.maxDepth || options.maxDepth > 0)) {
					yield* newDoc.iterate({
						...options,
						maxDepth: options.maxDepth instanceof Number ? options.maxDepth - 1 : undefined 
					});
				}
			}
		}
	} catch (err) {
		if (typeof options.handleError === 'function')
			options.handleError(err);
		else throw err;
	}
});

async function createRawFsEntry(path, dir) {
	const stats = await nodeFs.lstat(path);
	const fsEntry = {
		path, dir, stats,
		fileType: stats.isDirectory() ? 'dir' : stats.isFile() ? 'file' : 'unknown'
	};
	return fsEntry;
}

dirSchema.method('read', async function* read() {
	yield* (await nodeFs.readdir(this.path))
		.map(async name => await FsEntry.findOrCreate(
			await createRawFsEntry(nodePath.join(this.path, name), this._id)
	));
});
// only works in newer nodejs?
// 	for await (const dirent of await nodeFs.opendir(this.path)) {
// 		yield FsEntry.findOrCreate({ path: nodePath.join(this.path, name) });
// 	}
// });

module.exports = FsEntry.discriminator('dir', dirSchema);

debug(`Dir: ${inspect(module.exports)}, Dir.prototype: ${inspect(module.exports.prototype)}`);

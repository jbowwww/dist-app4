"use strict";
const debug = require('@jbowwww/log');//('model/filesys/dir');
const inspect = require('../../utility.js').makeInspect({ depth: 2, compact: false /* true */ });
const nodeFs = require('fs').promises;
const nodePath = require('path');
const mongoose = require('mongoose');

const FsEntry = require('./filesys-entry.js');

let dirSchema = new mongoose.Schema({ }, { defaultFindQuery: { path: undefined } });

dirSchema.static('iterate', async function* iterate(options = {}) {
	try {
		const newDoc = await this.findOrCreate(options.path);
		yield newDoc;
		yield* newDoc.iterate({ ...options, path: undefined });
	} catch (e) {
		debug.error(`Error creating top level Dir to .iterate(): ${e.stack||e}`)
	}
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

dirSchema.method('read', async function* read() {
	for /*await*/ (const dirent of (await nodeFs.readdir/*opendir*/(this.path))) {
		if (dirent != '.' && dirent != '..')
			yield await FsEntry.findOrCreate(nodePath.join(this.path, dirent/*.name*/), this._id);
	}
});

module.exports = FsEntry.discriminator('dir', dirSchema);

debug(`Dir: ${inspect(module.exports)}, Dir.prototype: ${inspect(module.exports.prototype)}`);

"use strict";
const log = require('@jbowwww/log').disable('debug');
const inspect = require('../../utility.js').makeInspect({ depth: 1, compact: false /* true */ });
const nodeFs = require('fs').promises;
const nodePath = require('path');
const mongoose = require('mongoose');

var statSchema = new mongoose.Schema({
	"dev" : Number,
	"mode" : Number,
	"nlink" : Number,
	"uid" : Number,
	"gid" : Number,
	"rdev" : Number,
	"blksize" : { type: Number, required: true, default: null },
	"ino" : Number,
	"size" : Number,
	"blocks" : { type: Number, required: true, default: null },
	"atime" : Date,
	"mtime" : Date,
	"ctime" : Date,
	"birthtime" : Date,
	"atimeMs" : Number,
	"mtimeMs" : Number,
	"ctimeMs" : Number,
	"birthtimeMs" : Number
}, {
	_id: false 
});

var fsEntry = new mongoose.Schema({
	path: { type: String, unique: true, index: true, required: true }, 
	dir: { type: mongoose.SchemaTypes.ObjectId, ref: 'dir' },
	partition: { type: mongoose.SchemaTypes.ObjectId, ref: 'partition' },
	stats: { type: statSchema, required: false/*true, default: null*/ },
	fileType: { type: mongoose.SchemaTypes.String, required: false }
}, {
	discriminatorKey: 'fileType',
	defaultFindQuery: { path: undefined },
	// toObject: { getters: true }
});

fsEntry.plugin(require('../plugin/standard.js'));

const baseFindOrCreate = fsEntry.statics.findOrCreate;
fsEntry.static('findOrCreate', async function findOrCreate(path, dir) {
	if (typeof path !== 'string') throw new TypeError(`fsEntry.findOrCreate(): path should be a String but is a '${typeof path}'`);
	const stats = await nodeFs.lstat(path);
	// if (!dir) {
	// dir = nodePath.dirname(path);	
	// }
	if (dir instanceof mongoose.Document)
		dir = dir._id;
	const fsEntry = await baseFindOrCreate.call(this, {
		path,
		dir,
		stats,
		fileType: stats.isDirectory() ? 'dir' : stats.isFile() ? 'file' : 'unknown'
	});
	return fsEntry;
});

fsEntry.method('hasFileChanged', function() {
	return this.hasUpdatedSince(this.stats.mtime);
});

module.exports = mongoose.model('fs', fsEntry);

log.debug(`FsEntry: ${inspect(module.exports)}, FsEntry.prototype: ${inspect(module.exports.prototype)}, FsEntry.schema.childSchemas=${inspect(module.exports.schema.childSchemas, { depth: 2 })}	`);	//fsEntry: ${inspect(fsEntry)}, 

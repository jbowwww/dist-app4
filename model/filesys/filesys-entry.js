"use strict";
const log = require('@jbowwww/log').disable('debug');
const inspect = require('../../utility.js').makeInspect({ depth: 1, compact: false /* true */ });
const nodeFs = require('fs').promises;
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
});

fsEntry.plugin(require('../plugin/standard.js'));

/* TODO: Queue a function (runs on construct/create(?) that if stat is not set, will do the stat,
 * allowing user to create file objects directly just by giving path
 */

const baseFindOrCreate = fsEntry.statics.findOrCreate;
fsEntry.static('findOrCreate', async function findOrCreate(path, dir) {
	if (typeof path !== 'string') throw new TypeError(`fsEntry.findOrCreate(): path should be a String but is a '${typeof path}'`);
	const stats = await nodeFs.lstat(path);
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

const FsEntry = mongoose.model('fs', fsEntry);
module.exports = FsEntry;
log.debug(`FsEntry: ${inspect(FsEntry)}, FsEntry.prototype: ${inspect(FsEntry.prototype)}, FsEntry.schema.childSchemas=${inspect(FsEntry.schema.childSchemas, { depth: 2 })}	`);

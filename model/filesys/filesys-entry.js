"use strict";
const log = require('@jbowwww/log');//('model/filesys/filesys-entry');
const inspect = require('../../utility.js').makeInspect({ depth: 1, compact: false /* true */ });
const _ = require('lodash');
const Q = require('q');
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
	stats: { type: statSchema, required: false/*true, default: null*/ }
}, {
	discriminatorKey: 'fileType',
	defaultFindQuery: { path: undefined },
	// toObject: { getters: true }
});

fsEntry.plugin(require('../plugin/standard.js'));
fsEntry.plugin(require('../plugin/bulk-save.js'));
fsEntry.plugin(require('../plugin/artefact.js'));
// fsEntry.plugin(require('../plugin/stat.js'), { data: { save: {}, validate: {}, bulkSave: {}, ensureCurrentHash: {} } });

// fsEntry.queue('onCreate', []);

// fsEntry.pre('save', async function preSave() {
// 	await this.depopulate('dir');
// })
// fsEntry.static('create', async function create({ path, stats }, options = {}) {
// 	if (typeof path !== 'string') throw new TypeError(`fsEntry.create needs at least { path }`);
// 	options = {
// 		filter: item => true,
// 		...options
// 	};
// 	// try {
// 		if (!stats)
// 			stats = await nodeFs.lstat(path);
// 		const newDoc = new (
// 			stats.isFile() ? File
// 		 : 	stats.isDirectory() ? Dir
// 		 : 	FsEntry
// 		)({ path, stats });
// 		return newDoc;
// 	// } catch (e)
// });

// const baseFindOrCreate = fsEntry.statics,findOrCreate;
// fsEntry.static('findOrCreate', function findOrCreate() {
// 	var cb, query, data, model = this, options = {
// 		saveImmediate: false,			// if true, calls doc.save() immediately after creation or after finding the doc 
// 		query: undefined				// if not specified, tries to find a findOrCreate default query defined by the schema, or then if data has an _id, use that, or lastly by default query = data 
// 	};
// 	_.forEach(args, (arg, i) => {
// 		if (typeof arg === 'object') {
// 			if (!data) data = arg;
// 			else options = { ...options, ...arg };
// 		} else if (typeof arg === 'function') {
// 			cb = arg;
// 		} else {
// 			throw new TypeError(`findOrCreate accepts args data[, options][, cb]. Unexpected parameter type ${typeof arg} for arg #${i}. (args=${inspect(args)})`);
// 		}
// 	});

// 	// I don't think the parsing/defaulting logic here is correct
// 	if (!options.query)
// 		options.query = schema.get('defaultFindQuery') || (data._id ? { '_id': data._id } : _.clone(data));
// 	if (_.isArray(options.query) && _.each(options.query, v => typeof v === 'string'))
// 		options.query = _.pick(data, options.query);
// 	else if (_.isObject(options.query))
// 		options.query = _.mapValues(schema.get('defaultFindQuery'),
// 			(v, k) => v === undefined ? data[k] : v);

// });

// fsEntry.method('onCreate', async function doCreate() {
// 	if (++doCreateLevel > doCreateLevelHigh)
// 	 	doCreateLevelHigh = doCreateLevel;
// 	const doc = this;
// 	var model = doc.constructor;
// 	// discriminatorKey && doc && model && doc[discriminatorKey] && model.discriminators && model.discriminators[doc[discriminatorKey]] && (model = model.discriminators[doc[discriminatorKey]]);
// 	const Dir = mongoose.model('dir');
// 	const Partition = mongoose.model('partition');
	
// 	if (!doc.stats) {
// 		// keep this? it seems less than ideal and it didn't entirely pan out - i think i need
// 		// to set the .stats upon creation so it knows what type to create (dir or file)
// 		console.assert(doc.isNew, `fsEntry doc missing .stats and isNew == false: doc=${this}`);
// 		log.verbose(`doc.stats doesn't exist for path '${this.path}' _id=${this._id}, creating...`);
// 		doc.set('stats', await nodeFs.lstat(doc.path));
// 	}
// 	if (!doc.fileType) {
// 		// this i may keep to avoid having to explicitly set the .fileType - no wait then again
// 		// it won't help creating the document for same reason as above, and after that it is
// 		// redundant since (when working correctly) the document itself's type will indicate dir or file
// 		// possibly keep as convenience property to avoid (doc instanceof Dir) although that syntax isn't too bad
// 		// also might be necessary (to have .fileType, wherever it is set) because upon hydration from DB
// 		// .stats won't be an instance of the node fs.Stats type, it will be a POJO without .isFile and .isDir()
// 		console.assert(doc.isNew, `fsEntry doc missing .fileType and isNew == false: doc=${this}`);
// 		log.verbose(`doc.fileType doesn't exist for path '${this.path}' _id=${this._id}, creating...`);
// 		log.debug(`doc.stats.isDirectory: ${typeof doc.stats.isDirectory} doc.stats: ${typeof doc.stats} doc: ${typeof doc}`);
// 		doc.set('fileType', this.stats.isDirectory() ? 'dir' : this.stats.isFile() ? 'file' : 'unknown');
// 	}
// 	log.debug(`[model ${model.modelName}].post('construct'): doCreateLevel=${doCreateLevel}(high=${doCreateLevelHigh}) disks.count=${await mongoose.model('disk').count()}, partitions.count=${await mongoose.model('partition').count()}\nfs.isNew=${doc.isNew} doc.isModified()=${doc.isModified()} doc.fileType='${doc.fileType}'\n`);// doc=${inspect(doc)})\n`);

// 	// TODO: Query helper method that caches queries - e.g. Dir.findOne({ path: '...' }).useCache().then(dir => { })
// 	// TODO: useCache() not working, seems to be responsible fo rmost fs entries having undefined or null dir and partition members'
// 	// TODO: Try mongoose-redis-cache(should be ok with being a query.lean() as required, as doesn't call doc instance methods
// 	// TODO: Could ALso be optimised aside from the cache, Partition.find() and maybe subsequent _.find can be executed in parallel
// 	// using Promise.all(). Could store Partiton.find({}) once and reuse for TTL or indefinitely (effectively a cache of partitions only)
// 	return ((doc.dir || Dir/*.find()*/.findOne({ path: nodePath.dirname(doc.path) }))/*.useCache()*/
// 	.then(dir => dir ? _.assign(doc, { dir: dir._id, partition: dir.partition ? dir.partition._id : undefined }) :
// 		Partition.find({})/*.useCache()*/.then(partitions => _.find( _.reverse( _.sortBy( 
// 			_.filter( partitions, partition => typeof partition.mountpoint === 'string'),
// 			partition => partition.mountpoint.length)),
// 			partition => doc.path.startsWith(partition.mountpoint)))
// 		.then(partition => _.assign(doc, { partition: partition._id }))));

// 	// count() returns the query object. Need to .exec() ? and maybe await ?
// 	// .tap(() => console.log.debug(`[model ${model.modelName}].doCreate: doCreateLevel=${doCreateLevel}(high=${doCreateLevelHigh}) - disks.count=${inspect(mongoose.model('disk').count(), { compact: true })}, partitions.count=${inspect(mongoose.model('partition').count(), { compact: true })} - fs.isNew=${doc.isNew} doc.isModified()=${doc.isModified()} doc.fileType='${doc.fileType}' doc=${inspect(doc)}`))
// 	// .finally(() => { doCreateLevel--; }));
// });

// const discriminatorKey = fsEntry.get('discriminatorKey');

// fsEntry.post('init', function() {
// 	this.populate([{ path: 'dir', select: 'path _ts' }, { path: 'partition' }])
// 	.execPopulate()
// 	.tap(() => console.log.debug(`[model ${this.constructor.modelName}].post('init').populated: this=${inspect(this)}`));
// });

// how to queue up a method for execution after a document / model instance is created 
// I think this fires on creation of any document, whether retrieved from DB or newly created (unlike post init, which is when fetched from db) - just check doc.isNew
// Have gone back to post('construct') for now
// fsEntry.queue('doCreate', []);

var doCreateLevel = 0;
var doCreateLevelHigh = 0;

fsEntry.method('hasFileChanged', function() {
	return this.hasUpdatedSince(this.stats.mtime);
});

module.exports = mongoose.model('fs', fsEntry);

log.debug(`FsEntry: ${inspect(module.exports)}, FsEntry.prototype: ${inspect(module.exports.prototype)}, FsEntry.schema.childSchemas=${inspect(module.exports.schema.childSchemas, { depth: 2 })}	`);	//fsEntry: ${inspect(fsEntry)}, 

"use strict";
const log = require('@jbowwww/log').disable('debug');//('model/plugin/standard');
const inspect = require('../../utility.js').makeInspect({ depth: 2, compact: false /* true */ });
const _ = require('lodash');
const { promisePipe, artefactDataPipe, writeablePromiseStream, chainPromiseFuncs, nestPromiseFuncs, tap, iff, streamPromise }  = require('../../promise-pipe.js');
const mongoose = require('mongoose');
const { Document, SchemaTypes } = mongoose;

const plugins = {
	timestamp: require('./timestamp.js'),
	customHooks: require('./custom-hooks.js'),
	stat: require('./stat.js')
};

/* Standard/common schema methods, statics
 */
module.exports = function standardSchemaPlugin(schema, options) {

	var discriminatorKey = schema.get('discriminatorKey');
	// log.debug(`standardSchemaPlugin(): options=${inspect(options)}, schema.obj='${inspect(schema.obj)}'`);	//, schema.prototype=${inspect(schema.prototype)}, this=${inspect(this)}`);

	schema.add({
		'_artefactId': { type: SchemaTypes.ObjectID, required: false, default: undefined }
	});
	schema.plugin(plugins.timestamp);	// made my own timestamp plugin because i wanted a checkedAt field, not just create and update. Also has some utility methods.
	schema.plugin(plugins.customHooks);	// ^ Allows pre and post hooks on any methods (instance and static), instead of just a few like mongoose does by default
										// Might want to modify it so it only adds hooks for methods when middleware is registered for the method, for performance reasons
										// Alternatively: Change static and method methods in customHooks so instead of always using pre and post, unless using
										// hooks is necessary, it just creates stat entries, and creates schema method wrappers that increase stat counters
	const trackedMethods = {
		instance: [ "validate", "save", "bulkSave", "updateDocument" ],
		static: [ "create", "findOrCreate", "upsert" ]
	};
	schema.plugin(plugins.stat, trackedMethods.instance);
	_.forEach(trackedMethods.instance, function(methodName) {
		schema.pre(methodName, function(next) {
			var doc = this instanceof mongoose.Document ? this : null;
			var model = doc ? doc.constructor : this;
			if (discriminatorKey && doc && doc[discriminatorKey]
			 && model && model.discriminators
			 && model.discriminators[doc[discriminatorKey]])
				model = model.discriminators[doc[discriminatorKey]];
			var eventName = 'pre.' + methodName;
			if (model) {
				model.emit(eventName, doc);
				model._stats[methodName].calls++;
			}
			if (doc) {
				doc.emit(eventName);			// i wonder what this gets bound as? in any case shuld be the doc
				var actionType = /*doc instanceof mongoose.Document ?*/ doc.isNew ? 'create' : doc.isModified() ? 'update' : 'check' /*: 'static'*/;
				model._stats[methodName][actionType]++;
			}
			log.debug(`[doc ${model.modelName}].pre('${methodName}'): doc=${inspect(doc)} model._stats.${methodName}=${inspect(model._stats[methodName])}`);	// doc=${doc._id}  doc._actions=${inspect(doc._actions)}
			next();
		});
		schema.post(methodName, function(res, next) {
			var doc = this instanceof mongoose.Document
			 ? 	this
			 : 	res instanceof mongoose.Document
			 	? res : null;
			var model = doc ? doc.constructor : this;
			if (discriminatorKey && doc && doc[discriminatorKey]
			 && model && model.discriminators
			 && model.discriminators[doc[discriminatorKey]])
				model = model.discriminators[doc[discriminatorKey]];
			var eventName = 'post.' + methodName;
			if (model) {
				model.emit(eventName, doc, res);
				model._stats[methodName].success++;
			}
			if (doc)
				doc.emit(eventName, res);
			log.debug(`[doc ${model.modelName}].post('${methodName}'): doc=${doc._id||doc} res=${inspect(res)} model._stats.${methodName}=${inspect(model._stats[methodName])}`);
			next();
		});
		schema.post(methodName, function(err, res, next) {
			var doc = this instanceof mongoose.Document
			 ? 	this
			 : res instanceof mongoose.Document
			 	? res : null;
			var model = doc.constructor;
			if (discriminatorKey && doc && doc[discriminatorKey]
			 && model && model.discriminators
			 && model.discriminators[doc[discriminatorKey]])
				model = model.discriminators[doc[discriminatorKey]];
			log.error(`[doc ${model.modelName}].post('${methodName}') ERROR: doc=${doc?doc._id:doc} res=${inspect(res)} model._stats.${methodName}=${inspect(model._stats[methodName])}: error: ${err?err.stack:err}`);
			var eventName = 'err.' + methodName;
			// at some point mongoose added its own Model.sonmething emitter that emits 'error', check it out
			if (model) {
				model.emit(eventName, doc, err);
				model._stats[methodName].errors.push(err);
			}
			if (doc)
				doc.emit(eventName, err);
			return next(err);
		});
	});

	schema.plugin(plugins.stat, trackedMethods.static);
	_.forEach(trackedMethods.static, function(methodName) {
		schema.pre(methodName, function(/*doc,*/ next) {
			this.emit('pre.' + methodName/*, doc*/);
			this._stats[methodName].calls++;
			next();	// something wrong with my implementation of [Model].static? I'm not getting a next() function from findOrCreate, and maybe 
		});
		schema.post(methodName, function(res, next) {
			this.emit('post.' + methodName, res);
			this._stats[methodName].success++;
			log.debug(`[model ${this.modelName}].post('${methodName}'): res=${inspect(res)} model._stats.${methodName}=${inspect(this._stats[methodName])}`);
			next();
		});
		schema.post(methodName, function(err, res, next) {
			this.emit('err.' + methodName, res, err);
			this._stats[methodName].errors.push(err);
			log.error(`[model ${this.modelName}].post('${methodName}') ERROR: res=${inspect(res)} model._stats.${methodName}=${inspect(this._stats[methodName])}: error: ${err.stack||err}`);
			return next(err);
		});
	});

	schema.static('construct', function construct(data, cb) {
		// var discriminatorKey = schema.get('discriminatorKey');
		var discriminator = discriminatorKey ? data[discriminatorKey] : undefined;
		var model = discriminatorKey && this.discriminators[discriminatorKey]
			? this.discriminators[discriminatorKey]
		 	: this;
		return new (model)(data);
		cb(data);
	});

	
	schema.method('isCheckedSince', function isCheckedSince(timestamp) {
		if (timestamp instanceof Document)
			timestamp = timestamp._ts;
		return 	_.isDate(timestamp) 
		 &&		!this.isNew
		 && 	this._ts.checkedAt
		 && 	this._ts.checkedAt > timestamp;
	});

	schema.method('isUpdatedSince', function(timestamp) {
		if (timestamp instanceof Document)
			timestamp = timestamp._ts;
		return _.isDate(timestamp)
		 && 	!this.isNew
		 && 	((this._ts.updatedAt
		 && 	this._ts.updatedAt >= timestamp)
		 || 	(this._ts.checkedAt && this._ts.checkedAt >= timestamp));
	});

	schema.static('findOrCreate', async function findOrCreate(...args) {
		var cb, query, data, model = this, options = {
			saveImmediate: false,			// if true, calls doc.save() immediately after creation or after finding the doc 
			query: undefined				// if not specified, tries to find a findOrCreate default query defined by the schema, or then if data has an _id, use that, or lastly by default query = data 
		};
		_.forEach(args, (arg, i) => {
			if (typeof arg === 'object') {
				if (!data) data = arg;
				else options = { ...options, ...arg };
			} else if (typeof arg === 'function') {
				cb = arg;
			} else {
				throw new TypeError(`findOrCreate accepts args data[, options][, cb]. Unexpected parameter type ${typeof arg} for arg #${i}. (args=${inspect(args)})`);
			}
		});

		// I don't think the parsing/defaulting logic here is correct
		if (!options.query)
			options.query = schema.get('defaultFindQuery') || (data._id ? { '_id': data._id } : _.clone(data));
		if (_.isArray(options.query) && _.each(options.query, v => typeof v === 'string'))
			options.query = _.pick(data, options.query);
		else if (_.isObject(options.query))
			options.query = _.mapValues(schema.get('defaultFindQuery'),
				(v, k) => v === undefined ? data[k] : v);
		
		let r = await model.findOne(options.query);
		if (r) log.verbose(`[model ${model.modelName}(dk(${discriminatorKey})=${data[discriminatorKey]})].findOrCreate(): doc found = ${inspect(r)}, update to data=${inspect(data)};`);
		else log.verbose(`[model ${model.modelName}(dk(${discriminatorKey})=${data[discriminatorKey]})].findOrCreate(): doc not found, creating with data=${inspect(data)};`);
		if (r) {
			r.set(data); // does this always update the db ?? // await r.updateDocument(data);
			// await r.save();
		}
		else {
			r = await new model(data);//model.construct(data)
		}
		// if (options.saveImmediate)
		// r = await r.save();
		log.debug(`[model ${model.modelName}.findOrCreate(): options=${inspect(options, { depth:3, compact: true })} defaultFindQuery=${inspect(schema.get('defaultFindQuery'), { compact: true })}': (inherited?)model='${(model.modelName)}'`);
		return r;
	});


	/* Updates an (in memory, not DB) document with values in the update parameter,
	 * but only marks paths as modified if the (deep-equal) value actually changed
	 * I think mongoose is supposed to be able to doc.set() and only mark paths and subpaths that have actually changed, 
	 * but it hasn't wqorked for me in the past, so i wrote my own. */
	// schema.method('updateDocument', async function updateDocument(update, pathPrefix = '') {
	// 	var model = this.constructor;
	// 	if (pathPrefix !== '' && !pathPrefix.endsWith('.'))
	// 		pathPrefix += '.';
	// 	_.forEach(update, (updVal, propName) => {
	// 		var fullPath = pathPrefix + propName;
	// 		var docVal = this.get(fullPath);
	// 		var schemaType = this.schema.path(fullPath);
	// 		if (schemaType && ([ 'Embedded', 'Mixed', 'Map', 'Array', 'DocumentArray', 'ObjectID' ].includes(schemaType.instance))) {
	// 			log.debug(`[model ${model.modelName}].updateDocument: ${fullPath}: ${schemaType.instance}, use ._id: ${(schemaType.options.ref && schemaType.instance === 'ObjectID' && updVal && updVal._id)}`);
	// 			this.updateDocument(schemaType.options.ref && schemaType.instance === 'ObjectID' && updVal /*&& updVal._id //? updVal._id : updVal, fullPath + '.');
	// 		// } else*/
	// 		 if (!_.isEqual(docVal, updVal)) {
	// 			log.debug(`[model ${model.modelName}].updateDocument: ${fullPath}: Updating ${docVal} to ${updVal} (schemaType: ${schemaType && schemaType.instance}`);
	// 			this.set(fullPath, updVal);
	// 		} else {
	// 			log.debug(`[model ${model.modelName}].updateDocument:${fullPath}: No update to ${docVal}`);
	// 		}
	// 	});
	// 	return this;
	// });

	// What is the difference between these methods and findOrCreate?? I think there was something but it may
	// be so subtle and minor that it is not worth having both
	schema.static('upsert', function upsert(...args) {

		var [ doc, options, cb ] = args;	// doc may be a mongoose doc or  POJO
		// var discriminatorKey = schema.get('discriminatorKey');
		var discriminator = discriminatorKey ? doc[discriminatorKey] : undefined;
		var model = discriminatorKey && discriminator && this.discriminators[discriminator] ? this.discriminators[discriminator] : this;

		var debugPrefix = `[model ${model.modelName}].upsert:`;//${discriminatorKey?`(discriminatorKey=${discriminatorKey})`:''}]`;

		if (!(doc instanceof mongoose.Document) && !_.isObject(doc)) {
				throw new TypeError(`Incorrect argument types for ${debugPrefix} expected:(object doc[, object options][, function cb]) received:${inspect(args)}`);
		}
		if (typeof options === 'function') {
			if (!cb) {
				cb = options; options = {};
			} else {
				throw new TypeError(`Incorrect argument types for ${debugPrefix} expected:(object doc[, object options][, function cb]) received:${inspect(args)}`);
			}
		} else if (options && typeof options !== 'object') {
			throw new TypeError(`Incorrect argument types for ${debugPrefix} expected:(object doc[, object options][, function cb]) received:${inspect(args)}`);
		}
		if (!options) {
			options = {};
		}
		
		var q = options.query || schema.get('defaultFindQuery');	// can i actually maybe use model.$where for this? see mongoose-notes.txt
		if (_.isArray(q) && _.each(q, v => typeof v === 'string')) {
			q = _.pick(doc, q);	
		} else if (_.isObject(q)) {
			q = _.mapValues(q, (v, k) => v === undefined ? doc[k] : v);
		}
		options = _.assign(_.omit(options, 'query'), { upsert: true });

		log.verbose(`${debugPrefix} options=${inspect(options, { depth: 3, compact: true })} defaultFindQuery=${inspect(schema.get('defaultFindQuery'), { compact: true })} doc=${inspect(doc, { depth: 1, compact: false })}`);

		return model.updateOne.call(model, q, doc, options, cb);		// or could also use bulkSave?  and use Query.prototype.getUpdate() / getQuery()

	});

	schema.method('upsert', function upsert(...args) {

		var [ options, cb ] = args;	// doc may be a mongoose doc or  POJO
		var doc = this;
		var model = doc.constructor;

		var debugPrefix = `[doc ${model.modelName}].upsert:`;//${discriminatorKey?`(discriminatorKey=${discriminatorKey})`:''}]`;

		if (!(doc instanceof mongoose.Document) && !_.isObject(doc)) {
			throw new TypeError(`Incorrect argument types for ${debugPrefix} expected:([object options][, function cb]) received:${inspect(args)}`);
		}
		if (typeof options === 'function') {
			if (!cb) {
				cb = options; options = {};
			} else {
				throw new TypeError(`Incorrect argument types for ${debugPrefix} expected:([object options][, function cb]) received:${inspect(args)}`);
			}
		} else if (options && typeof options !== 'object') {
			throw new TypeError(`Incorrect argument types for ${debugPrefix} expected:([object options][, function cb]) received:${inspect(args)}`);
		}
		if (!options) {
			options = {};
		}
		
		var q = options.query || schema.get('defaultFindQuery');	// can i actually maybe use model.$where for this? see mongoose-notes.txt
		if (_.isArray(q) && _.each(q, v => typeof v === 'string')) {
			q = _.pick(doc, q);	
		} else if (_.isObject(q)) {
			q = _.mapValues(q, (v, k) => v === undefined ? doc[k] : v);
		}
		options = _.assign(_.omit(options, 'query'), { upsert: true });

		log.verbose(`${debugPrefix} options=${inspect(options, { depth: 3, compact: true })} defaultFindQuery=${inspect(schema.get('defaultFindQuery'), { compact: true })} doc=${inspect(doc, { depth: 1, compact: false })}`);

		return Q(model.updateOne.call(model, q, doc, options, cb))/*.then(() => null)*/;		// or could also use bulkSave?  and use Query.prototype.getUpdate() / getQuery()

	});

	// use a cache for the current query
	schema.query.useCache = function useCache() {
		var q = this.getQuery();
		var jq = JSON.stringify(q);
		var r = schema._cache.get(jq);
		if (!r) {
			log.verbose(`useCache: new q '${inspect(q, { compact: true })}'`);
			return Q(this.exec()).then(r => {
				schema._cache.set(jq, { created: Date.now(), expires: null, hits: 0, result: r });
				return /*Q*/(r);
			});
		} else {
			log.verbose(`useCache: found '${inspect(q, { compact: true })}'`);
			return Q(r);
		}
	};
	schema._cache = new Map();

	schema.query.promisePipe = function promisePipe(...promiseFuncs) {
		return streamPromise(writeablePromiseStream(...promiseFuncs), { resolveEvent: 'finish' });
	};
};

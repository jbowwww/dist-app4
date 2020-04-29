"use strict";
const log = require('@jbowwww/log').disable('debug');//('model/plugin/standard');
const inspect = require('../../utility.js').makeInspect({ depth: 2, compact: false /* true */ });
const mongoose = require('mongoose');
const { Document, SchemaTypes } = mongoose;
const _ = require('lodash');

const plugins = {
	timestamp: require('./timestamp.js'),
	customHooks: require('./custom-hooks.js'),
	trackedMethods: require('./tracked-methods.js'),
	// stat: require('./stat.js')
};

const trackedMethods = {
	instance: [ "validate", "save", "bulkSave", "updateDocument" ],
	static: [ "create", "findOrCreate", "upsert" ]
};

/* Standard/common schema methods, statics
 */
module.exports = function standardSchemaPlugin(schema, options) {

	// var discriminatorKey = schema.get('discriminatorKey');
	log.debug(`standardSchemaPlugin(): options=${inspect(options)}, schema.obj='${inspect(schema.obj)}'`);	//, schema.prototype=${inspect(schema.prototype)}, this=${inspect(this)}`);

	schema.add({
		'_artefactId': { type: SchemaTypes.ObjectID, required: false, default: undefined }
	});
	schema.plugin(plugins.timestamp);	// made my own timestamp plugin because i wanted a checkedAt field, not just create and update. Also has some utility methods.
	schema.plugin(plugins.customHooks);	// ^ Allows pre and post hooks on any methods (instance and static), instead of just a few like mongoose does by default
										// Might want to modify it so it only adds hooks for methods when middleware is registered for the method, for performance reasons
										// Alternatively: Change static and method methods in customHooks so instead of always using pre and post, unless using
										// hooks is necessary, it just creates stat entries, and creates schema method wrappers that increase stat counters
	schema.plugin(plugins.trackedMethods, trackedMethods);	// track some method stats

	// schema.static('construct', function construct(data, cb) {
	// 	// var discriminatorKey = schema.get('discriminatorKey');
	// 	var discriminator = discriminatorKey ? data[discriminatorKey] : undefined;
	// 	var model = discriminatorKey && this.discriminators[discriminatorKey]
	// 		? this.discriminators[discriminatorKey]
	// 	 	: this;
	// 	return new (model)(data);
	// 	cb(data);
	// });

	
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
		args.forEach((arg, i) => {
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
		if (r) log.verbose(`[model ${model.modelName}].findOrCreate(): doc found = ${inspect(r)}, update to data=${inspect(data)};`);
		else log.verbose(`[model ${model.modelName}].findOrCreate(): doc not found, creating with data=${inspect(data)};`); 		//(dk(${discriminatorKey})=${data[discriminatorKey]})
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
	// schema.static('upsert', function upsert(...args) {

	// 	var [ doc, options, cb ] = args;	// doc may be a mongoose doc or  POJO
	// 	// var discriminatorKey = schema.get('discriminatorKey');
	// 	var discriminator = discriminatorKey ? doc[discriminatorKey] : undefined;
	// 	var model = discriminatorKey && discriminator && this.discriminators[discriminator] ? this.discriminators[discriminator] : this;

	// 	var debugPrefix = `[model ${model.modelName}].upsert:`;//${discriminatorKey?`(discriminatorKey=${discriminatorKey})`:''}]`;

	// 	if (!(doc instanceof mongoose.Document) && !_.isObject(doc)) {
	// 			throw new TypeError(`Incorrect argument types for ${debugPrefix} expected:(object doc[, object options][, function cb]) received:${inspect(args)}`);
	// 	}
	// 	if (typeof options === 'function') {
	// 		if (!cb) {
	// 			cb = options; options = {};
	// 		} else {
	// 			throw new TypeError(`Incorrect argument types for ${debugPrefix} expected:(object doc[, object options][, function cb]) received:${inspect(args)}`);
	// 		}
	// 	} else if (options && typeof options !== 'object') {
	// 		throw new TypeError(`Incorrect argument types for ${debugPrefix} expected:(object doc[, object options][, function cb]) received:${inspect(args)}`);
	// 	}
	// 	if (!options) {
	// 		options = {};
	// 	}
		
	// 	var q = options.query || schema.get('defaultFindQuery');	// can i actually maybe use model.$where for this? see mongoose-notes.txt
	// 	if (_.isArray(q) && _.each(q, v => typeof v === 'string')) {
	// 		q = _.pick(doc, q);	
	// 	} else if (_.isObject(q)) {
	// 		q = _.mapValues(q, (v, k) => v === undefined ? doc[k] : v);
	// 	}
	// 	options = _.assign(_.omit(options, 'query'), { upsert: true });

	// 	log.verbose(`${debugPrefix} options=${inspect(options, { depth: 3, compact: true })} defaultFindQuery=${inspect(schema.get('defaultFindQuery'), { compact: true })} doc=${inspect(doc, { depth: 1, compact: false })}`);

	// 	return model.updateOne.call(model, q, doc, options, cb);		// or could also use bulkSave?  and use Query.prototype.getUpdate() / getQuery()

	// });

	// schema.method('upsert', function upsert(...args) {

	// 	var [ options, cb ] = args;	// doc may be a mongoose doc or  POJO
	// 	var doc = this;
	// 	var model = doc.constructor;

	// 	var debugPrefix = `[doc ${model.modelName}].upsert:`;//${discriminatorKey?`(discriminatorKey=${discriminatorKey})`:''}]`;

	// 	if (!(doc instanceof mongoose.Document) && !_.isObject(doc)) {
	// 		throw new TypeError(`Incorrect argument types for ${debugPrefix} expected:([object options][, function cb]) received:${inspect(args)}`);
	// 	}
	// 	if (typeof options === 'function') {
	// 		if (!cb) {
	// 			cb = options; options = {};
	// 		} else {
	// 			throw new TypeError(`Incorrect argument types for ${debugPrefix} expected:([object options][, function cb]) received:${inspect(args)}`);
	// 		}
	// 	} else if (options && typeof options !== 'object') {
	// 		throw new TypeError(`Incorrect argument types for ${debugPrefix} expected:([object options][, function cb]) received:${inspect(args)}`);
	// 	}
	// 	if (!options) {
	// 		options = {};
	// 	}
		
	// 	var q = options.query || schema.get('defaultFindQuery');	// can i actually maybe use model.$where for this? see mongoose-notes.txt
	// 	if (_.isArray(q) && _.each(q, v => typeof v === 'string')) {
	// 		q = _.pick(doc, q);	
	// 	} else if (_.isObject(q)) {
	// 		q = _.mapValues(q, (v, k) => v === undefined ? doc[k] : v);
	// 	}
	// 	options = _.assign(_.omit(options, 'query'), { upsert: true });

	// 	log.verbose(`${debugPrefix} options=${inspect(options, { depth: 3, compact: true })} defaultFindQuery=${inspect(schema.get('defaultFindQuery'), { compact: true })} doc=${inspect(doc, { depth: 1, compact: false })}`);

	// 	return Q(model.updateOne.call(model, q, doc, options, cb))/*.then(() => null)*/;		// or could also use bulkSave?  and use Query.prototype.getUpdate() / getQuery()

	// });

	// // use a cache for the current query
	// schema.query.useCache = function useCache() {
	// 	var q = this.getQuery();
	// 	var jq = JSON.stringify(q);
	// 	var r = schema._cache.get(jq);
	// 	if (!r) {
	// 		log.verbose(`useCache: new q '${inspect(q, { compact: true })}'`);
	// 		return Q(this.exec()).then(r => {
	// 			schema._cache.set(jq, { created: Date.now(), expires: null, hits: 0, result: r });
	// 			return /*Q*/(r);
	// 		});
	// 	} else {
	// 		log.verbose(`useCache: found '${inspect(q, { compact: true })}'`);
	// 		return Q(r);
	// 	}
	// };
	// schema._cache = new Map();

	// schema.query.promisePipe = function promisePipe(...promiseFuncs) {
	// 	return streamPromise(writeablePromiseStream(...promiseFuncs), { resolveEvent: 'finish' });
	// };
};

"use strict";
const debug = require('debug')('model/plugin/artefact');
const inspect = require('../../utility.js').makeInspect({ depth: 3, compact: false /* true */ });
const util = require('util');
// const _ = require('lodash');
const mongoose = require('mongoose');
// mongoose.set('debug', true);
const { /*promisePipe,*/ artefactDataPipe, chainPromiseFuncs, iff, tap } = require('../../promise-pipe.js');
const Artefact = require('../../Artefact.js');

module.exports = function artefactSchemaPlugin(schema, ctorFunc) {

	// NEW !@@
	schema.method.FromTypes = function FromTypes(	ctorFunc) {
		return ctorFunc(Artefact((this)));
	};
	
	// console.debug(`artefactSchemaPlugin(): schema=${inspect(schema)}, options=${inspect(options)}, this=${inspect(this)}`);
	
	schema.add({
		// _artefact: { type: mongoose.SchemaTypes.Mixed, required: false, default: undefined },
		_primary: { type: mongoose.SchemaTypes.ObjectId, refPath: '_primaryType', required: false, default: undefined },
		_primaryType: { type: String, required: false/*true*/, default: undefined }
	});
	// schema.virtual('_artefact');


	schema.query.asArtefact = async function asArtefact(options = {})
	{
		return this.exec().map(a => a.getArtefact)
	};

	// Dont think going to use this ultimately. Original thought was to allow syntax like Artefact.File.findOrCreate()
	// but why not just use [new] Artefact(File.findOrCreate())
	// or if declaring/building pipelines using arrays of funcs, instead of manually writing pipelines, use Artefact(File.findOrCreate)
	// schema.on('init', function(model) {
	// 	Artefact[model.modelName] = model;
	// });\
	// schema.static('Artefact', function )

	/* Get an artefact associated with a given document. It is an object comprised of documents, indexed by model name.
	 * Currently creates a new object on each call. Probably actually want to use a WeakMap to cache artefact objects already created.
	 * Should I make an Artefact class/ctor&proto instead of constructing an object literal like I currently am? Quite possibly
	 */
	schema.method('getArtefact', async function getArtefact(options = {}, cb) {
		
		if (typeof options === 'function') {
			cb = options;
			options = {}
		} /*else if (!(typeof cb === 'function')) {
			throw new TypeError(`getArtefact: callback cb must be supplied`);
		}*/
		console.verbose(`getArtefact(${inspect(options)}, ${inspect(cb)}) this=${inspect(this)}`)
		const doc = this;
		const docModel = this.constructor; //dk && typeof dk === 'string' && dk.length>0 && doc[dk] && oldModel.discriminators[doc[dk]] ? oldModel.discriminators[doc[dk]] : oldModel;
		const docModelName = docModel.modelName;
		if (!doc._primary) {
			doc._primary = doc;
			doc._primaryType = docModelName;
		}

		const allModels = options.meta ? _.keys(options.meta) :
			_.filter(mongoose.modelNames(), modelName => {
				var m = mongoose.model(modelName);
				return m.discriminators === undefined && docModel.baseModelName != m.baseModelName && docModelName != m.baseModelName && docModel.baseModelName != modelName;
			});
		
		// let cacheKey = 'doc-' + doc._primary._id;//.toString();
		// let a = _artefacts[cacheKey];
		// console.debug(`getArtefact: doc._id=${doc._id} cacheKey=${cacheKey}\na=${inspect(a)}\n_artefacts=${inspect(_artefacts)}`);
		// if (!!a) { return a; } 
		// _artefacts[cacheKey] = {a:1};	// placeholder until artefact is created
		// var dk = schema.get('discriminatorKey');
		// var oldModel = this.constructor;
		
		function doMetaPipe(meta, promisePipe) {
			if (!promisePipe) {
				return Q(meta);
			}
			if (_.isArray(promisePipe)) {
				promisePipe = chainPromiseFuncs(promisePipe);
			} else if (typeof promisePipe !== 'function') {
				throw new TypeError(`doMetaPipe: promisePipe should be a function or array, but is a ${typeof promisePipe}`);
			}
			return Q(promisePipe(meta));
		}

		let a;	// instead of Obkject.create use Artefact? 
		try {
	
			a = Object.create({
				
				// get _primaryDataType() { return modelName; },
				// get _primaryDataId() { return doc._id; },
				// get _primaryData() { return doc; },

				// get [modelName]() { return doc; },
				
				[util.inspect.custom](depth, options) {
					return _.mapValues(this, (v, k) => v instanceof mongoose.Document ? v.toObject({ getters: true }) : v);
				},

				async save(opts) {
					try {
						opts = _.assign({
							maxBatchSize: 10,
							batchTimeout: 750
						}, opts);
						console.debug(`Artefact.save(opts=${inspect(opts, { compact: true })}: ${inspect(this, { compact: false })}`);
						return Promise.all(_.map(this, (data, dataName) => data.$__save(opts.meta && opts.meta[dataName] ? opts.meta[dataName] : opts)))
						.then(() => this);
						// await Promise.all(
						// 	_.map(allModels, dataName => this[dataName] && this[dataName].save(opts.meta && opts.meta[dataName] ? opts.meta[dataName] : opts))
						// )
						// return this;
					} catch (e) {
						console.error(`Artefact.save() error: ${e.stack||e}`)
					}
					// .then(() => this);
				},

				bulkSave(opts) {
					opts = _.assign({
						maxBatchSize: 10,
						batchTimeout: 750
					}, opts);
					console.debug(`Artefact.bulkSave(opts=${inspect(opts, { compact: true })}: ${inspect(this, { compact: false })}`);
					return Q.all(_.map(this, (data, dataName) => data.bulkSave(opts.meta && opts.meta[dataName] ? opts.meta[dataName] : opts)))
					.then(() => this);
				},

				addMetaData(modelName, data, promisePipe) {
					if (typeof modelName !== 'string') throw new TypeError('modelName must be a string');
					console.debug(`Artefact.addMetaData('${modelName}'): this=${inspect(this, { compact: false })}`);
					if (this[modelName]) {
						console.debug(`Artefact.addMetaData('${modelName}'): meta exists: ${inspect(this[modelName], { compact: false })}`);
						return Q(this);
					} else {
						var model = mongoose.model(modelName);
						if (!model) throw new Error(`model '${modelName}' does not exist`);
						return model.construct(_.assign({ /*_artefact: a,*/ _primary: doc, _primaryType: docModelName }, data))
						.then(meta => doMetaPipe(meta, promisePipe))
						.tap(meta => console.debug(`Artefact.addMetaData('${modelName}'): this=${inspect(this, { compact: false })}, meta=${inspect(meta, { compact: false })}`))
						.then(meta => Object.defineProperty(this, modelName, { writeable: true, enumerable: true, configurable: true, value: meta }));
					}
				},

				addOrFindMetaData(modelName, data, promisePipe) {
					var model = mongoose.model(modelName);
					return model.findOrCreate(_.assign({ /*_artefact: a,*/ _primary: doc, _primaryType: docModelName }, data))
					.then(meta => doMetaPipe(meta, promisePipe))
					.tap(meta => console.debug(`getArtefact: modelName=${modelName} modelName='${docModelName}': model=${model.count()} meta=${inspect(meta, { compact: false })}, promisePipe: ${promisePipe?'yes':'no'}`))
					.then(meta => Object.defineProperty(this, modelName, { writeable: true, enumerable: true, configurable: true, value: meta }));
				},

				findMetaData(modelName, promisePipe) {
					var model = mongoose.model(modelName);
					return model.findOne({ _primary: doc, _primaryType: docModelName })
					.then(meta => iff(meta, 
						meta => doMetaPipe(meta, promisePipe),
						tap(meta => console.debug(`getArtefact: modelName=${modelName} docModelName='${docModelName}': model=${model.count()} meta=${!meta?'(null)':inspect(meta, { compact: false })}`)),
						meta => Object.defineProperty(this, modelName, { writeable: true, enumerable: true, configurable: true, value: meta })));
				}

			}, {
				// _primaryDataType: { enumerable: true, value: modelName },
				// _primaryDataId: doc._id,
				// [docModel.baseModelName]: { writeable: true, enumerable: false, get() { return doc; } }, 
				[docModelName]: { writeable: true, enumerable: true, value: doc }
				// [util.inspect.custom](depth, options): { return }
			});
			// doc._artefact = a;
			// _artefacts[cacheKey] = a

			//(dk=${dk})
			console.debug(`[model ${docModelName}].getArtefact(): a=${inspect(/*_.clone*/(a), { depth: 5, compact: false })} allModels=${allModels.join(', ')} options=${inspect(options)}`);	

			await Promise.all(_.map(allModels, modelName => a[modelName] ? a[modelName] : a.findMetaData(modelName, options.meta ? options.meta[modelName] : undefined)));
			 console.verbose(`getArtefact: docModelName=${docModelName} allModels=[ ${allModels.map(mn=>mn).join(', ')} ] a=${inspect(a, { compact: false })}`);
			
			if (cb) await cb(a);
			// console.debug(`_artefacts=${inspect(_artefacts)}`)
			// delete _artefacts[cacheKey];
				 // })
		} catch (e) {
			console.warn(`getArtefact error: ${e.stack||e}`);
			// docModel._stats.errors.push(e);
		}
		return a;	
	});

	schema.query.getArtefacts = function getArtefacts(...args) {
		var model = this;
		var cursor = this.cursor({  transform: fs => Artefact(fs) });
		Object.defineProperty(cursor, 'promisePipe', { enumerable: true, value: function cursorPromisePipe(...args) {
			var fns = [];
			var options = null;
			_.forEach(args, (arg, i) => {
				if (typeof arg === 'object') {
					if (fns.length > 0 || options !== null) {
						throw new TypeError(`findArtefacts: object after functions`);
					}
					options = arg;
				} else if (typeof arg === 'function') {
					fns.push(arg);
				} else {
					throw new TypeError(`findArtefacts: args must be [object], [...functions]`);
				} 
			});
			options = _.defaults(options, { concurrency: 8 });
			console.debug(`[model ${modelName}].getArtefacts().promisePipe(): options=${inspect(options, { compact: true })} cursor=${inspect(cursor, { compact: false })}`);
			return promisePipe(cursor, options, ...fns);
		}});
		console.debug(`[model ${modelName}].getArtefacts(): options=${inspect(options, { compact: true })} cursor=${inspect(cursor, { compact: false })}`);
		return cursor;
	};

	schema.method('isCheckedSince', function isCheckedSince(timestamp) {
		if (!_.isDate(timestamp)) {
			throw new TypeError(`isCheckedSince: timestamp must be a Date`);
		}
		return !this.isNew && this._ts.checkedAt > timestamp;
	});

};
